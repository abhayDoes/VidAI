"""Unit tests for the AI video editing planner with FakeLLMProvider."""

import json
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
import pytest

from backend.editor.planner import (
    build_system_prompt,
    build_user_context,
    load_last_plan,
    plan_edit,
    update_plan_status,
)
from backend.editor.timeline import create_initial_timeline, save_timeline
from backend.llm.base import LLMProvider


class MultiResponseFakeProvider(LLMProvider):
    """Fake LLM provider that yields sequential canned responses."""

    def __init__(self, responses: List[Dict[str, Any]]):
        self.responses = list(responses)
        self.calls: List[Dict[str, str]] = []

    def generate_json(
        self,
        system: str,
        user: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.calls.append({"system": system, "user": user})
        if self.responses:
            return self.responses.pop(0)
        return {"operations": [], "message": "Default fallback"}


@pytest.fixture
def test_env():
    """Create a temporary environment with a valid timeline and captions."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        vid_id = "plan_vid_1"

        tl = create_initial_timeline(vid_id, 60.0)
        save_timeline(tl, base_dir=base_dir)

        # Write sample captions.json
        cap_file = base_dir / vid_id / "captions.json"
        cap_data = {
            "video_id": vid_id,
            "language": "en",
            "duration": 60.0,
            "captions": [
                {"id": 1, "start": 0.0, "end": 4.5, "text": "Welcome to our tutorial."},
                {"id": 2, "start": 5.0, "end": 12.0, "text": "Today we discuss video editing."},
            ],
        }
        with open(cap_file, "w", encoding="utf-8") as f:
            json.dump(cap_data, f)

        yield vid_id, base_dir


def test_planner_valid_output(test_env):
    """Planner receives valid output on first attempt and saves last_plan.json."""
    vid_id, base_dir = test_env

    canned = {
        "operations": [{"op": "trim_keep", "params": {"start": 5.0, "end": 20.0}}],
        "message": "Keeping video between 5s and 20s.",
    }
    provider = MultiResponseFakeProvider([canned])

    plan, errors = plan_edit("Keep between 5s and 20s", vid_id, provider, base_dir=base_dir)
    assert errors == []
    assert plan is not None
    assert len(plan.operations) == 1
    assert plan.operations[0].op == "trim_keep"

    # Verify last_plan.json exists and is pending
    record = load_last_plan(vid_id, base_dir=base_dir)
    assert record is not None
    assert record["status"] == "pending"
    assert record["prompt"] == "Keep between 5s and 20s"

    # Test update status
    updated = update_plan_status(vid_id, "approved", base_dir=base_dir)
    assert updated["status"] == "approved"


def test_planner_retry_on_invalid_then_fixed(test_env):
    """Planner detects invalid output, triggers retry, and succeeds with corrected output."""
    vid_id, base_dir = test_env

    # First attempt: invalid start > end
    invalid_resp = {
        "operations": [{"op": "cut_range", "params": {"start": 30.0, "end": 10.0}}],
        "message": "Bad cut",
    }
    # Second attempt: corrected
    valid_resp = {
        "operations": [{"op": "cut_range", "params": {"start": 10.0, "end": 30.0}}],
        "message": "Fixed cut from 10s to 30s.",
    }
    provider = MultiResponseFakeProvider([invalid_resp, valid_resp])

    plan, errors = plan_edit("Cut between 10 and 30", vid_id, provider, base_dir=base_dir)
    assert errors == []
    assert plan is not None
    assert len(provider.calls) == 2
    assert "validation errors" in provider.calls[1]["user"]
    assert plan.operations[0].params["start"] == 10.0


def test_planner_always_invalid(test_env):
    """Planner fails after retry if second attempt is also invalid."""
    vid_id, base_dir = test_env

    invalid_resp_1 = {
        "operations": [{"op": "unknown_tool", "params": {}}],
        "message": "Bad 1",
    }
    invalid_resp_2 = {
        "operations": [{"op": "another_bad_tool", "params": {}}],
        "message": "Bad 2",
    }
    provider = MultiResponseFakeProvider([invalid_resp_1, invalid_resp_2])

    plan, errors = plan_edit("Do magic", vid_id, provider, base_dir=base_dir)
    assert plan is None
    assert len(errors) > 0
    assert len(provider.calls) == 2


def test_planner_empty_operations(test_env):
    """Unsupported requests return 0 operations and informative message."""
    vid_id, base_dir = test_env

    canned = {
        "operations": [],
        "message": "Color grading is not currently supported. You can trim or cut video.",
    }
    provider = MultiResponseFakeProvider([canned])

    plan, errors = plan_edit("Make this look cinematic teal and orange", vid_id, provider, base_dir=base_dir)
    assert errors == []
    assert plan is not None
    assert len(plan.operations) == 0
    assert "Color grading" in plan.message


def test_system_prompt_contains_rules_and_registry():
    """System prompt includes hard rules and registry descriptions."""
    prompt = build_system_prompt()
    assert "UNTRUSTED DATA" in prompt
    assert "trim_keep" in prompt
    assert "cut_range" in prompt
    assert "reset" in prompt


def test_prompt_limits(test_env):
    """Empty prompts and oversized prompts are rejected immediately."""
    vid_id, base_dir = test_env
    provider = MultiResponseFakeProvider([])

    plan, errors = plan_edit("", vid_id, provider, base_dir=base_dir)
    assert plan is None
    assert "Prompt cannot be empty" in errors[0]

    plan, errors = plan_edit("a" * 1001, vid_id, provider, base_dir=base_dir)
    assert plan is None
    assert "exceeds maximum allowed length" in errors[0]

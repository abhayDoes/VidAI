"""Integration tests for Editor API endpoints using FastAPI TestClient."""

import tempfile
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from backend.editor.timeline import create_initial_timeline, save_timeline
from backend.llm.base import LLMProvider


class MockProvider(LLMProvider):
    def generate_json(self, system: str, user: str, json_schema=None):
        return {
            "operations": [{"op": "cut_range", "params": {"start": 5.0, "end": 15.0}}],
            "message": "Cut section from 5s to 15s.",
        }


@pytest.fixture
def api_client():
    return TestClient(app)


@pytest.fixture
def seeded_video_env(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        monkeypatch.setattr("backend.routers.editor._get_base_dir", lambda: base_dir)

        vid_id = "api_test_video"
        v_dir = base_dir / vid_id
        v_dir.mkdir(parents=True, exist_ok=True)

        tl = create_initial_timeline(vid_id, 50.0)
        save_timeline(tl, base_dir=base_dir)

        yield vid_id, base_dir


def test_get_timeline(api_client, seeded_video_env):
    """GET /videos/{id}/timeline returns current timeline."""
    vid_id, _ = seeded_video_env
    res = api_client.get(f"/videos/{vid_id}/timeline")
    assert res.status_code == 200
    data = res.json()
    assert data["video_id"] == vid_id
    assert data["total_duration"] == 50.0
    assert data["version"] == 1
    assert len(data["segments"]) == 1


def test_get_timeline_not_found(api_client, seeded_video_env):
    """GET /videos/{id}/timeline returns 404 if video does not exist."""
    res = api_client.get("/videos/non_existent_vid/timeline")
    assert res.status_code == 404


def test_create_plan_and_approve(api_client, seeded_video_env):
    """POST /videos/{id}/plan generates candidate plan; approve applies it."""
    vid_id, _ = seeded_video_env

    with patch("backend.routers.editor.get_provider", return_value=MockProvider()):
        # 1. Create plan
        plan_res = api_client.post(
            f"/videos/{vid_id}/plan",
            json={"prompt": "Remove from 5 to 15 seconds"},
        )
        assert plan_res.status_code == 200
        plan_data = plan_res.json()
        assert "plan_id" in plan_data
        assert len(plan_data["operations"]) == 1
        assert plan_data["operations"][0]["op"] == "cut_range"
        plan_id = plan_data["plan_id"]

        # Check that active timeline has NOT changed yet
        tl_res_1 = api_client.get(f"/videos/{vid_id}/timeline")
        assert tl_res_1.json()["total_duration"] == 50.0

        # 2. Approve plan
        appr_res = api_client.post(f"/videos/{vid_id}/plan/{plan_id}/approve")
        assert appr_res.status_code == 200
        appr_data = appr_res.json()
        assert appr_data["version"] == 2
        assert appr_data["total_duration"] == 40.0
        assert len(appr_data["segments"]) == 2

        # 3. Active timeline is now updated to version 2
        tl_res_2 = api_client.get(f"/videos/{vid_id}/timeline")
        assert tl_res_2.json()["total_duration"] == 40.0


def test_reject_plan(api_client, seeded_video_env):
    """POST /videos/{id}/plan/{id}/reject marks candidate plan as rejected."""
    vid_id, _ = seeded_video_env

    with patch("backend.routers.editor.get_provider", return_value=MockProvider()):
        plan_res = api_client.post(
            f"/videos/{vid_id}/plan",
            json={"prompt": "Remove from 5 to 15 seconds"},
        )
        plan_id = plan_res.json()["plan_id"]

        rej_res = api_client.post(f"/videos/{vid_id}/plan/{plan_id}/reject")
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "rejected"

        # Timeline remains version 1
        tl_res = api_client.get(f"/videos/{vid_id}/timeline")
        assert tl_res.json()["version"] == 1


def test_undo_timeline(api_client, seeded_video_env):
    """POST /videos/{id}/timeline/undo reverts to previous version."""
    vid_id, _ = seeded_video_env

    with patch("backend.routers.editor.get_provider", return_value=MockProvider()):
        # Create and approve edit (advances to version 2, dur 40s)
        plan_res = api_client.post(f"/videos/{vid_id}/plan", json={"prompt": "Cut 5-15"})
        plan_id = plan_res.json()["plan_id"]
        api_client.post(f"/videos/{vid_id}/plan/{plan_id}/approve")

        # Now undo
        undo_res = api_client.post(f"/videos/{vid_id}/timeline/undo")
        assert undo_res.status_code == 200
        undo_data = undo_res.json()
        # Dur restored to 50s, new version is 3
        assert undo_data["total_duration"] == 50.0
        assert undo_data["version"] == 3


def test_undo_timeline_no_history(api_client, seeded_video_env):
    """Undo returns 400 when no previous history version exists."""
    vid_id, _ = seeded_video_env
    res = api_client.post(f"/videos/{vid_id}/timeline/undo")
    assert res.status_code == 400
    assert "No previous timeline version" in res.json()["detail"]


def test_prompt_limits_api(api_client, seeded_video_env):
    """API enforces prompt max length."""
    vid_id, _ = seeded_video_env
    res = api_client.post(
        f"/videos/{vid_id}/plan",
        json={"prompt": "x" * 1001},
    )
    assert res.status_code == 422

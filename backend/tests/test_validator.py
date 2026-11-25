"""Unit tests for LLM plan validator."""

import pytest

from backend.editor.timeline import create_initial_timeline, total_duration
from backend.editor.validator import validate_plan


@pytest.fixture
def base_timeline():
    return create_initial_timeline("vid_test", 60.0)


def test_valid_plan_single_op(base_timeline):
    """Test standard single operation plan."""
    raw = {
        "operations": [
            {"op": "trim_keep", "params": {"start": 5.0, "end": 25.0}}
        ],
        "message": "Trimming video to keep between 00:05 and 00:25.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert errors == []
    assert plan is not None
    assert len(plan.operations) == 1
    assert plan.operations[0].op == "trim_keep"
    assert "Keep 00:05.0–00:25.0" in plan.operations[0].description
    assert total_duration(plan.resulting_timeline) == 20.0


def test_valid_plan_multiple_sequential_ops(base_timeline):
    """Test sequential operations where second op operates on first op's output."""
    raw = {
        "operations": [
            {"op": "cut_range", "params": {"start": 0.0, "end": 10.0}},   # duration becomes 50.0s
            {"op": "cut_range", "params": {"start": 10.0, "end": 20.0}},  # duration becomes 40.0s
        ],
        "message": "Cutting two sections.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert errors == []
    assert plan is not None
    assert len(plan.operations) == 2
    assert total_duration(plan.resulting_timeline) == 40.0


def test_sequential_bounds_validation(base_timeline):
    """Operation 2 must be checked against duration resulting from Operation 1."""
    # base_timeline is 60s
    raw = {
        "operations": [
            {"op": "trim_keep", "params": {"start": 0.0, "end": 20.0}},   # duration is now 20.0s
            {"op": "cut_range", "params": {"start": 25.0, "end": 30.0}},  # 25-30s is out of range!
        ],
        "message": "Invalid second operation.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("exceeds current timeline duration" in err for err in errors)


def test_unknown_operation(base_timeline):
    """Reject operations not registered in the system."""
    raw = {
        "operations": [
            {"op": "color_grade_cinematic", "params": {"style": "matrix"}}
        ],
        "message": "Applying color grade.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("unknown operation 'color_grade_cinematic'" in err for err in errors)


def test_string_instead_of_number(base_timeline):
    """Reject non-numeric parameter values."""
    raw = {
        "operations": [
            {"op": "trim_keep", "params": {"start": "five_seconds", "end": 20.0}}
        ],
        "message": "Trimming.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("parameter 'start'" in err for err in errors)


def test_start_greater_than_end(base_timeline):
    """Reject when start >= end."""
    raw = {
        "operations": [
            {"op": "cut_range", "params": {"start": 30.0, "end": 20.0}}
        ],
        "message": "Cutting backward.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("greater than start" in err or "less than end" in err for err in errors)


def test_end_beyond_duration(base_timeline):
    """Reject when end exceeds timeline duration."""
    raw = {
        "operations": [
            {"op": "trim_keep", "params": {"start": 10.0, "end": 120.0}}  # video is 60s
        ],
        "message": "Trimming past end.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("exceeds current timeline duration (60.00s)" in err for err in errors)


def test_max_operations_limit(base_timeline):
    """Reject plans with more than 10 operations."""
    raw = {
        "operations": [
            {"op": "cut_range", "params": {"start": i, "end": i + 0.5}}
            for i in range(11)  # 11 operations
        ],
        "message": "Eleven small cuts.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("maximum allowed is 10" in err for err in errors)


def test_empty_resulting_timeline(base_timeline):
    """Reject plans that would result in an empty video (duration 0)."""
    raw = {
        "operations": [
            {"op": "cut_range", "params": {"start": 0.0, "end": 60.0}}
        ],
        "message": "Delete everything.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert plan is None
    assert any("empty video timeline" in err for err in errors)


def test_non_finite_numbers(base_timeline):
    """Reject NaN and Infinite numbers."""
    raw_nan = {
        "operations": [
            {"op": "trim_keep", "params": {"start": float("nan"), "end": 20.0}}
        ],
        "message": "NaN test.",
    }
    plan, errors = validate_plan(raw_nan, base_timeline)
    assert plan is None
    assert any("non-finite number" in err for err in errors)

    raw_inf = {
        "operations": [
            {"op": "trim_keep", "params": {"start": 0.0, "end": float("inf")}}
        ],
        "message": "Inf test.",
    }
    plan_inf, errors_inf = validate_plan(raw_inf, base_timeline)
    assert plan_inf is None
    assert any("non-finite number" in err for err in errors_inf)


def test_injection_like_message_handling(base_timeline):
    """Sanitize and safely escape injection-like or malicious text in message."""
    malicious_msg = "<script>alert('pwned');</script>\x00rm -rf / --no-preserve-root; DROP TABLE users;"
    raw = {
        "operations": [
            {"op": "trim_keep", "params": {"start": 0.0, "end": 10.0}}
        ],
        "message": malicious_msg,
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert errors == []
    assert plan is not None
    # Verify script tags are escaped
    assert "<script>" not in plan.message
    assert "&lt;script&gt;" in plan.message
    # Null byte stripped
    assert "\x00" not in plan.message


def test_empty_operations_list_valid(base_timeline):
    """When an LLM cannot perform an unsupported request, 0 operations with explanation is valid."""
    raw = {
        "operations": [],
        "message": "I cannot add 3D animations, but you can trim or cut sections.",
    }
    plan, errors = validate_plan(raw, base_timeline)
    assert errors == []
    assert plan is not None
    assert len(plan.operations) == 0
    assert total_duration(plan.resulting_timeline) == 60.0


def test_top_level_structure_errors(base_timeline):
    """Reject non-dict, missing operations, or missing message."""
    # Non dict
    plan, errs = validate_plan("not a dict", base_timeline)
    assert plan is None
    assert "Plan must be a JSON object" in errs[0]

    # Missing operations
    plan, errs = validate_plan({"message": "hi"}, base_timeline)
    assert plan is None
    assert any("Missing required top-level key: 'operations'" in e for e in errs)

    # Missing message
    plan, errs = validate_plan({"operations": []}, base_timeline)
    assert plan is None
    assert any("Missing required top-level key: 'message'" in e for e in errs)

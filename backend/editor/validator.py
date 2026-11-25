"""Validator for LLM-generated video editing plans."""

from __future__ import annotations

import html
import math
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, ValidationError

from .ops.registry import OPERATIONS
from .timeline import Timeline, total_duration

MAX_OPERATIONS = 10
MAX_MESSAGE_LENGTH = 2000


class PlannedOperation(BaseModel):
    """An operation approved and validated for execution."""

    op: str
    params: Dict[str, Any]
    description: str = ""


class ValidPlan(BaseModel):
    """A completely validated editing plan ready for preview and execution."""

    operations: List[PlannedOperation] = Field(default_factory=list)
    message: str = Field(default="")
    resulting_timeline: Timeline


def _check_finite_numbers(data: Any, path: str = "") -> List[str]:
    """Recursively ensure that all numerical values are finite (no NaN, Inf, -Inf)."""
    errors = []
    if isinstance(data, dict):
        for k, v in data.items():
            curr_path = f"{path}.{k}" if path else str(k)
            errors.extend(_check_finite_numbers(v, curr_path))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            curr_path = f"{path}[{i}]"
            errors.extend(_check_finite_numbers(v, curr_path))
    elif isinstance(data, (int, float)):
        if not math.isfinite(data):
            errors.append(f"Field '{path}' contains non-finite number: {data}")
    return errors


def _sanitize_message(message: str) -> str:
    """Sanitize message text against injection payloads and oversized inputs."""
    # Strip null bytes and non-printable control characters (except newline and tab)
    sanitized = "".join(ch for ch in message if ch in ("\n", "\r", "\t") or ch.isprintable())
    # Limit maximum length
    if len(sanitized) > MAX_MESSAGE_LENGTH:
        sanitized = sanitized[:MAX_MESSAGE_LENGTH] + "..."
    # Escape HTML to prevent XSS in web frontend
    return html.escape(sanitized.strip())


def validate_plan(
    raw_data: Any,
    current_timeline: Timeline,
) -> Tuple[Optional[ValidPlan], List[str]]:
    """Validate raw LLM JSON against the operations registry and current timeline state.

    Args:
        raw_data: Raw JSON dict received from LLM.
        current_timeline: Current active timeline of the video.

    Returns:
        (ValidPlan, []) on success, or (None, list_of_errors) on failure.
    """
    errors: List[str] = []

    # 1. Top-level type check
    if not isinstance(raw_data, dict):
        return None, ["Plan must be a JSON object"]

    # 2. Check top-level keys
    if "operations" not in raw_data:
        errors.append("Missing required top-level key: 'operations'")
    elif not isinstance(raw_data["operations"], list):
        errors.append("Field 'operations' must be a list")

    if "message" not in raw_data:
        errors.append("Missing required top-level key: 'message'")
    elif not isinstance(raw_data["message"], str):
        errors.append("Field 'message' must be a string")

    if errors:
        return None, errors

    raw_ops = raw_data["operations"]
    raw_message = raw_data["message"]
    clean_message = _sanitize_message(raw_message)

    # 3. Operations count check
    if len(raw_ops) > MAX_OPERATIONS:
        return None, [
            f"Too many operations: received {len(raw_ops)}, maximum allowed is {MAX_OPERATIONS}"
        ]

    # 4. Sequentially validate operations on a copy of the timeline
    sim_timeline = current_timeline.model_copy(deep=True)
    planned_operations: List[PlannedOperation] = []

    for idx, item in enumerate(raw_ops):
        op_prefix = f"Operation #{idx + 1}"

        if not isinstance(item, dict):
            errors.append(f"{op_prefix} must be a JSON object")
            continue

        op_name = item.get("op")
        if not op_name or not isinstance(op_name, str):
            errors.append(f"{op_prefix} missing 'op' string name")
            continue

        if op_name not in OPERATIONS:
            errors.append(
                f"{op_prefix}: unknown operation '{op_name}'. Available operations: {list(OPERATIONS.keys())}"
            )
            continue

        spec = OPERATIONS[op_name]
        params = item.get("params", {})
        if not isinstance(params, dict):
            errors.append(f"{op_prefix} ('{op_name}'): 'params' must be an object")
            continue

        # Check for non-finite numbers in params
        finite_errs = _check_finite_numbers(params, f"op[{idx}].params")
        if finite_errs:
            errors.extend(finite_errs)
            continue

        # Parse with the operation's Pydantic model
        try:
            parsed_params = spec.params_model.model_validate(params)
        except ValidationError as e:
            for err in e.errors():
                loc = ".".join(str(p) for p in err["loc"])
                msg = err["msg"]
                errors.append(f"{op_prefix} ('{op_name}') parameter '{loc}': {msg}")
            continue

        # Range checks against the current duration of the simulated timeline
        current_dur = total_duration(sim_timeline)

        # Check if operation has start / end timestamps
        if hasattr(parsed_params, "start") and hasattr(parsed_params, "end"):
            start = float(parsed_params.start)
            end = float(parsed_params.end)

            if start < 0.0:
                errors.append(
                    f"{op_prefix} ('{op_name}'): start ({start:.2f}s) cannot be negative"
                )
            if start >= end:
                errors.append(
                    f"{op_prefix} ('{op_name}'): start ({start:.2f}s) must be strictly less than end ({end:.2f}s)"
                )
            if end > current_dur + 1e-4:
                errors.append(
                    f"{op_prefix} ('{op_name}'): end ({end:.2f}s) exceeds current timeline duration ({current_dur:.2f}s)"
                )

        if errors:
            # Continue to collect further errors or stop early if fatal
            continue

        # Apply operation sequentially to advance simulated timeline
        try:
            sim_timeline = spec.apply(sim_timeline, parsed_params)
            desc = spec.describe(parsed_params)
            planned_operations.append(
                PlannedOperation(
                    op=op_name,
                    params=params,
                    description=desc,
                )
            )
        except Exception as ex:
            errors.append(f"{op_prefix} ('{op_name}') execution failed: {str(ex)}")

    if errors:
        return None, errors

    # 5. Check resulting timeline is not empty
    if len(sim_timeline.segments) == 0 or total_duration(sim_timeline) <= 0.0:
        return None, ["Operations would result in an empty video timeline with 0s duration"]

    return (
        ValidPlan(
            operations=planned_operations,
            message=clean_message,
            resulting_timeline=sim_timeline,
        ),
        [],
    )

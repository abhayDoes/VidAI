from typing import List, Dict, Any, Tuple


VALID_TOOLS = {"trim", "resize", "change_speed", "adjust_audio", "add_subtitles", "merge"}


def validate_plan(plan: List[Dict[str, Any]], video_duration: float = 0.0) -> Tuple[bool, List[str]]:
    """Validate tool names, parameter types, and timestamp ranges before execution."""
    errors = []

    if not isinstance(plan, list):
        return False, ["Plan must be a list of tool operations"]

    for i, step in enumerate(plan):
        tool = step.get("tool")
        params = step.get("params", {})

        if tool not in VALID_TOOLS:
            errors.append(f"Step {i+1}: Unknown tool '{tool}'. Must be one of {list(VALID_TOOLS)}")
            continue

        if tool == "trim":
            start = params.get("start", 0.0)
            end = params.get("end", video_duration)
            if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
                errors.append(f"Step {i+1} (trim): 'start' and 'end' must be numbers")
            elif start < 0:
                errors.append(f"Step {i+1} (trim): 'start' must be >= 0")
            elif video_duration > 0 and end > video_duration + 1.0:
                errors.append(f"Step {i+1} (trim): 'end' ({end}s) exceeds video duration ({video_duration}s)")
            elif start >= end:
                errors.append(f"Step {i+1} (trim): 'start' ({start}s) must be less than 'end' ({end}s)")

        elif tool == "resize":
            aspect = params.get("aspect_ratio", "16:9")
            if aspect not in {"16:9", "9:16", "1:1", "4:5"}:
                errors.append(f"Step {i+1} (resize): aspect_ratio must be one of ['16:9', '9:16', '1:1', '4:5']")

        elif tool == "change_speed":
            factor = params.get("factor", 1.0)
            if not isinstance(factor, (int, float)) or factor < 0.25 or factor > 4.0:
                errors.append(f"Step {i+1} (change_speed): 'factor' must be between 0.25 and 4.0")

        elif tool == "adjust_audio":
            vol = params.get("volume", 1.0)
            if not isinstance(vol, (int, float)) or vol < 0:
                errors.append(f"Step {i+1} (adjust_audio): 'volume' must be >= 0")

    return (len(errors) == 0), errors


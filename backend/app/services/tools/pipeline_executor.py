import os
import uuid
import tempfile
import shutil
from typing import List, Dict, Any
from .video_tools import (
    tool_trim,
    tool_resize,
    tool_change_speed,
    tool_adjust_audio,
    tool_add_subtitles,
    tool_merge
)
from .validator import validate_plan
from app.core.config import settings


def execute_pipeline(
    input_path: str,
    output_path: str,
    plan: List[Dict[str, Any]],
    transcript: List[Dict[str, Any]] = None,
    video_duration: float = 0.0,
    is_preview: bool = False
) -> str:
    """Execute a validated sequence of editing tools, producing preview or final render."""
    is_valid, errors = validate_plan(plan, video_duration=video_duration)
    if not is_valid:
        raise ValueError(f"Plan validation failed: {'; '.join(errors)}")

    if not plan:
        # No edits, just copy or scale for preview
        if is_preview:
            tool_trim(input_path, output_path, 0, min(video_duration or 60.0, 30.0), is_preview=True)
        else:
            shutil.copyfile(input_path, output_path)
        return output_path

    temp_files = []
    current_input = input_path

    try:
        for i, step in enumerate(plan):
            tool = step.get("tool")
            params = step.get("params", {})
            is_last = (i == len(plan) - 1)

            if is_last:
                step_output = output_path
            else:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
                    step_output = tf.name
                temp_files.append(step_output)

            if tool == "trim":
                start = float(params.get("start", 0.0))
                end = float(params.get("end", video_duration or 60.0))
                tool_trim(current_input, step_output, start, end, is_preview=is_preview)

            elif tool == "resize":
                aspect = params.get("aspect_ratio", "16:9")
                tool_resize(current_input, step_output, aspect_ratio=aspect, is_preview=is_preview)

            elif tool == "change_speed":
                factor = float(params.get("factor", 1.0))
                tool_change_speed(current_input, step_output, factor=factor, is_preview=is_preview)

            elif tool == "adjust_audio":
                volume = float(params.get("volume", 1.0))
                fade_in = float(params.get("fade_in", 0.0))
                tool_adjust_audio(current_input, step_output, volume=volume, fade_in=fade_in, is_preview=is_preview)

            elif tool == "add_subtitles":
                sub_transcript = params.get("transcript") or transcript
                tool_add_subtitles(current_input, step_output, transcript=sub_transcript, is_preview=is_preview)

            elif tool == "merge":
                clip_paths = params.get("clip_paths", [current_input])
                tool_merge(clip_paths, step_output, is_preview=is_preview)

            current_input = step_output

        return output_path
    finally:
        for tf in temp_files:
            if os.path.exists(tf) and tf != output_path:
                try:
                    os.remove(tf)
                except Exception:
                    pass


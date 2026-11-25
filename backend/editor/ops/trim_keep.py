"""Trim keep operation: keep only [start, end] of the current timeline, drop everything else."""

import uuid
from pydantic import BaseModel, Field, field_validator

from ..timeline import Segment, Timeline
from .registry import (
    MIN_SEGMENT_DURATION,
    format_timestamp,
    register_operation,
)


class TrimKeepParams(BaseModel):
    start: float = Field(ge=0.0, description="Start time in seconds of the current timeline to keep")
    end: float = Field(gt=0.0, description="End time in seconds of the current timeline to keep")

    @field_validator("end")
    @classmethod
    def validate_range(cls, v: float, info) -> float:
        start = info.data.get("start")
        if start is not None and v <= start:
            raise ValueError(f"end ({v}) must be strictly greater than start ({start})")
        return v


def describe_trim_keep(params: TrimKeepParams) -> str:
    return f"Keep {format_timestamp(params.start)}–{format_timestamp(params.end)}"


@register_operation(
    name="trim_keep",
    description="Keep only [start, end] of the current timeline in seconds, dropping everything else.",
    params_model=TrimKeepParams,
    describe=describe_trim_keep,
)
def apply_trim_keep(timeline: Timeline, params: TrimKeepParams) -> Timeline:
    start = max(0.0, float(params.start))
    end = float(params.end)

    new_segments = []
    elapsed = 0.0

    for seg in timeline.segments:
        seg_dur = seg.duration
        seg_out_start = elapsed
        seg_out_end = elapsed + seg_dur
        elapsed += seg_dur

        # Calculate overlap with [start, end]
        overlap_start = max(start, seg_out_start)
        overlap_end = min(end, seg_out_end)

        if (overlap_end - overlap_start) >= MIN_SEGMENT_DURATION:
            src_start = seg.src_start + (overlap_start - seg_out_start)
            src_end = seg.src_start + (overlap_end - seg_out_start)
            new_segments.append(
                Segment(
                    id=uuid.uuid4().hex[:8],
                    src_start=round(src_start, 4),
                    src_end=round(src_end, 4),
                )
            )

    return Timeline(
        video_id=timeline.video_id,
        source_duration=timeline.source_duration,
        segments=new_segments,
        version=timeline.version + 1,
    )

"""Cut range operation: remove [start, end] from current timeline and close the gap."""

import uuid
from pydantic import BaseModel, Field, field_validator

from ..timeline import Segment, Timeline
from .registry import (
    MIN_SEGMENT_DURATION,
    format_timestamp,
    register_operation,
)


class CutRangeParams(BaseModel):
    start: float = Field(ge=0.0, description="Start timestamp in seconds to cut from timeline")
    end: float = Field(gt=0.0, description="End timestamp in seconds to cut from timeline")

    @field_validator("end")
    @classmethod
    def validate_range(cls, v: float, info) -> float:
        start = info.data.get("start")
        if start is not None and v <= start:
            raise ValueError(f"end ({v}) must be strictly greater than start ({start})")
        return v


def describe_cut_range(params: CutRangeParams) -> str:
    return f"Cut {format_timestamp(params.start)}–{format_timestamp(params.end)}"


@register_operation(
    name="cut_range",
    description="Remove [start, end] in seconds from the current timeline and close the gap.",
    params_model=CutRangeParams,
    describe=describe_cut_range,
)
def apply_cut_range(timeline: Timeline, params: CutRangeParams) -> Timeline:
    c_start = max(0.0, float(params.start))
    c_end = float(params.end)

    new_segments = []
    elapsed = 0.0

    for seg in timeline.segments:
        seg_dur = seg.duration
        seg_out_start = elapsed
        seg_out_end = elapsed + seg_dur
        elapsed += seg_dur

        # Left remainder before the cut: [seg_out_start, min(seg_out_end, c_start)]
        if seg_out_start < c_start:
            left_end = min(seg_out_end, c_start)
            if (left_end - seg_out_start) >= MIN_SEGMENT_DURATION:
                src_s = seg.src_start
                src_e = seg.src_start + (left_end - seg_out_start)
                new_segments.append(
                    Segment(
                        id=uuid.uuid4().hex[:8],
                        src_start=round(src_s, 4),
                        src_end=round(src_e, 4),
                    )
                )

        # Right remainder after the cut: [max(seg_out_start, c_end), seg_out_end]
        if seg_out_end > c_end:
            right_start = max(seg_out_start, c_end)
            if (seg_out_end - right_start) >= MIN_SEGMENT_DURATION:
                src_s = seg.src_start + (right_start - seg_out_start)
                src_e = seg.src_end
                new_segments.append(
                    Segment(
                        id=uuid.uuid4().hex[:8],
                        src_start=round(src_s, 4),
                        src_end=round(src_e, 4),
                    )
                )

    return Timeline(
        video_id=timeline.video_id,
        source_duration=timeline.source_duration,
        segments=new_segments,
        version=timeline.version + 1,
    )

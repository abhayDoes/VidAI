"""Reset operation: restore the full original timeline."""

import uuid
from pydantic import BaseModel

from ..timeline import Segment, Timeline
from .registry import register_operation


class ResetParams(BaseModel):
    pass


def describe_reset(params: ResetParams) -> str:
    return "Reset timeline to original"


@register_operation(
    name="reset",
    description="Restore the full original timeline with a single segment covering the source video.",
    params_model=ResetParams,
    describe=describe_reset,
)
def apply_reset(timeline: Timeline, params: ResetParams) -> Timeline:
    return Timeline(
        video_id=timeline.video_id,
        source_duration=timeline.source_duration,
        segments=[
            Segment(
                id=uuid.uuid4().hex[:8],
                src_start=0.0,
                src_end=round(timeline.source_duration, 4),
            )
        ],
        version=timeline.version + 1,
    )

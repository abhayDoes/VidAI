"""Remove silence operation: detect silent intervals via FFmpeg and cut them from the timeline."""

from __future__ import annotations

import uuid
from typing import List, Tuple

from pydantic import BaseModel, Field

from ..silence import detect_silence_intervals, resolve_video_path
from ..timeline import Segment, Timeline
from .registry import MIN_SEGMENT_DURATION, register_operation


class RemoveSilenceParams(BaseModel):
    noise_db: float = Field(
        default=-30.0,
        ge=-60.0,
        le=-10.0,
        description="Silence volume threshold in dB (default -30.0). Lower values like -40 only detect very quiet silence.",
    )
    min_duration: float = Field(
        default=0.5,
        ge=0.1,
        le=10.0,
        description="Minimum silence duration in seconds to remove (default 0.5).",
    )
    padding: float = Field(
        default=0.1,
        ge=0.0,
        le=0.5,
        description="Seconds of padding to preserve around speech edges (default 0.1).",
    )


def describe_remove_silence(params: RemoveSilenceParams) -> str:
    return (
        f"Remove silent parts (≥{params.min_duration:.1f}s below {params.noise_db:.0f} dB, "
        f"{params.padding:.2f}s padding)"
    )


def subtract_intervals_from_segments(
    segments: List[Segment],
    cut_intervals: List[Tuple[float, float]],
) -> List[Segment]:
    """Subtract source-time intervals [(cut_start, cut_end), ...] from timeline segments."""
    if not cut_intervals:
        return [
            Segment(id=uuid.uuid4().hex[:8], src_start=seg.src_start, src_end=seg.src_end)
            for seg in segments
        ]

    # Sort and merge overlapping cut intervals
    sorted_cuts = sorted(cut_intervals, key=lambda x: x[0])
    merged_cuts: List[Tuple[float, float]] = []
    for cs, ce in sorted_cuts:
        if ce <= cs:
            continue
        if not merged_cuts or cs > merged_cuts[-1][1]:
            merged_cuts.append((cs, ce))
        else:
            merged_cuts[-1] = (merged_cuts[-1][0], max(merged_cuts[-1][1], ce))

    new_segments: List[Segment] = []
    for seg in segments:
        pieces: List[Tuple[float, float]] = [(seg.src_start, seg.src_end)]
        for cs, ce in merged_cuts:
            next_pieces: List[Tuple[float, float]] = []
            for ps, pe in pieces:
                if ce <= ps or cs >= pe:
                    next_pieces.append((ps, pe))
                else:
                    if ps < cs:
                        next_pieces.append((ps, cs))
                    if ce < pe:
                        next_pieces.append((ce, pe))
            pieces = next_pieces

        for ps, pe in pieces:
            if (pe - ps) >= MIN_SEGMENT_DURATION:
                new_segments.append(
                    Segment(
                        id=uuid.uuid4().hex[:8],
                        src_start=round(ps, 4),
                        src_end=round(pe, 4),
                    )
                )

    return new_segments


@register_operation(
    name="remove_silence",
    description=(
        "Automatically detect and remove silent parts from the video using audio analysis. "
        "Use when the user asks to remove silence, silent parts, pauses, or dead air."
    ),
    params_model=RemoveSilenceParams,
    describe=describe_remove_silence,
)
def apply_remove_silence(timeline: Timeline, params: RemoveSilenceParams) -> Timeline:
    video_path = resolve_video_path(timeline.video_id)
    if not video_path:
        raise FileNotFoundError(
            f"Source video file not found for video_id '{timeline.video_id}'"
        )

    raw_silences = detect_silence_intervals(
        video_path=video_path,
        noise_db=float(params.noise_db),
        min_duration=float(params.min_duration),
        total_duration=timeline.source_duration,
    )

    # Apply padding so speech transitions aren't clipped
    pad = float(params.padding)
    padded_cuts: List[Tuple[float, float]] = []
    for s_start, s_end in raw_silences:
        c_start = s_start + pad
        c_end = s_end - pad
        if (c_end - c_start) >= MIN_SEGMENT_DURATION:
            padded_cuts.append((c_start, c_end))

    new_segments = subtract_intervals_from_segments(timeline.segments, padded_cuts)

    return Timeline(
        video_id=timeline.video_id,
        source_duration=timeline.source_duration,
        segments=new_segments,
        version=timeline.version + 1,
    )

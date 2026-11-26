"""Timeline data model and persistence."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class Segment(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    src_start: float = Field(ge=0.0, description="Start time in the source video (seconds)")
    src_end: float = Field(ge=0.0, description="End time in the source video (seconds)")

    @field_validator("src_end")
    @classmethod
    def validate_duration(cls, v: float, info) -> float:
        src_start = info.data.get("src_start")
        if src_start is not None and v < src_start:
            raise ValueError(f"src_end ({v}) must be greater than or equal to src_start ({src_start})")
        return v

    @property
    def duration(self) -> float:
        return max(0.0, self.src_end - self.src_start)


class Timeline(BaseModel):
    video_id: str
    source_duration: float = Field(ge=0.0, description="Total duration of original source video")
    segments: List[Segment] = Field(default_factory=list)
    version: int = Field(default=1, ge=1)


def total_duration(tl: Timeline) -> float:
    """Calculate the total duration of the timeline in output time (seconds)."""
    return round(sum(seg.duration for seg in tl.segments), 4)


def output_to_source_time(tl: Timeline, t: float) -> Optional[float]:
    """Map a timestamp `t` in current output timeline time to its source video timestamp."""
    tot = total_duration(tl)
    if t < -1e-4 or t > tot + 1e-4:
        return None
    
    t_clamped = max(0.0, min(t, tot))
    elapsed = 0.0

    for seg in tl.segments:
        seg_dur = seg.duration
        if elapsed <= t_clamped <= elapsed + seg_dur + 1e-6:
            offset = t_clamped - elapsed
            return round(seg.src_start + min(offset, seg_dur), 4)
        elapsed += seg_dur

    return None


def source_to_output_time(tl: Timeline, t: float) -> Optional[float]:
    """Map a source video timestamp `t` to its timestamp in output timeline time, or None if cut out."""
    if t < -1e-4 or t > tl.source_duration + 1e-4:
        return None

    elapsed = 0.0
    for seg in tl.segments:
        if (seg.src_start - 1e-6) <= t <= (seg.src_end + 1e-6):
            offset = max(0.0, min(t - seg.src_start, seg.duration))
            return round(elapsed + offset, 4)
        elapsed += seg.duration

    return None


def create_initial_timeline(video_id: str, source_duration: float) -> Timeline:
    """Create an initial timeline with one segment covering the entire source video."""
    return Timeline(
        video_id=video_id,
        source_duration=source_duration,
        segments=[
            Segment(
                id=uuid.uuid4().hex[:8],
                src_start=0.0,
                src_end=round(source_duration, 4),
            )
        ],
        version=1,
    )


def _resolve_base_dir(base_dir: Path | str) -> Path:
    p = Path(base_dir)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent / p
    return p


def get_timeline_path(video_id: str, base_dir: Path | str = "./data/videos") -> Path:
    """Return the path to timeline.json for a video."""
    resolved = _resolve_base_dir(base_dir)
    return resolved / video_id / "timeline.json"


def get_timeline_history_dir(video_id: str, base_dir: Path | str = "./data/videos") -> Path:
    """Return the history directory path for a video."""
    resolved = _resolve_base_dir(base_dir)
    return resolved / video_id / "timeline_history"


def save_timeline(timeline: Timeline, base_dir: Path | str = "./data/videos") -> Path:
    """Save timeline.json and record snapshot in timeline_history/v<version>.json."""
    main_path = get_timeline_path(timeline.video_id, base_dir)
    main_path.parent.mkdir(parents=True, exist_ok=True)

    data = timeline.model_dump()
    with open(main_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    hist_dir = get_timeline_history_dir(timeline.video_id, base_dir)
    hist_dir.mkdir(parents=True, exist_ok=True)
    hist_path = hist_dir / f"v{timeline.version}.json"
    with open(hist_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return main_path


def load_timeline(video_id: str, base_dir: Path | str = "./data/videos") -> Optional[Timeline]:
    """Load current timeline.json, or initialize one if meta.json exists."""
    main_path = get_timeline_path(video_id, base_dir)
    if main_path.exists():
        with open(main_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Timeline.model_validate(data)

    # Check if meta.json exists to create initial timeline
    meta_path = main_path.parent / "meta.json"
    if meta_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            dur = float(meta.get("duration", 0.0))
            if dur > 0:
                tl = create_initial_timeline(video_id, dur)
                save_timeline(tl, base_dir)
                return tl
        except Exception:
            pass

    # Fallback: probe original.* directly if meta.json hasn't been written by the worker yet
    v_dir = main_path.parent
    if v_dir.is_dir():
        for ext in (".mp4", ".mov", ".mkv", ".webm", ".avi"):
            candidate = v_dir / f"original{ext}"
            if candidate.is_file():
                try:
                    from app.captions.probe import probe_video
                    meta = probe_video(candidate)
                    dur = float(meta.get("duration", 0.0))
                    if dur > 0:
                        tl = create_initial_timeline(video_id, dur)
                        save_timeline(tl, base_dir)
                        return tl
                except Exception:
                    pass
                break

    return None


def load_timeline_version(
    video_id: str, version: int, base_dir: Path | str = "./data/videos"
) -> Optional[Timeline]:
    """Load a specific timeline version from timeline_history."""
    hist_path = get_timeline_history_dir(video_id, base_dir) / f"v{version}.json"
    if hist_path.exists():
        with open(hist_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Timeline.model_validate(data)
    return None


def list_timeline_versions(video_id: str, base_dir: Path | str = "./data/videos") -> List[int]:
    """List all available timeline version numbers sorted ascending."""
    hist_dir = get_timeline_history_dir(video_id, base_dir)
    if not hist_dir.exists():
        return []
    versions = []
    for file in hist_dir.glob("v*.json"):
        name = file.stem  # e.g. "v1"
        try:
            versions.append(int(name[1:]))
        except ValueError:
            pass
    return sorted(versions)

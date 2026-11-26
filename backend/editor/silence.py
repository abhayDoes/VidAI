"""FFmpeg-based silence detection for automatic silent-part removal."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple

from .renderer import find_original_video

_SILENCE_START_RE = re.compile(r"silence_start:\s*([0-9]+(?:\.[0-9]+)?)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*([0-9]+(?:\.[0-9]+)?)")


def resolve_video_path(
    video_id: str,
    base_dir: Optional[Path | str] = None,
) -> Optional[Path]:
    """Locate the original uploaded video file for a given video_id."""
    candidates: List[Path] = []
    if base_dir is not None:
        candidates.append(Path(base_dir))

    try:
        from app.core.config import settings
        upload_dir = getattr(settings, "UPLOAD_DIR", None)
        if upload_dir:
            p = Path(upload_dir)
            if not p.is_absolute():
                p = Path(__file__).resolve().parent.parent / p
            candidates.append(p)
    except Exception:
        pass

    env_dir = os.getenv("UPLOAD_DIR")
    if env_dir:
        p = Path(env_dir)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent.parent / p
        candidates.append(p)

    backend_root = Path(__file__).resolve().parent.parent
    candidates.append(backend_root / "data" / "videos")
    candidates.append(Path("./data/videos"))

    seen = set()
    for c in candidates:
        resolved = str(c.resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        found = find_original_video(video_id, c)
        if found and found.is_file():
            return found

    return None


def detect_silence_intervals(
    video_path: Path | str,
    noise_db: float = -30.0,
    min_duration: float = 0.5,
    total_duration: Optional[float] = None,
    timeout_seconds: int = 120,
) -> List[Tuple[float, float]]:
    """Run FFmpeg silencedetect on a video file and return (start, end) silence intervals in seconds."""
    path = Path(video_path)
    if not path.is_file():
        raise FileNotFoundError(f"Video file not found: {path}")

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(path),
        "-vn",
        "-af",
        f"silencedetect=noise={noise_db}dB:d={min_duration}",
        "-f",
        "null",
        "-",
    ]

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
    )

    stderr = proc.stderr or ""
    intervals: List[Tuple[float, float]] = []
    current_start: Optional[float] = None

    for line in stderr.splitlines():
        m_start = _SILENCE_START_RE.search(line)
        if m_start:
            current_start = float(m_start.group(1))
            continue

        m_end = _SILENCE_END_RE.search(line)
        if m_end and current_start is not None:
            end_t = float(m_end.group(1))
            if end_t > current_start:
                intervals.append((current_start, end_t))
            current_start = None

    # Handle trailing silence that reaches the end of the file
    if current_start is not None and total_duration is not None and total_duration > current_start:
        intervals.append((current_start, float(total_duration)))

    return intervals

"""FFmpeg timeline video renderer with live progress parsing."""

from __future__ import annotations

import datetime
import json
import os
import re
import shutil
import subprocess
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from .timeline import Segment, Timeline, get_timeline_path, load_timeline, total_duration

RENDER_JOBS: Dict[str, RenderJob] = {}
ACTIVE_RENDERS: Dict[str, str] = {}  # video_id -> job_id
_LOCK = threading.Lock()


@dataclass
class RenderJob:
    job_id: str
    video_id: str
    status: str  # queued | running | done | failed
    progress: float  # 0.0 to 100.0
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


def get_renders_dir(video_id: str, base_dir: Path | str = "./data/videos") -> Path:
    """Return path to data/videos/<video_id>/renders/."""
    t_path = get_timeline_path(video_id, base_dir)
    return t_path.parent / "renders"


def find_original_video(video_id: str, base_dir: Path | str = "./data/videos") -> Optional[Path]:
    """Find original.* video file in the video folder."""
    v_dir = get_timeline_path(video_id, base_dir).parent
    for ext in (".mp4", ".mov", ".mkv", ".webm", ".avi"):
        candidate = v_dir / f"original{ext}"
        if candidate.exists():
            return candidate
    return None


def has_audio_stream(video_path: Path | str) -> bool:
    """Check if the media file has an audio stream using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(video_path),
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
        return "audio" in result.stdout.lower()
    except Exception:
        return False


def build_filter_complex(
    segments: List[Segment],
    has_audio: bool,
    extra_filters: Optional[List[str]] = None,
) -> Tuple[str, List[str]]:
    """Build FFmpeg -filter_complex graph for timeline segments.

    Accepts an extra_filters hook for future Phase 2 operations.
    """
    filter_parts = []
    v_labels = []
    a_labels = []

    for i, seg in enumerate(segments):
        v_lbl = f"v{i}"
        filter_parts.append(
            f"[0:v]trim=start={seg.src_start:.3f}:end={seg.src_end:.3f},setpts=PTS-STARTPTS[{v_lbl}]"
        )
        v_labels.append(f"[{v_lbl}]")

        if has_audio:
            a_lbl = f"a{i}"
            filter_parts.append(
                f"[0:a]atrim=start={seg.src_start:.3f}:end={seg.src_end:.3f},asetpts=PTS-STARTPTS[{a_lbl}]"
            )
            a_labels.append(f"[{a_lbl}]")

    num_segs = len(segments)
    if has_audio:
        concat_inputs = "".join(f"{v}{a}" for v, a in zip(v_labels, a_labels))
        concat_str = f"{concat_inputs}concat=n={num_segs}:v=1:a=1[concat_v][concat_a]"
        filter_parts.append(concat_str)

        final_v = "[concat_v]"
        final_a = "[concat_a]"
        if extra_filters:
            # Future Phase 2+ filter hooks
            pass
        maps = ["-map", final_v, "-map", final_a]
    else:
        concat_inputs = "".join(v_labels)
        concat_str = f"{concat_inputs}concat=n={num_segs}:v=1:a=0[concat_v]"
        filter_parts.append(concat_str)
        maps = ["-map", "[concat_v]"]

    return ";".join(filter_parts), maps


def _parse_out_time_us(line: str) -> Optional[float]:
    """Parse out_time_us or out_time line from FFmpeg progress output."""
    if line.startswith("out_time_us="):
        val = line.split("=")[1].strip()
        try:
            return float(val) / 1_000_000.0
        except ValueError:
            return None
    elif line.startswith("out_time="):
        val = line.split("=")[1].strip()
        # Parse HH:MM:SS.micro
        match = re.match(r"(\d+):(\d+):([\d\.]+)", val)
        if match:
            h, m, s = match.groups()
            return int(h) * 3600 + int(m) * 60 + float(s)
    return None


def _save_job_state(job: RenderJob, renders_dir: Path) -> None:
    job_file = renders_dir / f"{job.job_id}.json"
    try:
        with open(job_file, "w", encoding="utf-8") as f:
            json.dump(asdict(job), f, indent=2)
    except Exception:
        pass


def execute_render_job(
    job_id: str,
    video_id: str,
    timeline: Timeline,
    base_dir: Path | str = "./data/videos",
    progress_callback: Optional[Callable[[float], None]] = None,
) -> None:
    """Execute FFmpeg render process in background thread."""
    renders_dir = get_renders_dir(video_id, base_dir)
    renders_dir.mkdir(parents=True, exist_ok=True)
    out_file = renders_dir / f"{job_id}.mp4"

    with _LOCK:
        if job_id not in RENDER_JOBS:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            RENDER_JOBS[job_id] = RenderJob(
                job_id=job_id,
                video_id=video_id,
                status="queued",
                progress=0.0,
                created_at=now,
                updated_at=now,
            )

    orig_video = find_original_video(video_id, base_dir)
    if not orig_video:
        with _LOCK:
            job = RENDER_JOBS[job_id]
            job.status = "failed"
            job.error = f"Original video file for '{video_id}' not found."
            job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            ACTIVE_RENDERS.pop(video_id, None)
            _save_job_state(job, renders_dir)
        return

    expected_duration = total_duration(timeline)
    if expected_duration <= 0.0 or not timeline.segments:
        with _LOCK:
            job = RENDER_JOBS[job_id]
            job.status = "failed"
            job.error = "Timeline has 0 duration or no segments to render."
            job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            ACTIVE_RENDERS.pop(video_id, None)
            _save_job_state(job, renders_dir)
        return

    with _LOCK:
        job = RENDER_JOBS[job_id]
        job.status = "running"
        job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        _save_job_state(job, renders_dir)

    has_audio = has_audio_stream(orig_video)
    filter_complex_str, maps = build_filter_complex(timeline.segments, has_audio)

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(orig_video),
        "-filter_complex",
        filter_complex_str,
        *maps,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
    ]
    if has_audio:
        cmd.extend(["-c:a", "aac", "-b:a", "128k"])
    cmd.extend([
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        str(out_file),
    ])

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        stderr_lines: List[str] = []

        def _drain_stderr():
            try:
                if process.stderr:
                    for s_line in process.stderr:
                        stderr_lines.append(s_line)
            except Exception:
                pass

        err_thread = threading.Thread(target=_drain_stderr, daemon=True)
        err_thread.start()

        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                curr_sec = _parse_out_time_us(line)
                if curr_sec is not None and expected_duration > 0:
                    pct = min(99.0, max(0.0, (curr_sec / expected_duration) * 100.0))
                    with _LOCK:
                        job = RENDER_JOBS[job_id]
                        job.progress = round(pct, 1)
                        job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        if progress_callback:
                            progress_callback(job.progress)

        process.wait(timeout=300)
        err_thread.join(timeout=2)
        stderr = "".join(stderr_lines)

        with _LOCK:
            job = RENDER_JOBS[job_id]
            ACTIVE_RENDERS.pop(video_id, None)
            if process.returncode == 0:
                job.status = "done"
                job.progress = 100.0
                job.output_path = str(out_file)
            else:
                job.status = "failed"
                job.error = f"FFmpeg error (code {process.returncode}): {stderr[-500:] if stderr else 'Unknown error'}"
            job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            _save_job_state(job, renders_dir)

    except Exception as ex:
        with _LOCK:
            job = RENDER_JOBS[job_id]
            job.status = "failed"
            job.error = str(ex)
            job.updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            ACTIVE_RENDERS.pop(video_id, None)
            _save_job_state(job, renders_dir)


def start_render(
    video_id: str,
    base_dir: Path | str = "./data/videos",
) -> Tuple[Optional[str], Optional[str]]:
    """Initiate a background render job for the video's active timeline.

    Returns:
        (job_id, None) on success, or (None, error_message) on conflict/error.
    """
    with _LOCK:
        if video_id in ACTIVE_RENDERS:
            return None, f"A render job ({ACTIVE_RENDERS[video_id]}) is already running for this video."

        timeline = load_timeline(video_id, base_dir)
        if not timeline or not timeline.segments:
            return None, f"No active timeline found for video '{video_id}'."

        job_id = f"render_{uuid_short()}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        job = RenderJob(
            job_id=job_id,
            video_id=video_id,
            status="queued",
            progress=0.0,
            created_at=now,
            updated_at=now,
        )
        RENDER_JOBS[job_id] = job
        ACTIVE_RENDERS[video_id] = job_id

    # Launch background worker thread
    thread = threading.Thread(
        target=execute_render_job,
        args=(job_id, video_id, timeline, base_dir),
        daemon=True,
    )
    thread.start()

    return job_id, None


def get_render_job(job_id: str, video_id: Optional[str] = None, base_dir: Path | str = "./data/videos") -> Optional[RenderJob]:
    """Retrieve render job status from memory or persistent json."""
    with _LOCK:
        if job_id in RENDER_JOBS:
            return RENDER_JOBS[job_id]

    # Check disk
    if video_id:
        r_dir = get_renders_dir(video_id, base_dir)
        j_file = r_dir / f"{job_id}.json"
        if j_file.exists():
            try:
                with open(j_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                job = RenderJob(**data)
                with _LOCK:
                    RENDER_JOBS[job_id] = job
                return job
            except Exception:
                pass
    return None


def is_render_running(video_id: str) -> bool:
    """Check if a render is currently active for the video."""
    with _LOCK:
        return video_id in ACTIVE_RENDERS


def uuid_short() -> str:
    import uuid
    return uuid.uuid4().hex[:8]

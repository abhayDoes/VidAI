import json
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger("captions.probe")


def parse_fps(r_frame_rate: str) -> float:
    """Safely parse frame rate fraction (e.g. '30/1' or '30000/1001') to float."""
    if not r_frame_rate:
        return 0.0
    try:
        if "/" in r_frame_rate:
            num, denom = r_frame_rate.split("/")
            denom_f = float(denom)
            return float(num) / denom_f if denom_f != 0 else 0.0
        return float(r_frame_rate)
    except Exception:
        return 0.0


def probe_video(video_path: Path, timeout_seconds: int = 30) -> Dict[str, Any]:
    """Inspect video file with ffprobe without shell=True.

    Extracts duration, width, height, fps, has_audio, and size_bytes.
    Confirms that the file contains an actual video stream.
    """
    if not video_path.is_file():
        raise FileNotFoundError(f"Video file not found at: {video_path}")

    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate",
        "-of", "json",
        str(video_path)
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False
        )
    except subprocess.TimeoutExpired as e:
        logger.error("ffprobe timed out after %ss for %s", timeout_seconds, video_path)
        raise TimeoutError(f"ffprobe analysis timed out after {timeout_seconds} seconds") from e
    except Exception as e:
        logger.error("Failed to execute ffprobe: %s", e)
        raise RuntimeError(f"Could not execute ffprobe: {e}") from e

    if proc.returncode != 0:
        logger.error("ffprobe failed with returncode %s: %s", proc.returncode, proc.stderr)
        raise ValueError(f"Invalid video file or corrupted stream: {proc.stderr.strip()}")

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        logger.error("ffprobe returned invalid JSON: %s", proc.stdout)
        raise ValueError("Could not parse ffprobe output") from e

    streams = data.get("streams", [])
    format_info = data.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video_stream:
        raise ValueError("Uploaded file does not contain a valid video stream")

    has_audio = any(s.get("codec_type") == "audio" for s in streams)

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    fps = parse_fps(video_stream.get("r_frame_rate", "0/1"))

    # Duration: prefer format duration, fallback to stream duration
    raw_duration = format_info.get("duration") or video_stream.get("duration") or 0.0
    try:
        duration = float(raw_duration)
    except (ValueError, TypeError):
        duration = 0.0

    # Size in bytes: prefer format size, fallback to disk file size
    raw_size = format_info.get("size")
    try:
        size_bytes = int(raw_size) if raw_size is not None else video_path.stat().st_size
    except (ValueError, TypeError, OSError):
        size_bytes = video_path.stat().st_size

    meta = {
        "duration": round(max(0.0, duration), 3),
        "width": width,
        "height": height,
        "fps": round(fps, 2),
        "has_audio": has_audio,
        "size_bytes": size_bytes
    }
    return meta

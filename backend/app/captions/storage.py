import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

from app.captions.settings import caption_settings

logger = logging.getLogger("captions.storage")
HEX_32_REGEX = re.compile(r"^[0-9a-f]{32}$")


def validate_video_id(video_id: str) -> str:
    """Validate that video_id is strictly a 32-character lowercase hex string.

    Prevents directory traversal and malformed inputs.
    """
    if not isinstance(video_id, str) or not HEX_32_REGEX.fullmatch(video_id):
        raise ValueError("Invalid video_id: must be a 32-character hexadecimal string")
    return video_id


def get_video_dir(video_id: str) -> Path:
    """Get the directory path for a given video_id."""
    clean_id = validate_video_id(video_id)
    return caption_settings.upload_path / clean_id


def ensure_video_dir(video_id: str) -> Path:
    """Create and return the per-video directory."""
    video_dir = get_video_dir(video_id)
    video_dir.mkdir(parents=True, exist_ok=True)
    return video_dir


def find_original_file(video_id: str) -> Optional[Path]:
    """Find original.<ext> in data/videos/<video_id>/."""
    video_dir = get_video_dir(video_id)
    if not video_dir.is_dir():
        return None
    for item in video_dir.glob("original.*"):
        if item.is_file() and item.suffix.lower() in caption_settings.ALLOWED_EXTENSIONS:
            return item
    return None


def read_json_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Safely read and parse a JSON file."""
    if not file_path.is_file():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to read JSON from %s: %s", file_path, e)
        return None


def write_json_file(file_path: Path, data: Dict[str, Any]) -> None:
    """Safely write data to a JSON file atomically."""
    temp_path = file_path.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_path.replace(file_path)


def read_status(video_id: str) -> Optional[Dict[str, Any]]:
    """Read status.json for a video_id."""
    return read_json_file(get_video_dir(video_id) / "status.json")


def write_status(
    video_id: str,
    state: str,
    progress: float = 0.0,
    message: str = "",
    error: Optional[str] = None
) -> Dict[str, Any]:
    """Write or update status.json for a video."""
    video_dir = ensure_video_dir(video_id)
    payload = {
        "video_id": video_id,
        "state": state,
        "progress": round(max(0.0, min(100.0, progress)), 2),
        "message": message,
        "error": error,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    write_json_file(video_dir / "status.json", payload)
    return payload


def read_meta(video_id: str) -> Optional[Dict[str, Any]]:
    """Read meta.json for a video_id."""
    return read_json_file(get_video_dir(video_id) / "meta.json")


def write_meta(video_id: str, meta: Dict[str, Any]) -> None:
    """Write meta.json for a video."""
    video_dir = ensure_video_dir(video_id)
    write_json_file(video_dir / "meta.json", meta)


def recover_interrupted_jobs() -> int:
    """Scan existing folders and mark non-final states as 'failed: interrupted' on server startup."""
    upload_root = caption_settings.upload_path
    if not upload_root.is_dir():
        return 0

    recovered_count = 0
    for child in upload_root.iterdir():
        if child.is_dir() and HEX_32_REGEX.fullmatch(child.name):
            status_file = child / "status.json"
            status = read_json_file(status_file)
            if status and status.get("state") not in ("done", "failed"):
                logger.warning("Recovering interrupted job for %s (was %s)", child.name, status.get("state"))
                write_status(
                    video_id=child.name,
                    state="failed",
                    progress=status.get("progress", 0.0),
                    message="Job was interrupted by server restart",
                    error="failed: interrupted"
                )
                recovered_count += 1
    return recovered_count

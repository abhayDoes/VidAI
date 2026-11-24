import logging
import subprocess
from pathlib import Path

logger = logging.getLogger("captions.audio")


def extract_audio(
    video_path: Path,
    output_audio_path: Path,
    timeout_seconds: int = 180
) -> Path:
    """Extract mono 16 kHz audio track from video using FFmpeg without shell=True.

    Matches specification: ffmpeg -y -i <video> -vn -ac 1 -ar 16000 audio.wav
    """
    if not video_path.is_file():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    output_audio_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        str(output_audio_path)
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
        logger.error("FFmpeg audio extraction timed out after %ss for %s", timeout_seconds, video_path)
        raise TimeoutError(f"Audio extraction timed out after {timeout_seconds} seconds") from e
    except Exception as e:
        logger.error("Failed to run FFmpeg audio extraction: %s", e)
        raise RuntimeError(f"Could not execute FFmpeg: {e}") from e

    if proc.returncode != 0:
        logger.error("FFmpeg audio extraction failed (returncode %s): %s", proc.returncode, proc.stderr)
        raise RuntimeError(f"FFmpeg audio extraction failed: {proc.stderr.strip()}")

    if not output_audio_path.is_file() or output_audio_path.stat().st_size == 0:
        raise RuntimeError(f"FFmpeg produced an empty or missing audio file: {output_audio_path}")

    logger.info("Extracted 16kHz mono audio (%s bytes) to %s", output_audio_path.stat().st_size, output_audio_path)
    return output_audio_path

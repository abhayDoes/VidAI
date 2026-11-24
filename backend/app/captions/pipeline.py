import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from app.captions.settings import caption_settings
from app.captions.storage import (
    get_video_dir,
    find_original_file,
    write_status,
    write_meta,
    write_json_file
)
from app.captions.probe import probe_video
from app.captions.audio import extract_audio
from app.captions.transcribe import transcribe_audio_file
from app.captions.captions import (
    build_caption_lines,
    generate_srt,
    generate_vtt
)

logger = logging.getLogger("captions.pipeline")

# In-process FIFO queue ensuring only ONE transcription job runs at a time on CPU
_pipeline_queue: asyncio.Queue[str] = asyncio.Queue()
_worker_task: Optional[asyncio.Task] = None


async def _process_pipeline_job(video_id: str) -> None:
    """Execute the full pipeline sequentially for a single video.

    States: uploaded -> probing -> extracting_audio -> transcribing -> building_captions -> done (or failed)
    """
    video_dir = get_video_dir(video_id)
    original_file = find_original_file(video_id)

    if not original_file:
        write_status(
            video_id=video_id,
            state="failed",
            progress=0.0,
            message="Source video file not found",
            error="Source video file missing from disk"
        )
        return

    try:
        # Step 1: Probe video with ffprobe
        write_status(video_id, "probing", 5.0, "Analyzing video stream with ffprobe...")
        meta = await asyncio.to_thread(probe_video, original_file)
        write_meta(video_id, meta)

        duration = meta.get("duration", 0.0)

        # Edge case: No audio stream
        if not meta.get("has_audio"):
            logger.info("Video %s has no audio track. Finishing with empty captions.", video_id)
            empty_captions_data: Dict[str, Any] = {
                "video_id": video_id,
                "language": "none",
                "duration": duration,
                "captions": []
            }
            write_json_file(video_dir / "captions.json", empty_captions_data)
            (video_dir / "captions.srt").write_bytes(b"")
            (video_dir / "captions.vtt").write_bytes(b"WEBVTT\n\n")
            write_status(video_id, "done", 100.0, "No audio track found")
            return

        # Step 2: Extract audio to 16 kHz mono WAV
        audio_path = video_dir / "audio.wav"
        write_status(video_id, "extracting_audio", 15.0, "Extracting audio track (16 kHz mono)...")
        await asyncio.to_thread(extract_audio, original_file, audio_path)

        # Step 3: Transcribe with faster-whisper on CPU
        write_status(video_id, "transcribing", 20.0, "Starting faster-whisper local CPU transcription...")

        loop = asyncio.get_running_loop()

        def on_transcribe_progress(pct: float, msg: str):
            # Safe thread-to-asyncio status updates
            loop.call_soon_threadsafe(
                write_status, video_id, "transcribing", pct, msg
            )

        transcription_result = await asyncio.to_thread(
            transcribe_audio_file,
            audio_path,
            duration,
            on_transcribe_progress
        )

        detected_language = transcription_result.get("language") or "en"
        words = transcription_result.get("words", [])

        # Step 4: Build caption lines from word timestamps
        write_status(video_id, "building_captions", 92.0, "Building formatted captions from word timestamps...")
        captions = await asyncio.to_thread(build_caption_lines, words, duration)

        # Step 5: Write captions.json, captions.srt, and captions.vtt
        captions_payload: Dict[str, Any] = {
            "video_id": video_id,
            "language": detected_language,
            "duration": duration,
            "captions": captions
        }
        write_json_file(video_dir / "captions.json", captions_payload)

        srt_content = generate_srt(captions)
        vtt_content = generate_vtt(captions)

        (video_dir / "captions.srt").write_bytes(srt_content.encode("utf-8"))
        (video_dir / "captions.vtt").write_bytes(vtt_content.encode("utf-8"))

        # Step 6: Mark pipeline complete
        write_status(
            video_id=video_id,
            state="done",
            progress=100.0,
            message=f"Captions generated ({len(captions)} lines in {detected_language})"
        )
        logger.info("Pipeline completed successfully for video %s (%d captions)", video_id, len(captions))

    except Exception as e:
        logger.exception("Pipeline failed for video %s: %s", video_id, e)
        write_status(
            video_id=video_id,
            state="failed",
            progress=0.0,
            message="Caption pipeline failed",
            error=str(e)
        )


async def _queue_worker_loop() -> None:
    """Worker loop consuming one video job at a time."""
    logger.info("Caption pipeline background worker started.")
    while True:
        try:
            video_id = await _pipeline_queue.get()
            try:
                await _process_pipeline_job(video_id)
            finally:
                _pipeline_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in caption worker loop: %s", e)


def start_pipeline_worker() -> None:
    """Start the single background worker task if not already running."""
    global _worker_task
    if _worker_task is None or _worker_task.done():
        try:
            loop = asyncio.get_event_loop()
            _worker_task = loop.create_task(_queue_worker_loop())
        except RuntimeError:
            pass


async def enqueue_video(video_id: str) -> None:
    """Add a video_id to the single-worker background processing queue."""
    start_pipeline_worker()
    await _pipeline_queue.put(video_id)

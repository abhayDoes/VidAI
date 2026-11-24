import logging
import threading
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from app.captions.settings import caption_settings

logger = logging.getLogger("captions.transcribe")

# Fix for PyAV 14+ / 19+ removing deprecated metadata_errors keyword argument expected by faster-whisper
try:
    import av
    _orig_av_open = av.open

    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _safe_av_open
except Exception as _e:
    logger.debug("PyAV patch not applied: %s", _e)

_model_lock = threading.Lock()
_whisper_model_instance = None


def get_whisper_model():
    """Lazily load the faster-whisper model once on CPU with int8 precision."""
    global _whisper_model_instance
    if _whisper_model_instance is None:
        with _model_lock:
            if _whisper_model_instance is None:
                from faster_whisper import WhisperModel
                model_name = caption_settings.WHISPER_MODEL or "base"
                logger.info(
                    "Loading faster-whisper model '%s' (device=cpu, compute_type=int8)...",
                    model_name
                )
                _whisper_model_instance = WhisperModel(
                    model_name,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=4
                )
                logger.info("faster-whisper model '%s' loaded successfully.", model_name)
    return _whisper_model_instance


def transcribe_audio_file(
    audio_path: Path,
    video_duration: float,
    on_progress: Optional[Callable[[float, str], None]] = None
) -> Dict[str, Any]:
    """Transcribe an audio file with faster-whisper and collect word timestamps.

    Runs on CPU with int8 quantization.
    Uses vad_filter=True and word_timestamps=True.
    Updates progress callback dynamically as segments stream in.
    """
    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = get_whisper_model()
    target_language = caption_settings.WHISPER_LANGUAGE or None

    logger.info(
        "Starting transcription on %s (language=%s, duration=%.1fs)...",
        audio_path.name,
        target_language or "auto",
        video_duration
    )

    segments_generator, info = model.transcribe(
        str(audio_path),
        language=target_language,
        task="transcribe",  # Keep spoken language, no translation
        vad_filter=True,
        word_timestamps=True
    )

    detected_lang = info.language
    logger.info(
        "Detected audio language: '%s' (probability=%.2f)",
        detected_lang,
        info.language_probability
    )

    collected_words: List[Dict[str, Any]] = []
    effective_duration = max(1.0, video_duration or info.duration or 1.0)

    for segment in segments_generator:
        # Segment progress calculation (mapped between 20% and 90% of overall pipeline)
        progress_ratio = min(1.0, segment.end / effective_duration)
        current_percent = 20.0 + (progress_ratio * 70.0)

        if on_progress:
            seg_text = segment.text.strip()
            preview = seg_text[:30] + "..." if len(seg_text) > 30 else seg_text
            on_progress(current_percent, f"Transcribing... {round(progress_ratio * 100)}% ({preview})")

        if segment.words:
            for w in segment.words:
                collected_words.append({
                    "word": w.word,
                    "start": round(w.start, 2),
                    "end": round(w.end, 2),
                    "probability": round(w.probability, 2)
                })
        else:
            # Fallback if a segment has no split words
            collected_words.append({
                "word": segment.text.strip(),
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "probability": 1.0
            })

    logger.info(
        "Transcription finished: extracted %s words for video duration %.1fs",
        len(collected_words),
        effective_duration
    )

    return {
        "language": detected_lang,
        "duration": info.duration,
        "words": collected_words
    }

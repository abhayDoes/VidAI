"""Background music generation: analyze video with Gemini and compose audio with ElevenLabs."""

from __future__ import annotations

import datetime
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from google import genai
from google.genai import types

from ..llm.gemini_provider import FALLBACK_MODELS
from .silence import resolve_video_path
from .timeline import load_timeline, total_duration

logger = logging.getLogger("vidai.editor.bgm")

ELEVENLABS_MUSIC_URL = "https://api.elevenlabs.io/v1/music/compose"
ANALYSIS_FILENAME = "video_analysis.json"

_GENERIC_BGM_PHRASES = {
    "add background music",
    "background music",
    "make background music",
    "generate background music",
    "create background music",
    "add bgm",
    "make bgm",
    "generate bgm",
    "bgm",
    "bg music",
    "add music",
    "make music",
    "music lagao",
    "music banao",
    "background music matching the video",
}


def load_video_analysis(video_dir: Path) -> Optional[Dict[str, Any]]:
    """Load cached Gemini video analysis properties from video_analysis.json if available."""
    path = video_dir / ANALYSIS_FILENAME
    if not path.is_file():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("music_prompt"):
            return data
    except Exception as ex:
        logger.warning(f"[BGM] Failed to read cached {ANALYSIS_FILENAME}: {ex}")
    return None


def save_video_analysis(video_dir: Path, analysis: Dict[str, Any]) -> Path:
    """Persist Gemini video analysis properties to video_analysis.json."""
    path = video_dir / ANALYSIS_FILENAME
    payload = dict(analysis)
    payload["analyzed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path


def _call_gemini_json(client: genai.Client, contents: Any) -> Dict[str, Any]:
    """Call Gemini generate_content with fallback models and return parsed JSON."""
    config = types.GenerateContentConfig(
        temperature=0.3,
        response_mime_type="application/json",
    )
    preferred = os.getenv("GEMINI_MODEL")
    models_to_try = [preferred] if preferred else FALLBACK_MODELS
    last_error: Optional[Exception] = None

    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            raw = (response.text or "").strip()
            if raw.startswith("```"):
                lines = raw.splitlines()
                if len(lines) >= 3:
                    raw = "\n".join(lines[1:-1])
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed.get("music_prompt"):
                return parsed
        except Exception as ex:
            err_str = str(ex)
            logger.warning(f"[BGM] Gemini model {model_name} failed: {err_str}")
            last_error = ex
            if "503" in err_str or "404" in err_str or "429" in err_str:
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Gemini did not return a valid music analysis.")


def _get_gemini_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        try:
            from app.core.config import settings
            key = (getattr(settings, "GEMINI_API_KEY", None) or "").strip()
        except Exception:
            pass
    if not key or key.startswith("your_"):
        raise RuntimeError("GEMINI_API_KEY is not configured in backend/.env.")
    return key


def _get_elevenlabs_key() -> str:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        try:
            from app.core.config import settings
            key = (getattr(settings, "ELEVENLABS_API_KEY", None) or "").strip()
        except Exception:
            pass
    if not key or key.startswith("your_"):
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not configured. Add ELEVENLABS_API_KEY=your_key to backend/.env."
        )
    return key


def analyze_video_for_bgm(
    video_path: Path,
    user_prompt: str,
    target_duration: float,
) -> Dict[str, Any]:
    """Upload video to Gemini, analyze visual mood/pacing, and return an ElevenLabs music prompt."""
    client = genai.Client(api_key=_get_gemini_key())
    uploaded_file = None

    try:
        logger.info(f"[BGM] Uploading video to Gemini for analysis: {video_path.name}")
        uploaded_file = client.files.upload(file=str(video_path))

        # Wait until Gemini finishes processing the video file
        deadline = time.time() + 90
        while getattr(uploaded_file.state, "name", "") == "PROCESSING":
            if time.time() > deadline:
                raise TimeoutError("Timed out waiting for Gemini to process video.")
            time.sleep(1.5)
            uploaded_file = client.files.get(name=uploaded_file.name)

        if getattr(uploaded_file.state, "name", "") == "FAILED":
            raise RuntimeError("Gemini failed to process the uploaded video.")

        analysis_instruction = (
            f"Analyze this video's visuals, pacing, energy, setting, and emotional tone. "
            f"The user also requested: \"{user_prompt}\". "
            f"Target track duration is ~{target_duration:.1f} seconds.\n\n"
            "Return ONLY a JSON object with these exact keys:\n"
            '- "summary": 1-2 sentence description of what happens in the video\n'
            '- "setting": visual setting (e.g. "outdoor nature", "indoor studio", "city street", "screen recording")\n'
            '- "pacing": one of "slow", "medium", "fast"\n'
            '- "energy": one of "low", "medium", "high"\n'
            '- "mood": short mood label (e.g. "uplifting", "cinematic", "calm lo-fi", "energetic")\n'
            '- "genre": short genre label (e.g. "ambient electronic", "acoustic folk", "orchestral")\n'
            '- "tempo_bpm": integer BPM (e.g. 105)\n'
            '- "music_prompt": a rich, descriptive 1-2 sentence instrumental music prompt for ElevenLabs Music '
            "(mention instruments, mood, tempo, and dynamics; no lyrics unless user asked for vocals).\n"
            '- "instrumental": boolean (true unless user explicitly asked for singing/vocals)'
        )

        return _call_gemini_json(client, [uploaded_file, analysis_instruction])

    finally:
        if uploaded_file is not None:
            try:
                client.files.delete(name=uploaded_file.name)
            except Exception:
                pass


def adapt_cached_analysis_for_prompt(
    cached: Dict[str, Any],
    user_prompt: str,
    target_duration: float,
) -> Dict[str, Any]:
    """Adapt cached video properties to a specific user BGM style request without re-uploading the video."""
    client = genai.Client(api_key=_get_gemini_key())
    instruction = (
        f"You already analyzed this video. Here are its stored properties:\n"
        f"{json.dumps(cached, indent=2)}\n\n"
        f"Now the user specifically asked: \"{user_prompt}\". "
        f"Target track duration is ~{target_duration:.1f} seconds.\n"
        "Update the music recommendation to match the user's request while staying coherent with the video.\n"
        "Return ONLY a JSON object with keys: "
        '"mood", "genre", "tempo_bpm", "music_prompt", "instrumental".'
    )
    updated = _call_gemini_json(client, instruction)
    merged = dict(cached)
    merged.update(updated)
    return merged


def compose_music_elevenlabs(
    music_prompt: str,
    duration_seconds: float,
    force_instrumental: bool = True,
) -> bytes:
    """Call ElevenLabs Music API (/v1/music/compose) and return MP3 bytes."""
    api_key = _get_elevenlabs_key()
    # ElevenLabs supports 3000ms (3s) to 600000ms (10m); cap at 300000ms (5m) for safety
    music_length_ms = max(3000, min(int(round(duration_seconds * 1000)), 300000))

    payload = {
        "prompt": music_prompt,
        "music_length_ms": music_length_ms,
        "model_id": "music_v2_5",
        "force_instrumental": force_instrumental,
    }

    with httpx.Client(timeout=180.0) as client:
        resp = client.post(
            ELEVENLABS_MUSIC_URL,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code >= 400:
        detail = resp.text[:400]
        raise RuntimeError(f"ElevenLabs API error ({resp.status_code}): {detail}")

    return resp.content


def generate_background_music(
    video_id: str,
    user_prompt: str,
    base_dir: Path | str = "./data/videos",
) -> Dict[str, Any]:
    """Analyze video via Gemini and generate matching background music via ElevenLabs."""
    video_path = resolve_video_path(video_id, base_dir)
    if not video_path:
        raise FileNotFoundError(f"Source video not found for video_id '{video_id}'.")

    tl = load_timeline(video_id, base_dir)
    target_duration = total_duration(tl) if tl else 15.0
    if target_duration <= 0:
        target_duration = 15.0

    video_dir = video_path.parent
    cached_analysis = load_video_analysis(video_dir)
    normalized_prompt = " ".join(user_prompt.lower().split())

    if cached_analysis:
        logger.info(f"[BGM] Reusing cached {ANALYSIS_FILENAME} for video_id={video_id}")
        if normalized_prompt in _GENERIC_BGM_PHRASES:
            analysis = cached_analysis
        else:
            analysis = adapt_cached_analysis_for_prompt(
                cached=cached_analysis,
                user_prompt=user_prompt,
                target_duration=target_duration,
            )
    else:
        analysis = analyze_video_for_bgm(
            video_path=video_path,
            user_prompt=user_prompt,
            target_duration=target_duration,
        )
        save_video_analysis(video_dir, analysis)

    music_prompt = str(analysis["music_prompt"]).strip()
    instrumental = bool(analysis.get("instrumental", True))

    audio_bytes = compose_music_elevenlabs(
        music_prompt=music_prompt,
        duration_seconds=target_duration,
        force_instrumental=instrumental,
    )

    bgm_dir = video_path.parent / "bgm"
    bgm_dir.mkdir(parents=True, exist_ok=True)
    filename = f"bgm_{uuid.uuid4().hex[:8]}.mp3"
    out_path = bgm_dir / filename
    out_path.write_bytes(audio_bytes)

    return {
        "video_id": video_id,
        "filename": filename,
        "url": f"/videos/{video_id}/bgm/{filename}",
        "music_prompt": music_prompt,
        "mood": str(analysis.get("mood", "custom")),
        "genre": str(analysis.get("genre", "instrumental")),
        "tempo_bpm": analysis.get("tempo_bpm"),
        "duration": round(target_duration, 2),
    }

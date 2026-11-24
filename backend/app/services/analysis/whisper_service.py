import os
import json
import re
import tempfile
import ffmpeg
from typing import List, Dict, Any
from app.core.config import settings


def transcribe_audio(video_path: str) -> List[Dict[str, Any]]:
    """Transcribe speech in video with timestamps using Gemini Multimodal Audio or Whisper."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_audio:
        temp_audio_path = temp_audio.name

    try:
        # 1. Extract audio from video using FFmpeg
        (
            ffmpeg
            .input(video_path)
            .output(temp_audio_path, vn=None, acodec="libmp3lame", ab="128k", loglevel="quiet")
            .run(overwrite_output=True)
        )

        if not os.path.exists(temp_audio_path) or os.path.getsize(temp_audio_path) == 0:
            return []

        # 2. Try Gemini Multimodal Audio transcription (primary & reliable)
        if settings.GEMINI_API_KEY:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=settings.GEMINI_API_KEY)

                with open(temp_audio_path, "rb") as f:
                    audio_bytes = f.read()

                prompt = """Listen to this audio carefully and transcribe all spoken dialogue.
Provide accurate start and end timestamps in seconds for each sentence or phrase.
Respond with a valid JSON array ONLY, matching this schema:
[
  {"start": 0.5, "end": 2.8, "text": "spoken words here"}
]
If there is no speech (only background music, sound effects, or silence), return []."""

                for model_name in ["gemini-3.5-flash-lite", "gemini-3.8-flash"]:
                    try:
                        res = client.models.generate_content(
                            model=model_name,
                            contents=[
                                types.Part.from_bytes(data=audio_bytes, mime_type="audio/mp3"),
                                prompt
                            ]
                        )
                        if res and res.text:
                            match = re.search(r"\[.*\]", res.text, re.DOTALL)
                            if match:
                                segments = json.loads(match.group(0))
                                if isinstance(segments, list) and len(segments) > 0:
                                    return [
                                        {
                                            "start": round(float(s.get("start", 0.0)), 2),
                                            "end": round(float(s.get("end", 0.0)), 2),
                                            "text": str(s.get("text", "")).strip()
                                        }
                                        for s in segments if s.get("text")
                                    ]
                    except Exception:
                        continue
            except Exception:
                pass

        # 3. Fallback to OpenAI Whisper API if configured
        if settings.OPENAI_API_KEY:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.OPENAI_API_KEY)
                with open(temp_audio_path, "rb") as audio_file:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="verbose_json",
                        timestamp_granularities=["segment"]
                    )
                segments = []
                if hasattr(transcript, "segments") and transcript.segments:
                    for seg in transcript.segments:
                        start = getattr(seg, "start", 0.0)
                        end = getattr(seg, "end", 0.0)
                        text = getattr(seg, "text", "")
                        segments.append({
                            "start": round(float(start), 2),
                            "end": round(float(end), 2),
                            "text": text.strip()
                        })
                    return segments
            except Exception:
                pass

        return []
    except Exception as e:
        return []
    finally:
        if os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except Exception:
                pass

import os
import tempfile
import ffmpeg
from typing import List, Dict, Any
from app.core.config import settings


def analyze_visuals(video_path: str, duration: float, scenes: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Extract keyframe images and analyze scene descriptions and tags with Gemini Vision."""
    if not settings.GEMINI_API_KEY or duration <= 0:
        return []

    # Pick 3 to 5 timestamps across the video
    timestamps = []
    if scenes and len(scenes) > 1:
        timestamps = [s.get("midpoint_sec", 0.0) for s in scenes[:5]]
    else:
        step = max(1.0, duration / 4)
        timestamps = [round(i * step, 2) for i in range(1, 4) if (i * step) < duration]

    if not timestamps:
        timestamps = [round(duration / 2, 2)]

    results = []
    temp_frames = []

    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        for ts in timestamps:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
                frame_path = tf.name
            temp_frames.append(frame_path)

            # Extract 1 frame at timestamp
            try:
                (
                    ffmpeg
                    .input(video_path, ss=ts)
                    .output(frame_path, vframes=1, loglevel="quiet")
                    .run(overwrite_output=True)
                )

                if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                    with open(frame_path, "rb") as f:
                        img_bytes = f.read()

                    prompt = (
                        "Analyze this video frame. Give a concise 1-sentence description of the visual scene "
                        "and 3-5 keyword tags. Format: Description: <text> | Tags: <tag1>, <tag2>, <tag3>"
                    )
                    
                    # Use supported Gemini flash model
                    response = None
                    for model_name in ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"]:
                        try:
                            response = client.models.generate_content(
                                model=model_name,
                                contents=[
                                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                                    prompt
                                ]
                            )
                            if response and response.text:
                                break
                        except Exception:
                            continue

                    text_resp = response.text if response and response.text else ""
                    desc = text_resp
                    tags = []
                    if "Tags:" in text_resp:
                        parts = text_resp.split("Tags:")
                        desc = parts[0].replace("Description:", "").strip(" | \n")
                        tags = [t.strip() for t in parts[1].split(",") if t.strip()]

                    results.append({
                        "timestamp": ts,
                        "description": desc,
                        "tags": tags
                    })
            except Exception as fe:
                results.append({
                    "timestamp": ts,
                    "description": f"Frame at {ts}s",
                    "tags": ["video", "clip"],
                    "error": str(fe)
                })

        return results
    except Exception as e:
        return [{"timestamp": 0.0, "description": "Visual analysis unavailable", "tags": [], "error": str(e)}]
    finally:
        for f in temp_frames:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except Exception:
                    pass


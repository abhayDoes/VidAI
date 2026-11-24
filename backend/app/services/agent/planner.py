import json
import re
from typing import Dict, Any
from app.core.config import settings
from .state import AgentState


SYSTEM_PROMPT = """You are the AI Planning Engine of an intelligent Video Editor (VidAI Studio).
You receive a user's natural language editing request along with the video's analysis data (duration, resolution, scene boundaries, speech transcript, visual tags).

Your job is to decide whether the request can be fulfilled using the existing Python Tool Library (Path A), or requires custom Python code generation (Path B).

ALLOWED TOOLS (Path A ONLY):
1. trim(start: float, end: float) - Cut video between start and end timestamps in seconds.
   Example: "trim after 30s" -> start: 30.0, end: <duration>
   Example: "keep only first 15s" -> start: 0.0, end: 15.0
2. resize(aspect_ratio: "16:9" | "9:16" | "1:1" | "4:5") - Reframe video for Shorts/Reels (9:16), YouTube (16:9), Instagram (1:1 or 4:5).
3. change_speed(factor: float) - Slow motion (e.g. 0.5) or speed up (e.g. 1.5, 2.0). Range: 0.25 to 4.0.
4. adjust_audio(volume: float, fade_in: float) - Mute (0.0), lower (0.5), boost (1.5), or add fade-in.
5. add_subtitles() - Burn timestamped subtitles from the audio transcript.
6. merge() - Concatenate segments.

CONVERSATION & GREETING RULES:
- If the user says "hi", "hello", or asks general questions without specifying video edits, set "plan": [] and provide a helpful greeting explaining what video edits you can perform.

ROUTING RULES:
- Use "path_a" for any common request (cuts, highlights, formatting, captions, speed, audio adjustments).
- Use "path_b" ONLY if the request genuinely cannot be achieved with these tools (e.g. custom visual shaders, AI motion tracking, 3D particle animations).

OUTPUT FORMAT:
Respond with valid JSON ONLY matching this exact schema:
{
  "route": "path_a",
  "explanation": "Clear, friendly 1-2 sentence description explaining what edits will be performed",
  "plan": [
    {
      "tool": "trim",
      "params": {"start": 0.0, "end": 15.5}
    }
  ]
}
"""

CANDIDATE_GEMINI_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
]


def plan_edit(state: AgentState) -> Dict[str, Any]:
    """Route user request and generate structured tool execution plan."""
    user_prompt = state.get("user_prompt", "").strip()
    metadata = state.get("video_metadata", {})
    analysis = state.get("analysis_data", {})
    duration = float(metadata.get("duration", 0.0) or 60.0)

    # 1. Quick conversational greeting check
    lower_prompt = user_prompt.lower()
    if lower_prompt in {"hi", "hello", "hey", "hola", "sup", "help"}:
        return {
            "route": "path_a",
            "explanation": f"Hello! I am VidAI Studio's AI assistant. I can trim clips, reframe to 9:16 for Reels/Shorts, add subtitles, adjust speed, and tweak audio for your {duration:.1f}s video. What would you like to do?",
            "plan": []
        }

    # Prepare context summary for LLM
    context_info = {
        "video_duration_seconds": duration,
        "resolution": f"{metadata.get('width', 0)}x{metadata.get('height', 0)}",
        "has_audio": metadata.get("has_audio", False),
        "scene_count": len(analysis.get("scenes", [])),
        "scenes_summary": analysis.get("scenes", [])[:5],
        "transcript_preview": [s.get("text") for s in analysis.get("transcript", [])[:6] if s.get("text")],
        "visual_tags": [t.get("tags") for t in analysis.get("visual_tags", [])[:5]],
    }

    user_message = f"""User request: "{user_prompt}"

Video Analysis Context:
{json.dumps(context_info, indent=2)}
"""

    raw_response = ""
    # Try Gemini flash models with fallback list
    if settings.GEMINI_API_KEY:
        try:
            from google import genai
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            for model_name in CANDIDATE_GEMINI_MODELS:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[SYSTEM_PROMPT, user_message],
                    )
                    if response and response.text:
                        raw_response = response.text
                        break
                except Exception:
                    continue
        except Exception:
            raw_response = ""

    # Parse JSON from response
    if raw_response:
        try:
            match = re.search(r"\{.*\}", raw_response, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                plan = parsed.get("plan", [])
                
                # Sanitize plan tool names
                sanitized_plan = []
                for step in plan:
                    tool_name = step.get("tool")
                    params = step.get("params", {})
                    if tool_name in {"trim", "resize", "change_speed", "adjust_audio", "add_subtitles", "merge"}:
                        sanitized_plan.append({"tool": tool_name, "params": params})

                return {
                    "route": parsed.get("route", "path_a"),
                    "explanation": parsed.get("explanation", f"Applying edits: {user_prompt}"),
                    "plan": sanitized_plan
                }
        except Exception:
            pass

    # 2. Intelligent semantic rule-based fallback if all models timed out
    plan = []
    explanations = []

    # Subtitles & Captions (including common typos like 'subtitels', 'subs')
    if any(k in lower_prompt for k in ["subtitle", "subtitel", "subtitles", "subtitels", "caption", "captions", "transcript", "transcribe", "subs", "subbed"]):
        plan.append({"tool": "add_subtitles", "params": {}})
        explanations.append("Generating and burning styled subtitles onto the video")

    # Resize / aspect ratio
    if any(k in lower_prompt for k in ["9:16", "reel", "reels", "short", "shorts", "tiktok", "vertical"]):
        plan.append({"tool": "resize", "params": {"aspect_ratio": "9:16"}})
        explanations.append("Reframing video to 9:16 vertical aspect ratio")
    elif any(k in lower_prompt for k in ["1:1", "square", "instagram post"]):
        plan.append({"tool": "resize", "params": {"aspect_ratio": "1:1"}})
        explanations.append("Reframing video to 1:1 square aspect ratio")
    elif any(k in lower_prompt for k in ["16:9", "youtube", "horizontal", "landscape"]):
        plan.append({"tool": "resize", "params": {"aspect_ratio": "16:9"}})
        explanations.append("Formatting video to 16:9 widescreen")

    # Trim / cut parsing
    trim_match = re.search(r"(?:trim|cut)\s+(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?", lower_prompt)
    if trim_match:
        s_val = float(trim_match.group(1))
        e_val = float(trim_match.group(2))
        plan.append({"tool": "trim", "params": {"start": s_val, "end": min(e_val, duration)}})
        explanations.append(f"Trimming clip from {s_val}s to {e_val}s")
    else:
        # "after 30s" or "after 30 seconds"
        after_match = re.search(r"after\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?", lower_prompt)
        if after_match:
            s_val = float(after_match.group(1))
            plan.append({"tool": "trim", "params": {"start": s_val, "end": duration}})
            explanations.append(f"Trimming video to keep everything after {s_val}s")
        else:
            # "first 15s"
            first_match = re.search(r"first\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?", lower_prompt)
            if first_match:
                e_val = float(first_match.group(1))
                plan.append({"tool": "trim", "params": {"start": 0.0, "end": min(e_val, duration)}})
                explanations.append(f"Trimming to keep the first {e_val}s")

    # Speed
    speed_match = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(?:speed|faster)?", lower_prompt)
    if speed_match:
        factor = float(speed_match.group(1))
        plan.append({"tool": "change_speed", "params": {"factor": factor}})
        explanations.append(f"Adjusting video playback speed to {factor}x")
    elif "slow motion" in lower_prompt or "slow-mo" in lower_prompt:
        plan.append({"tool": "change_speed", "params": {"factor": 0.5}})
        explanations.append("Applying 0.5x slow-motion")

    # Audio
    if "mute" in lower_prompt or "silent" in lower_prompt or "remove audio" in lower_prompt:
        plan.append({"tool": "adjust_audio", "params": {"volume": 0.0}})
        explanations.append("Muting background audio")

    explanation_text = " & ".join(explanations) if explanations else f"Applied requested edits: {user_prompt}"
    return {
        "route": "path_a",
        "explanation": explanation_text,
        "plan": plan
    }

"""Google Gemini LLM provider using the official google-genai SDK."""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from .base import LLMProvider

logger = logging.getLogger("vidai.llm.gemini")

FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
]


class GeminiProvider(LLMProvider):
    """Translates video editing prompts using Google Gemini models with resilience fallback."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError(
                "GEMINI_API_KEY is required for GeminiProvider. "
                "Please configure it in backend/.env."
            )
        self.preferred_model = model or os.getenv("GEMINI_MODEL")
        self.models_to_try: List[str] = (
            [self.preferred_model] if self.preferred_model else FALLBACK_MODELS
        )
        self.client = genai.Client(api_key=key)

    def generate_json(
        self,
        system: str,
        user: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.0,
            response_mime_type="application/json",
        )

        last_error = None
        for model_name in self.models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=user,
                    config=config,
                )
                raw_text = (response.text or "").strip()
                if not raw_text:
                    return {}

                try:
                    return json.loads(raw_text)
                except json.JSONDecodeError:
                    cleaned = raw_text
                    if cleaned.startswith("```"):
                        lines = cleaned.splitlines()
                        if len(lines) >= 3:
                            cleaned = "\n".join(lines[1:-1])
                    return json.loads(cleaned)

            except Exception as ex:
                err_str = str(ex)
                logger.warning(f"Model {model_name} failed: {err_str}, trying fallback...")
                last_error = ex
                # Try next model if 503 (high demand) or 404 (model moved)
                if "503" in err_str or "404" in err_str or "429" in err_str:
                    continue
                else:
                    raise ex

        if last_error:
            raise last_error
        return {}

"""Ollama local LLM provider for zero-API offline translation."""

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from .base import LLMProvider

DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"


class OllamaProvider(LLMProvider):
    """Translates video editing prompts using locally running Ollama models."""

    def __init__(self, host: Optional[str] = None, model: Optional[str] = None):
        self.host = (host or os.getenv("OLLAMA_HOST", DEFAULT_OLLAMA_HOST)).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)

    def generate_json(
        self,
        system: str,
        user: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.host}/api/generate"
        payload = {
            "model": self.model,
            "system": system,
            "prompt": user,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.0},
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                response_text = res_data.get("response", "{}")
                return json.loads(response_text)
        except urllib.error.URLError as e:
            raise RuntimeError(
                f"Failed to connect to Ollama at {self.host}: {e.reason}. "
                "Ensure Ollama is running or configure GEMINI_API_KEY in backend/.env."
            ) from e

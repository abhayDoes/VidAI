"""Factory to retrieve configured LLMProvider."""

import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from .base import LLMProvider
from .gemini_provider import GeminiProvider
from .ollama_provider import OllamaProvider


def get_provider(provider_type: Optional[str] = None) -> LLMProvider:
    """Retrieve an initialized LLMProvider instance.

    Priority:
    1. Explicit provider_type if specified ("gemini" or "ollama").
    2. LLM_PROVIDER environment variable ("gemini" or "ollama").
    3. Auto-detected GEMINI_API_KEY in environment or app settings.
    4. Auto-detected OLLAMA_HOST in environment.
    5. Raises clear error directing user to configure .env or Ollama.
    """
    load_dotenv()
    chosen = (provider_type or os.getenv("LLM_PROVIDER", "")).strip().lower()

    if chosen == "gemini":
        return GeminiProvider()
    elif chosen == "ollama":
        return OllamaProvider()

    # Auto-detection
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        try:
            from app.core.config import settings
            gemini_key = (getattr(settings, "GEMINI_API_KEY", None) or "").strip()
        except Exception:
            pass

    if gemini_key and not gemini_key.startswith("your_"):
        return GeminiProvider(api_key=gemini_key)

    ollama_host = os.getenv("OLLAMA_HOST", "").strip()
    if ollama_host:
        return OllamaProvider(host=ollama_host)

    raise RuntimeError(
        "No LLM provider is configured. "
        "Set GEMINI_API_KEY in backend/.env or run Ollama locally on http://localhost:11434 "
        "and set LLM_PROVIDER=ollama in backend/.env."
    )

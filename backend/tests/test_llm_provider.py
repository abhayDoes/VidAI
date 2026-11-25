"""Unit tests for LLM provider layer and factory."""

from typing import Any, Dict, Optional
import pytest

from backend.llm.base import LLMProvider
from backend.llm.factory import get_provider
from backend.llm.gemini_provider import GeminiProvider
from backend.llm.ollama_provider import OllamaProvider


class FakeLLMProvider(LLMProvider):
    """Test fake provider returning canned responses."""

    def __init__(self, canned_response: Optional[Dict[str, Any]] = None):
        self.canned_response = canned_response or {
            "operations": [{"op": "trim_keep", "params": {"start": 0.0, "end": 10.0}}],
            "message": "Trimmed to first 10 seconds.",
        }
        self.last_system = ""
        self.last_user = ""

    def generate_json(
        self,
        system: str,
        user: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.last_system = system
        self.last_user = user
        return self.canned_response


def test_fake_provider():
    """Verify FakeLLMProvider interface compliance."""
    provider = FakeLLMProvider()
    res = provider.generate_json(system="You are an editor.", user="cut 0 to 5")
    assert "operations" in res
    assert res["operations"][0]["op"] == "trim_keep"
    assert provider.last_user == "cut 0 to 5"


def test_gemini_provider_missing_key(monkeypatch):
    """Verify GeminiProvider raises error when GEMINI_API_KEY is not set."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValueError) as exc:
        GeminiProvider(api_key=None)
    assert "GEMINI_API_KEY is required" in str(exc.value)


def test_ollama_provider_init(monkeypatch):
    """Verify OllamaProvider initializes with custom host or defaults."""
    monkeypatch.setenv("OLLAMA_HOST", "http://127.0.0.1:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")
    provider = OllamaProvider()
    assert provider.host == "http://127.0.0.1:11434"
    assert provider.model == "qwen2.5:7b"


def test_get_provider_gemini_selection(monkeypatch):
    """Factory returns GeminiProvider when GEMINI_API_KEY is present."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    provider = get_provider()
    assert isinstance(provider, GeminiProvider)


def test_get_provider_ollama_selection(monkeypatch):
    """Factory returns OllamaProvider when LLM_PROVIDER=ollama."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    provider = get_provider()
    assert isinstance(provider, OllamaProvider)


def test_get_provider_unconfigured_error(monkeypatch):
    """Factory raises clear guidance when no provider is configured."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("OLLAMA_HOST", raising=False)
    with pytest.raises(RuntimeError) as exc:
        get_provider()
    assert "No LLM provider is configured" in str(exc.value)
    assert "GEMINI_API_KEY" in str(exc.value)

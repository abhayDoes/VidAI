"""Base interface for LLM providers."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class LLMProvider(ABC):
    """Abstract base class for all LLM translation providers."""

    @abstractmethod
    def generate_json(
        self,
        system: str,
        user: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate structured JSON response given system prompt and user input.

        Args:
            system: System instructions and role prompt.
            user: User prompt and contextual information.
            json_schema: Optional JSON schema dictionary to enforce output structure.

        Returns:
            Parsed JSON dict.
        """
        pass

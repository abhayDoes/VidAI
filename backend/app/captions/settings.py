import os
from pathlib import Path
from typing import Optional, Set
from pydantic_settings import BaseSettings

# Absolute path to backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class CaptionSettings(BaseSettings):
    """Configuration for video uploads, storage, and captions pipeline."""

    UPLOAD_DIR: str = "./data/videos"
    MAX_UPLOAD_MB: int = 500
    WHISPER_MODEL: str = "base"
    WHISPER_LANGUAGE: Optional[str] = None

    # Caption formatting constants (NOT magic numbers)
    MAX_CHARS_PER_LINE: int = 42
    MAX_LINES_PER_CAPTION: int = 2
    MAX_DURATION_SECONDS: float = 5.0
    MIN_DURATION_SECONDS: float = 0.7
    ALLOWED_EXTENSIONS: Set[str] = {".mp4", ".mov", ".mkv", ".webm"}

    @property
    def upload_path(self) -> Path:
        """Return resolved absolute pathlib.Path for uploads directory."""
        raw_path = Path(self.UPLOAD_DIR)
        if raw_path.is_absolute():
            return raw_path
        return (BACKEND_DIR / raw_path).resolve()

    class Config:
        env_file = BACKEND_DIR / ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


caption_settings = CaptionSettings()

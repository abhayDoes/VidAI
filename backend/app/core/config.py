from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "VidAI Studio"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # API Keys
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    ELEVENLABS_API_KEY: Optional[str] = None

    # Pluggable Database (absolute path to SQLite file, swappable to postgresql://)
    DATABASE_URL: str = f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'video_editor.db')}"

    # Pluggable Storage
    STORAGE_BACKEND: str = "local"  # "local" or "r2"
    STORAGE_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "videos")

    # Cloudflare R2 Credentials (for future plug-in)
    R2_ACCOUNT_ID: Optional[str] = None
    R2_ACCESS_KEY_ID: Optional[str] = None
    R2_SECRET_ACCESS_KEY: Optional[str] = None
    R2_BUCKET_NAME: Optional[str] = None
    R2_PUBLIC_URL: Optional[str] = None

    # Pluggable Queue
    QUEUE_BACKEND: str = "asyncio"  # "asyncio" or "celery"
    REDIS_URL: str = "redis://localhost:6379/0"

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()


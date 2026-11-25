import os
from pathlib import Path
from app.core.config import settings


class LocalStorageService:
    """Local filesystem storage backend for videos, previews, and rendered outputs."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or settings.STORAGE_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, rel_path: str) -> Path:
        clean_rel = rel_path.lstrip("/\\")
        target = (self.base_dir / clean_rel).resolve()
        if target != self.base_dir and self.base_dir not in target.parents:
            raise ValueError(f"Invalid storage path: {rel_path}")
        return target

    async def save_file(self, filename: str, content: bytes, folder: str = "videos") -> str:
        """Persist bytes under storage/<folder>/<filename> and return relative path."""
        safe_name = Path(filename).name
        clean_folder = folder.strip("/\\")
        rel_path = f"{clean_folder}/{safe_name}" if clean_folder else safe_name
        dest_path = self._resolve_safe_path(rel_path)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(content)
        return rel_path

    def get_file_path(self, rel_path: str) -> str:
        """Return absolute local filesystem path for a relative storage path."""
        return str(self._resolve_safe_path(rel_path))

    def get_public_url(self, rel_path: str) -> str:
        """Return public URL path served by FastAPI's /storage mount."""
        clean_rel = rel_path.replace("\\", "/").lstrip("/")
        if settings.STORAGE_BACKEND.lower() == "r2" and settings.R2_PUBLIC_URL:
            return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{clean_rel}"
        return f"/storage/{clean_rel}"


_storage_instance: LocalStorageService | None = None


def get_storage_service() -> LocalStorageService:
    """Return the configured storage adapter instance."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalStorageService()
    return _storage_instance

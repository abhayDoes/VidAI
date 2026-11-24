from abc import ABC, abstractmethod
from typing import Dict, Any, Callable, Coroutine


class BaseTaskQueue(ABC):
    """Abstract interface for background job execution.
    Allows seamlessly switching between local asyncio background tasks and Celery + Redis.
    """

    @abstractmethod
    async def enqueue(self, job_type: str, payload: Dict[str, Any], project_id: str = None, video_id: str = None) -> str:
        """Enqueue a job and return its job_id."""
        pass

    @abstractmethod
    async def update_progress(self, job_id: str, progress: float, stage: str = "", result: dict = None, error: str = None):
        """Update job progress and broadcast status event."""
        pass

    @abstractmethod
    def register_handler(self, job_type: str, handler: Callable[..., Coroutine]):
        """Register a worker function for a specific job_type."""
        pass


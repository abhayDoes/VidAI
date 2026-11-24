from app.core.config import settings
from .base import BaseTaskQueue
from .memory_queue import MemoryTaskQueue
from .celery_queue import CeleryTaskQueue

_queue_instance: BaseTaskQueue = None


def get_task_queue() -> BaseTaskQueue:
    global _queue_instance
    if _queue_instance is None:
        if settings.QUEUE_BACKEND.lower() == "celery":
            _queue_instance = CeleryTaskQueue()
        else:
            _queue_instance = MemoryTaskQueue()
    return _queue_instance


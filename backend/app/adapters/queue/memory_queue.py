import asyncio
import traceback
from typing import Dict, Any, Callable, Coroutine
from .base import BaseTaskQueue
from app.adapters.database.session import SessionLocal
from app.adapters.database.models import Job
from app.api.websockets import ws_manager


class MemoryTaskQueue(BaseTaskQueue):
    def __init__(self):
        self.handlers: Dict[str, Callable[..., Coroutine]] = {}

    def register_handler(self, job_type: str, handler: Callable[..., Coroutine]):
        self.handlers[job_type] = handler

    async def enqueue(self, job_type: str, payload: Dict[str, Any], project_id: str = None, video_id: str = None) -> str:
        db = SessionLocal()
        job = Job(
            project_id=project_id,
            video_id=video_id,
            job_type=job_type,
            status="queued",
            progress=0.0,
            stage="Queued in background",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id
        db.close()

        # Fire async background task
        asyncio.create_task(self._run_job(job_id, job_type, payload, project_id))
        return job_id

    async def _run_job(self, job_id: str, job_type: str, payload: Dict[str, Any], project_id: str = None):
        handler = self.handlers.get(job_type)
        if not handler:
            await self.update_progress(job_id, 100.0, stage="Failed", error=f"No handler registered for {job_type}", project_id=project_id)
            return

        try:
            await self.update_progress(job_id, 5.0, stage=f"Running {job_type}", project_id=project_id)
            result = await handler(job_id=job_id, payload=payload, update_progress=self.update_progress)
            await self.update_progress(job_id, 100.0, stage="Completed", result=result, project_id=project_id)
        except Exception as e:
            err_msg = f"{str(e)}\n{traceback.format_exc()}"
            await self.update_progress(job_id, 100.0, stage="Failed", error=err_msg, project_id=project_id)

    async def update_progress(self, job_id: str, progress: float, stage: str = "", result: dict = None, error: str = None, project_id: str = None):
        db = SessionLocal()
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.progress = progress
            if stage:
                job.stage = stage
            if error:
                job.status = "failed"
                job.error = error
            elif progress >= 100.0:
                job.status = "completed"
                if result:
                    job.result = result
            else:
                job.status = "running"
            db.commit()
            
            proj_id = project_id or job.project_id
            # Broadcast WebSocket status event
            event = {
                "type": "job_progress",
                "job_id": job.id,
                "job_type": job.job_type,
                "project_id": proj_id,
                "status": job.status,
                "progress": job.progress,
                "stage": job.stage,
                "result": job.result if job.status == "completed" else None,
                "error": job.error if job.status == "failed" else None,
            }
            db.close()
            await ws_manager.broadcast(event, project_id=proj_id)
        else:
            db.close()


"""FastAPI router for video editor prompt planning, timeline management, and rendering."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from backend.editor.planner import (
    load_last_plan,
    plan_edit,
    update_plan_status,
)
from backend.editor.renderer import (
    get_render_job,
    get_renders_dir,
    is_render_running,
    start_render,
)
from backend.editor.timeline import (
    Timeline,
    create_initial_timeline,
    get_timeline_path,
    list_timeline_versions,
    load_timeline,
    load_timeline_version,
    save_timeline,
    total_duration,
)
from backend.llm.factory import get_provider

logger = logging.getLogger("vidai.editor")
router = APIRouter(tags=["editor"])


class PlanRequest(BaseModel):
    prompt: str = Field(..., max_length=1000, description="Natural language editing instruction")


class PlannedOpResponse(BaseModel):
    op: str
    params: Dict[str, Any]
    description: str


class PlanResponse(BaseModel):
    plan_id: str
    operations: List[PlannedOpResponse]
    message: str
    resulting_timeline: Dict[str, Any]


class TimelineResponse(BaseModel):
    video_id: str
    source_duration: float
    total_duration: float
    version: int
    segments: List[Dict[str, Any]]


def _get_base_dir() -> Path:
    try:
        from app.core.config import settings
        upload_dir = getattr(settings, "UPLOAD_DIR", None)
    except Exception:
        upload_dir = None
    if not upload_dir:
        upload_dir = os.getenv("UPLOAD_DIR", "./data/videos")
    p = Path(upload_dir)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent / p
    return p


@router.get("/{video_id}/timeline", response_model=TimelineResponse)
async def get_timeline_endpoint(video_id: str):
    """Get the current active timeline and total output duration for a video."""
    base_dir = _get_base_dir()
    tl = load_timeline(video_id, base_dir)
    if not tl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No timeline found for video '{video_id}'. Ensure the video was uploaded first.",
        )

    return TimelineResponse(
        video_id=tl.video_id,
        source_duration=tl.source_duration,
        total_duration=total_duration(tl),
        version=tl.version,
        segments=[seg.model_dump() for seg in tl.segments],
    )


@router.post("/{video_id}/plan", response_model=PlanResponse)
async def create_plan_endpoint(video_id: str, request: PlanRequest):
    """Translate user prompt into a candidate editing plan without altering the active timeline."""
    base_dir = _get_base_dir()

    # Reject plan creation if a render is running
    if is_render_running(video_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A render job is currently active for this video. Wait for it to complete.",
        )

    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt cannot be empty.",
        )

    # Initialize LLM provider
    try:
        provider = get_provider()
    except RuntimeError as ex:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(ex),
        )

    plan, errors = plan_edit(prompt, video_id, provider, base_dir=base_dir)
    if errors or not plan:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errors": errors, "message": "Failed to create a valid editing plan."},
        )

    # Log plan without secrets
    op_names = [op.op for op in plan.operations]
    logger.info(f"[Editor Plan] video_id={video_id} prompt='{prompt[:80]}' ops={op_names}")

    # Load stored record to get its generated plan_id
    record = load_last_plan(video_id, base_dir)
    plan_id = record["plan_id"] if record else "plan_default"

    return PlanResponse(
        plan_id=plan_id,
        operations=[
            PlannedOpResponse(op=op.op, params=op.params, description=op.description)
            for op in plan.operations
        ],
        message=plan.message,
        resulting_timeline=plan.resulting_timeline.model_dump(),
    )


@router.post("/{video_id}/plan/{plan_id}/approve", response_model=TimelineResponse)
async def approve_plan_endpoint(video_id: str, plan_id: str):
    """Approve candidate plan, commit resulting timeline, and record history snapshot."""
    base_dir = _get_base_dir()
    record = load_last_plan(video_id, base_dir)
    if not record or record.get("plan_id") != plan_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan '{plan_id}' not found for video '{video_id}'.",
        )

    if record.get("status") == "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan has already been approved.",
        )

    # Parse resulting timeline and commit
    resulting_data = record.get("resulting_timeline")
    if not resulting_data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Plan does not contain resulting timeline data.",
        )

    new_timeline = Timeline.model_validate(resulting_data)
    save_timeline(new_timeline, base_dir)
    update_plan_status(video_id, "approved", base_dir)

    logger.info(f"[Editor Approved] video_id={video_id} plan_id={plan_id} new_version={new_timeline.version}")

    return TimelineResponse(
        video_id=new_timeline.video_id,
        source_duration=new_timeline.source_duration,
        total_duration=total_duration(new_timeline),
        version=new_timeline.version,
        segments=[seg.model_dump() for seg in new_timeline.segments],
    )


@router.post("/{video_id}/plan/{plan_id}/reject")
async def reject_plan_endpoint(video_id: str, plan_id: str):
    """Reject candidate plan and mark it as discarded."""
    base_dir = _get_base_dir()
    record = load_last_plan(video_id, base_dir)
    if not record or record.get("plan_id") != plan_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan '{plan_id}' not found for video '{video_id}'.",
        )

    update_plan_status(video_id, "rejected", base_dir)
    logger.info(f"[Editor Rejected] video_id={video_id} plan_id={plan_id}")

    return {"status": "rejected", "message": f"Plan '{plan_id}' was rejected."}


@router.post("/{video_id}/timeline/undo", response_model=TimelineResponse)
async def undo_timeline_endpoint(video_id: str):
    """Revert the active timeline to its previous version."""
    base_dir = _get_base_dir()
    current_tl = load_timeline(video_id, base_dir)
    if not current_tl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline not found.")

    versions = list_timeline_versions(video_id, base_dir)
    if len(versions) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No previous timeline version to undo.",
        )

    # Revert to previous version
    prev_version_num = versions[-2]
    prev_tl = load_timeline_version(video_id, prev_version_num, base_dir)
    if not prev_tl:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load snapshot for version {prev_version_num}.",
        )

    # Save as new version advancing history
    reverted_tl = Timeline(
        video_id=prev_tl.video_id,
        source_duration=prev_tl.source_duration,
        segments=prev_tl.segments,
        version=current_tl.version + 1,
    )
    save_timeline(reverted_tl, base_dir)

    logger.info(f"[Editor Undo] video_id={video_id} reverted_to=v{prev_version_num} new_v={reverted_tl.version}")

    return TimelineResponse(
        video_id=reverted_tl.video_id,
        source_duration=reverted_tl.source_duration,
        total_duration=total_duration(reverted_tl),
        version=reverted_tl.version,
        segments=[seg.model_dump() for seg in reverted_tl.segments],
    )


@router.post("/{video_id}/render")
async def start_render_endpoint(video_id: str):
    """Trigger background FFmpeg render job for the active timeline."""
    base_dir = _get_base_dir()
    job_id, err = start_render(video_id, base_dir)
    if err:
        status_code = status.HTTP_409_CONFLICT if "already running" in err else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err)

    logger.info(f"[Editor Render Started] video_id={video_id} job_id={job_id}")
    return {"job_id": job_id, "video_id": video_id, "status": "queued"}


@router.get("/{video_id}/render/{job_id}")
async def get_render_status_endpoint(video_id: str, job_id: str):
    """Retrieve progress and completion status for a render job."""
    base_dir = _get_base_dir()
    job = get_render_job(job_id, video_id, base_dir)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Render job '{job_id}' not found.",
        )

    return {
        "job_id": job.job_id,
        "video_id": job.video_id,
        "status": job.status,
        "progress": job.progress,
        "error": job.error,
    }


@router.get("/{video_id}/render/{job_id}/download")
async def download_render_endpoint(
    video_id: str,
    job_id: str,
    request: Request,
    range: Optional[str] = Header(None),
):
    """Download the rendered MP4 file with byte-range streaming support."""
    base_dir = _get_base_dir()
    job = get_render_job(job_id, video_id, base_dir)
    if not job or job.status != "done" or not job.output_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rendered file for job '{job_id}' is not ready or failed.",
        )

    file_path = Path(job.output_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rendered file does not exist on disk.",
        )

    file_size = file_path.stat().st_size

    # Handle Range requests for video seeking in browsers
    if range:
        try:
            byte_range = range.replace("bytes=", "").split("-")
            start = int(byte_range[0])
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
            length = (end - start) + 1

            def iterfile():
                with open(file_path, "rb") as f:
                    f.seek(start)
                    bytes_left = length
                    while bytes_left > 0:
                        chunk = f.read(min(bytes_left, 1024 * 1024))
                        if not chunk:
                            break
                        bytes_left -= len(chunk)
                        yield chunk

            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Type": "video/mp4",
            }
            return StreamingResponse(iterfile(), status_code=206, headers=headers)
        except Exception:
            pass

    return FileResponse(
        path=str(file_path),
        media_type="video/mp4",
        filename=f"{video_id}_final.mp4",
        headers={"Accept-Ranges": "bytes"},
    )

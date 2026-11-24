import os
import uuid
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.adapters.database.session import get_db, SessionLocal
from app.adapters.database.models import (
    User, Project, Video, VideoAnalysis, EditSession,
    TimelineVersion, Job, Output
)
from app.adapters.storage import get_storage_service
from app.adapters.queue import get_task_queue
from app.services.agent import run_agent
from app.services.analysis.ffprobe_service import extract_metadata


router = APIRouter()


# -------------------------------------------------------------
# Schemas
# -------------------------------------------------------------
class ChatRequest(BaseModel):
    project_id: str
    video_id: str
    prompt: str


class PreviewRequest(BaseModel):
    project_id: str
    video_id: str
    plan: List[Dict[str, Any]] = Field(default_factory=list)


class RenderRequest(BaseModel):
    project_id: str
    video_id: str
    plan: List[Dict[str, Any]] = Field(default_factory=list)


# -------------------------------------------------------------
# Video Upload & Management
# -------------------------------------------------------------
@router.post("/videos/upload")
async def upload_video(
    video: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a video file, create Project & Video records, and return initial metadata."""
    storage = get_storage_service()

    # Create or retrieve project
    project = None
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        project = Project(name=f"Project - {video.filename}")
        db.add(project)
        db.commit()
        db.refresh(project)

    # Save file to storage
    content = await video.read()
    clean_filename = f"{uuid.uuid4().hex[:6]}_{video.filename}"
    rel_path = await storage.save_file(clean_filename, content, folder="videos")
    full_path = storage.get_file_path(rel_path)

    # Fast initial metadata probe
    meta = extract_metadata(full_path)

    video_record = Video(
        project_id=project.id,
        filename=video.filename,
        storage_path=rel_path,
        duration=meta.get("duration", 0.0),
        width=meta.get("width", 0),
        height=meta.get("height", 0),
        fps=meta.get("fps", 0.0),
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    public_url = storage.get_public_url(rel_path)

    return {
        "project_id": project.id,
        "video_id": video_record.id,
        "filename": video_record.filename,
        "duration": video_record.duration,
        "width": video_record.width,
        "height": video_record.height,
        "fps": video_record.fps,
        "url": public_url,
    }


@router.post("/videos/upload-url")
async def get_upload_url(filename: str, project_id: Optional[str] = None):
    """Return signed direct upload URL (or local upload endpoint in local mode)."""
    storage = get_storage_service()
    clean_filename = f"{uuid.uuid4().hex[:6]}_{filename}"
    rel_path = f"videos/{clean_filename}"
    
    # In R2 mode returns signed PUT URL; in local mode returns upload endpoint info
    return {
        "upload_url": f"/api/videos/upload",
        "method": "POST",
        "object_key": rel_path,
        "public_url": storage.get_public_url(rel_path),
    }


# -------------------------------------------------------------
# Video Analysis
# -------------------------------------------------------------
@router.post("/videos/{video_id}/analyze")
async def enqueue_analysis(video_id: str, db: Session = Depends(get_db)):
    """Trigger parallel video analysis (FFprobe, PySceneDetect, Whisper, Vision)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if analysis already exists (Caching)
    existing_analysis = db.query(VideoAnalysis).filter(
        VideoAnalysis.video_id == video_id,
        VideoAnalysis.status == "completed"
    ).first()

    if existing_analysis:
        return {
            "status": "completed",
            "cached": True,
            "data": {
                "metadata": existing_analysis.metadata_json,
                "scenes": existing_analysis.scenes,
                "transcript": existing_analysis.transcript,
                "visual_tags": existing_analysis.visual_tags,
            }
        }

    storage = get_storage_service()
    file_path = storage.get_file_path(video.storage_path)
    queue = get_task_queue()

    job_id = await queue.enqueue(
        job_type="analysis",
        payload={
            "video_id": video.id,
            "project_id": video.project_id,
            "file_path": file_path,
        },
        project_id=video.project_id,
        video_id=video.id,
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Parallel analysis enqueued"
    }


@router.get("/videos/{video_id}/analysis")
async def get_video_analysis(video_id: str, db: Session = Depends(get_db)):
    """Retrieve combined analysis record for a video."""
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {
        "video_id": video_id,
        "status": analysis.status,
        "metadata": analysis.metadata_json,
        "scenes": analysis.scenes,
        "transcript": analysis.transcript,
        "visual_tags": analysis.visual_tags,
    }


# -------------------------------------------------------------
# LangGraph Agent Chat
# -------------------------------------------------------------
@router.post("/agent/chat")
async def agent_chat(req: ChatRequest, db: Session = Depends(get_db)):
    """Send natural language instruction; LangGraph routes to Path A or B and plans edits."""
    video = db.query(Video).filter(Video.id == req.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == req.video_id).first()
    analysis_data = {
        "scenes": analysis.scenes if analysis else [],
        "transcript": analysis.transcript if analysis else [],
        "visual_tags": analysis.visual_tags if analysis else [],
    }

    metadata = {
        "duration": video.duration,
        "width": video.width,
        "height": video.height,
        "fps": video.fps,
        "has_audio": True,
    }

    # Fetch conversation history
    session = db.query(EditSession).filter(EditSession.project_id == req.project_id).first()
    if not session:
        session = EditSession(project_id=req.project_id, history=[])
        db.add(session)
        db.commit()
        db.refresh(session)

    # Run LangGraph StateGraph
    initial_state = {
        "user_prompt": req.prompt,
        "video_id": req.video_id,
        "video_metadata": metadata,
        "analysis_data": analysis_data,
        "history": session.history or [],
        "route": "path_a",
        "explanation": "",
        "plan": [],
        "is_valid": True,
        "validation_errors": []
    }

    final_state = await run_agent(initial_state)

    route = final_state.get("route", "path_a")
    explanation = final_state.get("explanation", "")
    plan = final_state.get("plan", [])
    errors = final_state.get("validation_errors", [])

    # Update session history
    new_history = list(session.history or [])
    new_history.append({"role": "user", "content": req.prompt})
    new_history.append({
        "role": "agent",
        "route": route,
        "content": explanation,
        "plan": plan,
        "errors": errors
    })
    session.history = new_history
    db.commit()

    # Automatically trigger low-resolution preview if plan is valid
    preview_job_id = None
    if route == "path_a" and final_state.get("is_valid", True) and plan:
        queue = get_task_queue()
        preview_job_id = await queue.enqueue(
            job_type="preview",
            payload={
                "project_id": req.project_id,
                "video_id": req.video_id,
                "plan": plan
            },
            project_id=req.project_id,
            video_id=req.video_id
        )

    return {
        "route": route,
        "explanation": explanation,
        "plan": plan,
        "is_valid": final_state.get("is_valid", True),
        "validation_errors": errors,
        "preview_job_id": preview_job_id,
    }


# -------------------------------------------------------------
# Previews & Renders (Preview-First Flow)
# -------------------------------------------------------------
@router.post("/previews")
async def trigger_preview(req: PreviewRequest, db: Session = Depends(get_db)):
    """Render a fast low-resolution or short preview."""
    queue = get_task_queue()
    job_id = await queue.enqueue(
        job_type="preview",
        payload={
            "project_id": req.project_id,
            "video_id": req.video_id,
            "plan": req.plan
        },
        project_id=req.project_id,
        video_id=req.video_id
    )
    return {"job_id": job_id, "status": "queued"}


@router.post("/renders")
async def trigger_render(req: RenderRequest, db: Session = Depends(get_db)):
    """Render full-quality final video after user approval."""
    queue = get_task_queue()
    job_id = await queue.enqueue(
        job_type="render",
        payload={
            "project_id": req.project_id,
            "video_id": req.video_id,
            "plan": req.plan
        },
        project_id=req.project_id,
        video_id=req.video_id
    )
    return {"job_id": job_id, "status": "queued"}


# -------------------------------------------------------------
# Jobs & Outputs
# -------------------------------------------------------------
@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Retrieve status, progress percentage, and result of any job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    result_data = job.result
    if isinstance(result_data, str):
        try:
            result_data = json.loads(result_data)
        except Exception:
            pass

    return {
        "job_id": job.id,
        "project_id": job.project_id,
        "job_type": job.job_type,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "result": result_data,
        "error": job.error,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None
    }


@router.get("/outputs/{output_id}/download-url")
async def get_download_url(output_id: str, db: Session = Depends(get_db)):
    """Retrieve direct or signed download URL for an output."""
    output = db.query(Output).filter(Output.id == output_id).first()
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    return {
        "output_id": output.id,
        "filename": output.filename,
        "output_type": output.output_type,
        "download_url": output.url,
        "duration": output.duration
    }


@router.get("/projects/{project_id}/outputs")
async def get_project_outputs(project_id: str, db: Session = Depends(get_db)):
    """List all preview and final outputs for a project."""
    outputs = db.query(Output).filter(Output.project_id == project_id).all()
    return [
        {
            "id": out.id,
            "filename": out.filename,
            "output_type": out.output_type,
            "url": out.url,
            "duration": out.duration,
            "created_at": out.created_at.isoformat() if out.created_at else None
        }
        for out in outputs
    ]


@router.get("/projects/{project_id}/timeline")
async def get_project_timeline(project_id: str, db: Session = Depends(get_db)):
    """Retrieve latest timeline state."""
    timeline = (
        db.query(TimelineVersion)
        .filter(TimelineVersion.project_id == project_id)
        .order_by(TimelineVersion.version_number.desc())
        .first()
    )
    if not timeline:
        return {"project_id": project_id, "version": 0, "tracks": []}
    return {
        "project_id": project_id,
        "version": timeline.version_number,
        "tracks": timeline.tracks_data,
        "action": timeline.action_description
    }


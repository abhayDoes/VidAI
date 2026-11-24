import os
import uuid
from typing import Dict, Any, Callable, Coroutine
from app.adapters.database.session import SessionLocal
from app.adapters.database.models import Video, VideoAnalysis, Output, Job
from app.adapters.storage import get_storage_service
from app.services.analysis.parallel_analyzer import run_parallel_analysis
from app.services.tools.pipeline_executor import execute_pipeline
from app.core.config import settings


async def handle_analysis_job(job_id: str, payload: Dict[str, Any], update_progress: Callable[..., Coroutine]):
    """Run parallel video analysis and cache results in DB."""
    return await run_parallel_analysis(job_id, payload, update_progress)


async def handle_preview_job(job_id: str, payload: Dict[str, Any], update_progress: Callable[..., Coroutine]):
    """Render a fast low-resolution (480p, ultrafast) preview."""
    video_id = payload.get("video_id")
    project_id = payload.get("project_id")
    plan = payload.get("plan", [])

    await update_progress(job_id, 15.0, stage="Loading source video for preview", project_id=project_id)

    db = SessionLocal()
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        db.close()
        raise ValueError(f"Video {video_id} not found")

    storage = get_storage_service()
    input_path = storage.get_file_path(video.storage_path)

    # Get transcript if subtitles are in plan
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    transcript = analysis.transcript if analysis else []
    duration = video.duration
    db.close()

    # Helper to check if transcript has valid dialogue entries
    def has_valid_speech(t):
        if not t or not isinstance(t, list):
            return False
        return any(isinstance(x, dict) and bool(x.get("text", "").strip()) and not x.get("error") for x in t)

    # If subtitles requested but valid transcript not yet available, transcribe audio now using Gemini
    if any(step.get("tool") == "add_subtitles" for step in plan) and not has_valid_speech(transcript):
        await update_progress(job_id, 20.0, stage="Transcribing speech for subtitles...", project_id=project_id)
        from app.services.analysis.whisper_service import transcribe_audio
        import asyncio
        transcript = await asyncio.to_thread(transcribe_audio, input_path)
        db_sub = SessionLocal()
        an_sub = db_sub.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not an_sub:
            an_sub = VideoAnalysis(video_id=video_id, transcript=transcript)
            db_sub.add(an_sub)
        else:
            an_sub.transcript = transcript
        db_sub.commit()
        db_sub.close()

    await update_progress(job_id, 35.0, stage="Executing tool pipeline for preview (480p ultrafast)", project_id=project_id)

    out_name = f"preview_{uuid.uuid4().hex[:8]}.mp4"
    previews_dir = os.path.join(settings.STORAGE_DIR, "previews")
    os.makedirs(previews_dir, exist_ok=True)
    local_out_path = os.path.join(previews_dir, out_name)

    execute_pipeline(
        input_path=input_path,
        output_path=local_out_path,
        plan=plan,
        transcript=transcript,
        video_duration=duration,
        is_preview=True
    )

    await update_progress(job_id, 85.0, stage="Saving preview output", project_id=project_id)

    rel_storage_path = f"previews/{out_name}"
    public_url = storage.get_public_url(rel_storage_path)

    # Save Output record
    db = SessionLocal()
    output_record = Output(
        project_id=project_id,
        job_id=job_id,
        output_type="preview",
        filename=out_name,
        storage_path=rel_storage_path,
        url=public_url,
        duration=duration
    )
    db.add(output_record)
    db.commit()
    db.refresh(output_record)
    db.close()

    return {
        "output_id": output_record.id,
        "output_type": "preview",
        "filename": out_name,
        "url": public_url,
    }


async def handle_render_job(job_id: str, payload: Dict[str, Any], update_progress: Callable[..., Coroutine]):
    """Render full-quality final video after user approval."""
    video_id = payload.get("video_id")
    project_id = payload.get("project_id")
    plan = payload.get("plan", [])

    await update_progress(job_id, 10.0, stage="Preparing full-quality render", project_id=project_id)

    db = SessionLocal()
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        db.close()
        raise ValueError(f"Video {video_id} not found")

    storage = get_storage_service()
    input_path = storage.get_file_path(video.storage_path)

    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    transcript = analysis.transcript if analysis else []
    duration = video.duration
    db.close()

    # If subtitles requested but valid transcript not yet available, transcribe audio now
    def has_valid_speech_render(t):
        if not t or not isinstance(t, list):
            return False
        return any(isinstance(x, dict) and bool(x.get("text", "").strip()) and not x.get("error") for x in t)

    if any(step.get("tool") == "add_subtitles" for step in plan) and not has_valid_speech_render(transcript):
        await update_progress(job_id, 20.0, stage="Transcribing speech for subtitles...", project_id=project_id)
        from app.services.analysis.whisper_service import transcribe_audio
        import asyncio
        transcript = await asyncio.to_thread(transcribe_audio, input_path)
        db_sub = SessionLocal()
        an_sub = db_sub.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not an_sub:
            an_sub = VideoAnalysis(video_id=video_id, transcript=transcript)
            db_sub.add(an_sub)
        else:
            an_sub.transcript = transcript
        db_sub.commit()
        db_sub.close()

    await update_progress(job_id, 30.0, stage="Encoding full-quality output with FFmpeg", project_id=project_id)

    out_name = f"render_{uuid.uuid4().hex[:8]}.mp4"
    outputs_dir = os.path.join(settings.STORAGE_DIR, "outputs")
    os.makedirs(outputs_dir, exist_ok=True)
    local_out_path = os.path.join(outputs_dir, out_name)

    execute_pipeline(
        input_path=input_path,
        output_path=local_out_path,
        plan=plan,
        transcript=transcript,
        video_duration=duration,
        is_preview=False
    )

    await update_progress(job_id, 90.0, stage="Finalizing export", project_id=project_id)

    rel_storage_path = f"outputs/{out_name}"
    public_url = storage.get_public_url(rel_storage_path)

    db = SessionLocal()
    output_record = Output(
        project_id=project_id,
        job_id=job_id,
        output_type="final",
        filename=out_name,
        storage_path=rel_storage_path,
        url=public_url,
        duration=duration
    )
    db.add(output_record)
    db.commit()
    db.refresh(output_record)
    db.close()

    return {
        "output_id": output_record.id,
        "output_type": "final",
        "filename": out_name,
        "url": public_url,
    }


import asyncio
from typing import Dict, Any, Callable, Coroutine
from .ffprobe_service import extract_metadata
from .scenedetect_service import detect_scenes
from .whisper_service import transcribe_audio
from .vision_service import analyze_visuals
from app.adapters.database.session import SessionLocal
from app.adapters.database.models import Video, VideoAnalysis, Job


async def run_parallel_analysis(
    job_id: str,
    payload: Dict[str, Any],
    update_progress: Callable[..., Coroutine]
) -> Dict[str, Any]:
    """Execute FFprobe, PySceneDetect, Whisper, and Gemini Vision concurrently."""
    video_id = payload.get("video_id")
    file_path = payload.get("file_path")
    project_id = payload.get("project_id")

    await update_progress(job_id, 10.0, stage="Starting parallel analysis", project_id=project_id)

    # 1. FFprobe metadata first (fastest, needed by others)
    meta = await asyncio.to_thread(extract_metadata, file_path)
    duration = meta.get("duration", 0.0)
    
    # Update video record in DB with duration, width, height, fps
    db = SessionLocal()
    vid = db.query(Video).filter(Video.id == video_id).first()
    if vid:
        vid.duration = duration
        vid.width = meta.get("width", 0)
        vid.height = meta.get("height", 0)
        vid.fps = meta.get("fps", 0.0)
        db.commit()
    db.close()

    await update_progress(job_id, 25.0, stage="Metadata extracted; running transcription, scene detection & vision concurrently", project_id=project_id)

    # 2. Concurrently run PySceneDetect, Whisper, and initial Vision sampling
    async def task_scenes():
        return await asyncio.to_thread(detect_scenes, file_path)

    async def task_whisper():
        return await asyncio.to_thread(transcribe_audio, file_path)

    scenes, transcript = await asyncio.gather(task_scenes(), task_whisper())

    await update_progress(job_id, 70.0, stage="Transcription & scenes analyzed; tagging visual frames", project_id=project_id)

    # 3. Vision analysis on sampled scene midpoints
    visual_tags = await asyncio.to_thread(analyze_visuals, file_path, duration, scenes)

    await update_progress(job_id, 90.0, stage="Combining and caching analysis records", project_id=project_id)

    # 4. Save combined record into VideoAnalysis table
    db = SessionLocal()
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    if not analysis:
        analysis = VideoAnalysis(video_id=video_id)
        db.add(analysis)

    analysis.metadata_json = meta
    analysis.scenes = scenes
    analysis.transcript = transcript
    analysis.visual_tags = visual_tags
    analysis.status = "completed"
    db.commit()
    db.refresh(analysis)

    combined_result = {
        "video_id": video_id,
        "metadata": meta,
        "scenes": scenes,
        "transcript": transcript,
        "visual_tags": visual_tags,
    }
    db.close()

    return combined_result


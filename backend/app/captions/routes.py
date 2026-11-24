import asyncio
import subprocess
import mimetypes
import uuid
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, UploadFile, File, Request, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse

from app.captions.settings import caption_settings
from app.captions.storage import (
    validate_video_id,
    get_video_dir,
    ensure_video_dir,
    find_original_file,
    read_status,
    write_status,
    read_meta,
    read_json_file,
    write_json_file
)
from app.captions.captions import (
    validate_captions_input,
    generate_srt,
    generate_vtt
)
from app.captions.pipeline import enqueue_video

logger = logging.getLogger("captions.routes")
router = APIRouter(tags=["captions"])


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_video(file: UploadFile = File(...)) -> Dict[str, str]:
    """Upload a new video file, validate its extension and size, and start the processing pipeline."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload"
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in caption_settings.ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(caption_settings.ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed extensions are: {allowed}"
        )

    # Generate 32-character hex video_id
    video_id = uuid.uuid4().hex
    video_dir = ensure_video_dir(video_id)
    dest_path = video_dir / f"original{ext}"

    max_bytes = caption_settings.MAX_UPLOAD_MB * 1024 * 1024
    total_bytes = 0

    try:
        # Stream file to disk in 1MB chunks while checking max size
        with open(dest_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    out_file.close()
                    if dest_path.exists():
                        dest_path.unlink()
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {caption_settings.MAX_UPLOAD_MB}MB"
                    )
                out_file.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to write uploaded file: %s", e)
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {e}"
        )

    # Initialize status as uploaded
    write_status(
        video_id=video_id,
        state="uploaded",
        progress=0.0,
        message="Video uploaded successfully"
    )

    # Enqueue pipeline in background
    await enqueue_video(video_id)

    return {"video_id": video_id}


@router.get("/{video_id}/status")
async def get_video_status(video_id: str) -> Dict[str, Any]:
    """Retrieve the current processing status of a video."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    status_data = read_status(video_id)
    if not status_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video '{video_id}' not found"
        )
    return status_data


@router.get("/{video_id}")
async def get_video_details(video_id: str) -> Dict[str, Any]:
    """Retrieve metadata and status for a video."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    if not video_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video '{video_id}' not found"
        )

    meta = read_meta(video_id)
    status_data = read_status(video_id)

    return {
        "video_id": video_id,
        "meta": meta,
        "status": status_data
    }


def _parse_range_header(range_header: str, file_size: int):
    """Parse HTTP Range header bytes=start-end."""
    try:
        units, range_str = range_header.split("=")
        if units.strip() != "bytes":
            return None
        parts = range_str.split("-")
        start_str = parts[0].strip()
        end_str = parts[1].strip() if len(parts) > 1 else ""

        if start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        elif start_str:
            start = int(start_str)
            end = file_size - 1
        elif end_str:
            start = file_size - int(end_str)
            end = file_size - 1
        else:
            return None

        if start > end or start < 0 or end >= file_size:
            return None
        return start, end
    except Exception:
        return None


def _file_chunk_generator(file_path: Path, start: int, length: int, chunk_size: int = 256 * 1024):
    """Yield file byte chunks within a given range."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = length
        while remaining > 0:
            read_bytes = min(remaining, chunk_size)
            chunk = f.read(read_bytes)
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/{video_id}/file")
async def stream_video_file(video_id: str, request: Request):
    """Stream the original video with HTTP Range support for seamless preview player playback."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_file = find_original_file(video_id)
    if not video_file or not video_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Original video file for '{video_id}' not found"
        )

    file_size = video_file.stat().st_size
    content_type, _ = mimetypes.guess_type(str(video_file))
    content_type = content_type or "video/mp4"

    range_header = request.headers.get("range")
    if range_header:
        parsed_range = _parse_range_header(range_header, file_size)
        if parsed_range is None:
            return JSONResponse(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                content={"detail": "Requested Range Not Satisfiable"},
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        start, end = parsed_range
        content_length = (end - start) + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }
        return StreamingResponse(
            _file_chunk_generator(video_file, start, content_length),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            headers=headers
        )

    # Full file response if no Range header provided
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": content_type,
    }
    return StreamingResponse(
        _file_chunk_generator(video_file, 0, file_size),
        status_code=status.HTTP_200_OK,
        headers=headers
    )


@router.get("/{video_id}/captions")
async def get_video_captions(video_id: str) -> Dict[str, Any]:
    """Retrieve the generated captions.json for a video.

    Returns HTTP 409 Conflict if processing is not yet complete.
    """
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    if not video_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video '{video_id}' not found"
        )

    status_data = read_status(video_id)
    if not status_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Status record for '{video_id}' not found"
        )

    state = status_data.get("state")
    if state == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Processing failed: {status_data.get('error', 'Unknown error')}"
        )

    if state != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Captions not ready yet. Current status: '{state}' ({status_data.get('progress', 0)}%)"
        )

    captions_file = video_dir / "captions.json"
    data = read_json_file(captions_file)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Captions file not found"
        )

    return data


@router.put("/{video_id}/captions")
async def update_video_captions(video_id: str, request: Request) -> Dict[str, Any]:
    """Replace and update caption timings and text for a video.

    Validates that captions are ordered, non-overlapping, and within video duration.
    Regenerates captions.json, captions.srt, and captions.vtt atomically.
    """
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    if not video_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video '{video_id}' not found"
        )

    body = await request.json()
    raw_captions = body.get("captions") if isinstance(body, dict) and "captions" in body else body

    meta = read_meta(video_id)
    duration = meta.get("duration") if meta else None

    try:
        validate_captions_input(raw_captions, video_duration=duration)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid caption data: {e}"
        )

    # Re-index caption IDs sequentially
    sanitized_captions = []
    for i, c in enumerate(raw_captions, 1):
        sanitized_captions.append({
            "id": i,
            "start": round(float(c["start"]), 2),
            "end": round(float(c["end"]), 2),
            "text": str(c.get("text", "")).strip()
        })

    existing_captions = read_json_file(video_dir / "captions.json") or {}
    updated_payload = {
        "video_id": video_id,
        "language": existing_captions.get("language") or "en",
        "duration": duration or existing_captions.get("duration", 0.0),
        "captions": sanitized_captions
    }

    # Save captions.json, captions.srt, and captions.vtt
    write_json_file(video_dir / "captions.json", updated_payload)
    (video_dir / "captions.srt").write_bytes(generate_srt(sanitized_captions).encode("utf-8"))
    (video_dir / "captions.vtt").write_bytes(generate_vtt(sanitized_captions).encode("utf-8"))

    logger.info("Updated %d captions for video %s", len(sanitized_captions), video_id)
    return updated_payload


@router.get("/{video_id}/captions.srt")
async def download_captions_srt(video_id: str):
    """Download generated captions as an .srt subtitle file."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    srt_path = video_dir / "captions.srt"

    if not srt_path.is_file():
        status_data = read_status(video_id)
        if status_data and status_data.get("state") != "done":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Captions not ready yet. Status: {status_data.get('state')}"
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SRT captions file not found"
        )

    return FileResponse(
        srt_path,
        media_type="text/plain; charset=utf-8",
        filename=f"captions_{video_id[:8]}.srt"
    )


@router.get("/{video_id}/captions.vtt")
async def download_captions_vtt(video_id: str):
    """Download generated captions as a .vtt WebVTT subtitle file."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    vtt_path = video_dir / "captions.vtt"

    if not vtt_path.is_file():
        status_data = read_status(video_id)
        if status_data and status_data.get("state") != "done":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Captions not ready yet. Status: {status_data.get('state')}"
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VTT captions file not found"
        )

    return FileResponse(
        vtt_path,
        media_type="text/vtt; charset=utf-8",
        filename=f"captions_{video_id[:8]}.vtt"
    )


@router.post("/{video_id}/retry")
async def retry_caption_job(video_id: str):
    """Re-enqueue a failed or interrupted caption pipeline job."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    original_file = find_original_file(video_id)
    if not original_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source video file for '{video_id}' not found on server"
        )

    write_status(
        video_id=video_id,
        state="uploaded",
        progress=0.0,
        message="Job queued for retry"
    )
    await enqueue_video(video_id)
    return {"video_id": video_id, "message": "Caption pipeline re-enqueued"}


@router.get("/{video_id}/export-burned")
async def export_burned_captions_video(video_id: str):
    """Render and download the MP4 video with captions permanently burned in."""
    try:
        validate_video_id(video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    video_dir = get_video_dir(video_id)
    original_file = find_original_file(video_id)
    srt_file = video_dir / "captions.srt"

    if not original_file or not srt_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original video or captions.srt not found. Please generate captions first."
        )

    output_path = video_dir / "burned_captions.mp4"

    # Only re-render if output does not exist or captions.srt is newer
    if not output_path.is_file() or output_path.stat().st_mtime < srt_file.stat().st_mtime:
        cmd = [
            "ffmpeg", "-y",
            "-i", original_file.name,
            "-vf", "subtitles=captions.srt:force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3'",
            "-c:a", "copy",
            "burned_captions.mp4"
        ]
        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            cwd=str(video_dir),
            capture_output=True,
            text=True,
            timeout=300
        )
        if proc.returncode != 0:
            logger.error("Burned captions rendering failed: %s", proc.stderr)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to burn captions into video"
            )

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"video_with_captions_{video_id[:8]}.mp4"
    )




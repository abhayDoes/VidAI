from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional
import shutil
import os
import uuid
from services import ffmeg_service

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join("uploads", "videos")
OUTPUT_DIR = os.path.join("uploads", "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount uploads so frontend can view/stream source and processed videos
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
async def root():
    return {"message": "Hello this is AI video editing tool"}


@app.post("/videos_upload")
async def upload_video(video: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, video.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
    return {
        "filename": video.filename,
        "type of file": video.content_type,
        "saved_path": file_path,
        "url": f"/uploads/videos/{video.filename}"
    }


class TrimRequest(BaseModel):
    filename: str
    start: float
    duration: float


@app.post("/edit/trim")
async def trim_endpoint(req: TrimRequest):
    input_path = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(input_path):
        input_path = os.path.join(OUTPUT_DIR, req.filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Input file not found")

    out_name = f"trimmed_{uuid.uuid4().hex[:6]}_{req.filename}"
    output_path = os.path.join(OUTPUT_DIR, out_name)

    try:
        ffmeg_service.trim_video(input_path, output_path, req.start, req.duration)
        return {
            "status": "success",
            "filename": out_name,
            "url": f"/uploads/outputs/{out_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RotateRequest(BaseModel):
    filename: str
    angle: Optional[int] = 90


@app.post("/edit/rotate")
async def rotate_endpoint(req: RotateRequest):
    input_path = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(input_path):
        input_path = os.path.join(OUTPUT_DIR, req.filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Input file not found")

    out_name = f"rotated_{uuid.uuid4().hex[:6]}_{req.filename}"
    output_path = os.path.join(OUTPUT_DIR, out_name)

    try:
        ffmeg_service.rotate_video(input_path, output_path, req.angle)
        return {
            "status": "success",
            "filename": out_name,
            "url": f"/uploads/outputs/{out_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ResizeRequest(BaseModel):
    filename: str
    width: int
    height: int


@app.post("/edit/resize")
async def resize_endpoint(req: ResizeRequest):
    input_path = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(input_path):
        input_path = os.path.join(OUTPUT_DIR, req.filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Input file not found")

    out_name = f"resized_{req.width}x{req.height}_{uuid.uuid4().hex[:6]}_{req.filename}"
    output_path = os.path.join(OUTPUT_DIR, out_name)

    try:
        ffmeg_service.resize_video(input_path, output_path, req.width, req.height)
        return {
            "status": "success",
            "filename": out_name,
            "url": f"/uploads/outputs/{out_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MergeSegment(BaseModel):
    filename: str
    start: float = Field(default=0, ge=0)
    duration: float = Field(gt=0)


class MergeRequest(BaseModel):
    filenames: List[str] = Field(default_factory=list)
    segments: List[MergeSegment] = Field(default_factory=list)


@app.post("/edit/merge")
async def merge_endpoint(req: MergeRequest):
    if not req.segments and len(req.filenames) < 2:
        raise HTTPException(
            status_code=400,
            detail="Provide kept video segments or at least 2 filenames to merge",
        )

    out_name = f"merged_{uuid.uuid4().hex[:6]}.mp4"
    output_path = os.path.join(OUTPUT_DIR, out_name)

    try:
        if req.segments:
            segments = []
            for segment in req.segments:
                input_path = os.path.join(UPLOAD_DIR, segment.filename)
                if not os.path.exists(input_path):
                    input_path = os.path.join(OUTPUT_DIR, segment.filename)
                if not os.path.exists(input_path):
                    raise HTTPException(
                        status_code=404,
                        detail=f"File not found: {segment.filename}",
                    )
                segments.append(
                    {
                        "path": input_path,
                        "start": segment.start,
                        "duration": segment.duration,
                    }
                )
            ffmeg_service.merge_video_segments(segments, output_path)
        else:
            input_paths = []
            for filename in req.filenames:
                input_path = os.path.join(UPLOAD_DIR, filename)
                if not os.path.exists(input_path):
                    input_path = os.path.join(OUTPUT_DIR, filename)
                if not os.path.exists(input_path):
                    raise HTTPException(
                        status_code=404,
                        detail=f"File not found: {filename}",
                    )
                input_paths.append(input_path)
            ffmeg_service.merge_videos(input_paths, output_path)
        return {
            "status": "success",
            "filename": out_name,
            "url": f"/uploads/outputs/{out_name}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import os
from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.adapters.database.session import engine, Base
from app.adapters.queue import get_task_queue
from app.api.routes import router as api_router
from app.api.websockets import ws_manager
from app.services.handlers import (
    handle_analysis_job,
    handle_preview_job,
    handle_render_job
)
from app.captions.routes import router as captions_router
from app.captions.storage import recover_interrupted_jobs
from app.captions.pipeline import start_pipeline_worker

try:
    from backend.routers.editor import router as editor_router
except ImportError:
    from routers.editor import router as editor_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Create DB tables
    Base.metadata.create_all(bind=engine)

    # 2. Register background task handlers
    queue = get_task_queue()
    queue.register_handler("analysis", handle_analysis_job)
    queue.register_handler("preview", handle_preview_job)
    queue.register_handler("render", handle_render_job)

    # 3. Ensure storage directories exist
    os.makedirs(os.path.join(settings.STORAGE_DIR, "videos"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "previews"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "outputs"), exist_ok=True)

    # 4. Captions pipeline startup: recover interrupted jobs and start worker
    recovered = recover_interrupted_jobs()
    if recovered:
        print(f"[Captions] Recovered {recovered} interrupted job(s) from previous run.")
    start_pipeline_worker()

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure storage directory exists before mounting static files
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "videos"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "previews"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "outputs"), exist_ok=True)

# Mount local storage folder for video & preview streaming
app.mount("/storage", StaticFiles(directory=settings.STORAGE_DIR), name="storage")

# Include API routes
app.include_router(api_router, prefix="/api")

# Include Captions Pipeline routes (at /videos and /api/videos)
app.include_router(captions_router, prefix="/videos")
app.include_router(captions_router, prefix="/api/videos")

# Include AI Editor Prompt & Render routes (at /videos and /api/videos)
app.include_router(editor_router, prefix="/videos")
app.include_router(editor_router, prefix="/api/videos")


# WebSockets endpoint for live progress streaming
@app.websocket("/ws")
@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str = None):
    await ws_manager.connect(websocket, project_id=project_id)
    try:
        while True:
            # Keep connection open; receive client pings/messages if any
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, project_id=project_id)


@app.get("/")
@app.get("/health")
@app.get("/api/health")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "status": "online",
        "storage": settings.STORAGE_BACKEND,
        "queue": settings.QUEUE_BACKEND,
    }


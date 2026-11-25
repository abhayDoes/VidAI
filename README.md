# VidAI Studio - AI Video Editor & Offline Caption Generator

VidAI Studio is an in-browser video editor with an offline, privacy-first AI caption pipeline. Speech recognition and subtitle generation run **100% locally on your CPU** without any external cloud API calls, Docker containers, or external database services.

---

## Architecture Overview (Phase 1: Video Analysis & Captions)

```
[User Browser / VidAI Studio]
    │
    │  1. Multipart Upload (with upload progress bar)
    ▼
[FastAPI Backend - POST /videos]
    │  Generates 32-char hex video_id
    │  Streams video to data/videos/<video_id>/original.<ext>
    │  Enqueues job to single-worker FIFO queue (CPU-safe)
    ▼
[Background Pipeline Worker]
    ├── 1. ffprobe: Validates format & writes meta.json (duration, resolution, fps, audio presence)
    │      (If video has no audio track: gracefully finishes with empty captions and message)
    ├── 2. ffmpeg: Extracts 16 kHz mono WAV (audio.wav)
    ├── 3. faster-whisper (CTranslate2 on CPU, int8): Speech-to-text with word-level timestamps & VAD filter
    ├── 4. Pure Word Grouper: Generates caption lines (≤ 42 chars/line, ≤ 2 lines, 0.7s–5.0s, no overlaps)
    └── 5. Outputs: captions.json, captions.srt, captions.vtt
    ▼
[Interactive Studio Frontend]
    ├── Live status polling (~1.5s interval with friendly stage labels)
    ├── Real-time Caption Overlay synchronized with player playhead
    ├── Interactive Captions List (click any caption to seek playback)
    ├── Inline Caption Editing (PUT /videos/{id}/captions with automatic SRT/VTT regeneration)
    └── Download buttons for SRT & VTT formats
```

---

## Directory & Storage Layout

All video artifacts are stored in isolated per-video directories under `UPLOAD_DIR` (default `./data/videos/`):

```
data/videos/<video_id>/
├── original.<ext>    # Original uploaded video (never modified or overwritten)
├── audio.wav         # 16 kHz mono WAV extracted for transcription
├── meta.json         # Probe metadata (duration, width, height, fps, has_audio, size_bytes)
├── status.json       # Pipeline state (uploaded, probing, extracting_audio, transcribing, building_captions, done, failed)
├── captions.json     # Standardized JSON captions with start, end, and text
├── captions.srt      # SubRip Subtitle file (00:00:01,500)
└── captions.vtt      # WebVTT subtitle file (00:00:01.500)
```

---

## System Requirements

- **Operating System**: Windows 11 / 10, macOS, or Linux
- **Python**: Python 3.10+ (tested on Python 3.13.7)
- **Node.js**: Node.js 18+ and npm
- **FFmpeg & FFprobe**: Installed and available in your system `PATH`
  - To verify on Windows: `ffmpeg -version` and `ffprobe -version`

---

## Environment Variables (`.env`)

Create a `.env` file in `backend/.env` (or copy from `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_DIR` | `./data/videos` | Local directory for storing per-video folders and artifacts |
| `MAX_UPLOAD_MB` | `500` | Maximum video upload size in megabytes |
| `WHISPER_MODEL` | `base` | Faster-Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `WHISPER_LANGUAGE` | *(empty)* | Optional ISO language code (e.g., `en`, `es`, `fr`). Leave blank for auto-detection. |
| `HOST` | `0.0.0.0` | Backend bind host |
| `PORT` | `8000` | Backend bind port |

---

## How to Run on Windows

### 1. Backend Setup & Startup

Open PowerShell:

```powershell
# Navigate to the backend directory
cd c:\Users\Admin\Documents\VidAI\backend

# (Optional) Activate your virtual environment if using one:
# .\venv\Scripts\Activate.ps1

# Set python path and start the FastAPI server with reload
$env:PYTHONPATH = "."
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend server will start at `http://127.0.0.1:8000`. On startup, it automatically checks for and recovers any interrupted jobs from previous server restarts.

### 2. Frontend Setup & Startup

Open a second PowerShell window:

```powershell
# Navigate to the frontend directory
cd c:\Users\Admin\Documents\VidAI\frontend

# Ensure Node is in PATH (if installed in custom location)
$env:PATH = "C:\Users\Admin\.nodejs;" + $env:PATH

# Install dependencies (if not already installed)
npm install

# Start Vite dev server
npm run dev
```

The frontend will run at `http://localhost:5173`. Open this URL in Chrome, Edge, or Firefox.

---

## How to Run Tests

### Automated Backend Test Suite

Run all unit tests, pipeline tests, and hardening tests:

```powershell
cd c:\Users\Admin\Documents\VidAI
$env:PYTHONPATH = "backend"
python -m unittest discover backend/tests -v
```

This tests:
- `test_step2.py`: Video ID validation, path traversal defense, file streaming range requests, storage read/write, probe parsing.
- `test_step3.py`: Caption building algorithms (word boundaries, character & line limits, punctuation break rules), SRT/VTT formatting, pipeline mock run, GET/PUT endpoints.
- `test_step5.py`: Hardening edge cases (videos with no audio, files exceeding MAX_UPLOAD_MB, unsupported formats, corrupt video streams, server restart recovery).

### Frontend Build Verification

```powershell
cd c:\Users\Admin\Documents\VidAI\frontend
$env:PATH = "C:\Users\Admin\.nodejs;" + $env:PATH
npm run build
```

---

## Manual Test Checklist (30–60s Video)

Use any 30–60 second video containing speech to verify end-to-end functionality:

1. **Upload & Status Progression**:
   - Open [http://localhost:5173](http://localhost:5173).
   - In the left sidebar, click the **💬 Captions** tab.
   - Click **📁 Upload Video for Captions** and select your video file.
   - Watch the live upload progress bar (0% → 100%).
   - Watch the status stage updates (*probing* → *extracting_audio* → *transcribing %* → *building_captions* → *done*).

2. **Playback & Caption Overlay**:
   - When finished, the video loads and captions appear in the left panel.
   - Press **Play** or scrub the timeline playhead.
   - Verify that the caption overlay renders smoothly at the bottom of the video player without delay or flickering.

3. **Click-to-Seek**:
   - Click any caption card in the panel.
   - Verify the video player playhead immediately seeks to the start time of that spoken sentence.

4. **Inline Caption Editing**:
   - Click the ✏️ edit icon next to any caption in the list.
   - Change a word and click **Save**.
   - Verify the caption updates in the list and immediately in the preview overlay.

5. **Subtitle Downloads**:
   - Click **Download SRT** and **Download VTT**.
   - Verify that `.srt` and `.vtt` files download with correct timestamps matching the edited captions.

6. **Edge Case Verification**:
   - Upload a silent video (or video with audio stripped): confirm it finishes with status `done`, message `"No audio track found"`, and empty captions list.
   - Attempt to upload an invalid format (e.g. `.txt`): confirm it shows a 400 rejection error without crashing.


---

## Phase 1: Natural Language Prompt Editing Layer

VidAI Studio features an AI prompt layer allowing users to edit videos with conversational natural language in English, Hindi, or Hinglish (e.g. *"pehle 10 second hata do"*, *"keep only 0:10 to 0:45"*).

### Key Architectural Safeguards:
1. **Never Overwrites Original**: Edits live in a versioned `timeline.json` (`Segment { id, src_start, src_end }`).
2. **LLM Never Writes Commands**: The LLM only picks operations from a fixed registry and supplies JSON parameters.
3. **Strict Validation**: Every candidate plan is checked by a Pydantic validator for bounds, sequential duration validity, and non-empty output before preview.
4. **Uncommitted Preview**: Proposed edits can be previewed seamlessly in the timeline player before applying.

---

### How to Run

1. **Set Up Environment Variables**:
   Copy the example file:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Add your Google Gemini API key or configure Ollama:
   ```env
   # In backend/.env:
   GEMINI_API_KEY=your_gemini_api_key_here
   # Or for local zero-API offline mode:
   # LLM_PROVIDER=ollama
   # OLLAMA_HOST=http://localhost:11434
   # OLLAMA_MODEL=qwen2.5:7b
   ```

2. **Start the FastAPI Backend**:
   ```powershell
   cd backend
   $env:PYTHONPATH = ".;.."
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

3. **Start the Frontend Dev Server**:
   ```powershell
   cd frontend
   npm run dev
   ```
   Open your browser to [http://localhost:5173](http://localhost:5173).

---

### How to Add a New Operation (Plugin Architecture)

To add any new editing operation (e.g. `speed_adjust`, `silence_remove`, `zoom_in`), create a single file under `backend/editor/ops/`. You only need to touch **3 things**:

```python
# backend/editor/ops/my_operation.py
from pydantic import BaseModel, Field
from backend.editor.timeline import Timeline, Segment
from backend.editor.ops.registry import register_operation, format_timestamp

# 1. PARAMS MODEL: Define input schema and validation
class MyOpParams(BaseModel):
    speed: float = Field(gt=0.0, le=4.0, description="Playback speed multiplier")

# 2. APPLY FUNCTION: Pure function that returns a NEW Timeline
def apply_my_op(timeline: Timeline, params: MyOpParams) -> Timeline:
    # Manipulate segments mathematically without touching the source video
    return Timeline(
        video_id=timeline.video_id,
        source_duration=timeline.source_duration,
        segments=timeline.segments,
        version=timeline.version + 1,
    )

# 3. REGISTRATION: Register with description and human-readable UI summary
@register_operation(
    name="set_speed",
    description="Adjust playback speed multiplier (between 0.1x and 4.0x).",
    params_model=MyOpParams,
    describe=lambda p: f"Set speed to {p.speed}x",
)
def registered_my_op(timeline: Timeline, params: MyOpParams) -> Timeline:
    return apply_my_op(timeline, params)
```
Once registered, the LLM prompt generator, JSON schema validator, API endpoints, and UI will automatically support the new operation without rewriting any core logic!

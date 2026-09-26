from fastapi import FastAPI,UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os

app = FastAPI() 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
async def root():
    return {"message": "Hello this is AI video editing tool"}


UPLOAD_DIR = "uploads/videos"
os.makedirs(UPLOAD_DIR, exist_ok=True)



@app.post("/videos_upload")
async def upload_video(video: UploadFile = File(...)):
   
    file_path = os.path.join(UPLOAD_DIR, video.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
    return {
        "filename": video.filename,
        "type of file" : video.content_type,
        "saved_path": file_path
    }


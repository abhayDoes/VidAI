from fastapi import FastAPI,UploadFile, File




app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello this is AI video editing tool"}


@app.post("/videos_upload")
async def upload_video(video:UploadFile = File(...)):
     fileType= video.content_type
     return {"filename": video.filename,
              "type of file": fileType}


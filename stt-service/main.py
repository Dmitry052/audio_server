import os
import uuid
import asyncio
from fastapi import FastAPI, UploadFile, File
import shutil
from whisper_service import transcribe

app = FastAPI()

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    path = f"/tmp/{uuid.uuid4()}{ext}"

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, transcribe, path)
    finally:
        os.remove(path)

    return result

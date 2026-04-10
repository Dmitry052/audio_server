import asyncio
import os
import shutil
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile

from whisper_service import transcribe

app = FastAPI()


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    path = f"/tmp/{uuid.uuid4()}{ext}"

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, transcribe, path)
        return result
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    finally:
        if os.path.exists(path):
            os.remove(path)

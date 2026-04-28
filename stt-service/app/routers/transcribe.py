import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.services.whisper import TranscribeResult, WhisperService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["transcribe"])


def _get_whisper(request: Request) -> WhisperService:
    return request.app.state.whisper


@router.post("/transcribe", response_model=TranscribeResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    service: WhisperService = Depends(_get_whisper),
) -> TranscribeResult:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)

    try:
        with os.fdopen(fd, "wb") as f:
            shutil.copyfileobj(file.file, f)

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, service.transcribe, tmp_path)
    except HTTPException:
        raise
    except Exception as error:
        logger.error("Transcription failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error)) from error
    finally:
        Path(tmp_path).unlink(missing_ok=True)

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.config import get_settings
from app.services.whisper import WhisperService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    service = WhisperService(settings)
    service.load()
    app.state.whisper = service
    logger.info("Whisper service ready")
    yield
    logger.info("Shutting down")

import logging

from fastapi import FastAPI

from app.lifespan import lifespan
from app.routers.health import router as health_router
from app.routers.transcribe import router as transcribe_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="STT Service", lifespan=lifespan)
app.include_router(health_router)
app.include_router(transcribe_router)

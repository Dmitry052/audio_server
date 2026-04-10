import os
from typing import Optional

from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
PRIMARY_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
PRIMARY_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
FALLBACK_DEVICE = os.getenv("WHISPER_FALLBACK_DEVICE", "cpu")
FALLBACK_COMPUTE_TYPE = os.getenv("WHISPER_FALLBACK_COMPUTE_TYPE", "int8")

model: Optional[WhisperModel] = None
model_device: Optional[str] = None
model_compute_type: Optional[str] = None


def load_model(device: str, compute_type: str) -> WhisperModel:
    print(
        f"🎛️ Loading faster-whisper model='{MODEL_SIZE}' device='{device}' compute_type='{compute_type}'",
    )
    return WhisperModel(MODEL_SIZE, device=device, compute_type=compute_type)


def set_model(next_model: WhisperModel, device: str, compute_type: str) -> WhisperModel:
    global model, model_device, model_compute_type

    model = next_model
    model_device = device
    model_compute_type = compute_type
    return model


def is_cuda_runtime_error(error: RuntimeError) -> bool:
    message = str(error).lower()

    return any(
        token in message
        for token in (
            "libcublas",
            "cublas",
            "cudnn",
            "cuda",
            "cannot be loaded",
        )
    )


def get_model() -> WhisperModel:
    if model is not None:
        return model

    try:
        return set_model(
            load_model(PRIMARY_DEVICE, PRIMARY_COMPUTE_TYPE),
            PRIMARY_DEVICE,
            PRIMARY_COMPUTE_TYPE,
        )
    except Exception as error:
        print(
            "⚠️ Failed to initialize primary whisper backend; falling back to CPU:",
            error,
        )
        return set_model(
            load_model(FALLBACK_DEVICE, FALLBACK_COMPUTE_TYPE),
            FALLBACK_DEVICE,
            FALLBACK_COMPUTE_TYPE,
        )


def transcribe(audio_path: str):
    active_model = get_model()

    try:
        segments, info = active_model.transcribe(audio_path)
    except RuntimeError as error:
        if model_device != PRIMARY_DEVICE or not is_cuda_runtime_error(error):
            raise

        print(
            "⚠️ CUDA runtime is unavailable during transcription; retrying on CPU:",
            error,
        )
        active_model = set_model(
            load_model(FALLBACK_DEVICE, FALLBACK_COMPUTE_TYPE),
            FALLBACK_DEVICE,
            FALLBACK_COMPUTE_TYPE,
        )
        segments, info = active_model.transcribe(audio_path)

    text = " ".join(seg.text.strip() for seg in segments).strip()

    return {
        "language": info.language,
        "text": text,
        "device": model_device,
        "compute_type": model_compute_type,
    }

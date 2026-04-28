import logging
from dataclasses import dataclass, field
from typing import TypedDict

from faster_whisper import WhisperModel

from app.config import Settings

logger = logging.getLogger(__name__)


class TranscribeResult(TypedDict):
    language: str
    text: str
    device: str
    compute_type: str


@dataclass
class WhisperService:
    settings: Settings
    _model: WhisperModel | None = field(default=None, init=False, repr=False)
    _device: str | None = field(default=None, init=False, repr=False)
    _compute_type: str | None = field(default=None, init=False, repr=False)

    def load(self) -> None:
        try:
            self._init_model(
                self.settings.whisper_device,
                self.settings.whisper_compute_type,
            )
        except Exception as error:
            logger.warning(
                "Failed to initialize primary whisper backend; falling back to CPU: %s",
                error,
            )
            self._init_model(
                self.settings.whisper_fallback_device,
                self.settings.whisper_fallback_compute_type,
            )

    def transcribe(self, audio_path: str) -> TranscribeResult:
        assert self._model is not None, "Model not loaded; call load() first"

        try:
            segments, info = self._run_transcribe(audio_path)
        except RuntimeError as error:
            if self._device != self.settings.whisper_device or not _is_cuda_error(error):
                raise
            logger.warning(
                "CUDA runtime unavailable during transcription; retrying on CPU: %s",
                error,
            )
            self._init_model(
                self.settings.whisper_fallback_device,
                self.settings.whisper_fallback_compute_type,
            )
            segments, info = self._run_transcribe(audio_path)

        text = " ".join(seg.text.strip() for seg in segments).strip()
        return TranscribeResult(
            language=info.language,
            text=text,
            device=self._device,  # type: ignore[typeddict-item]
            compute_type=self._compute_type,  # type: ignore[typeddict-item]
        )

    def _init_model(self, device: str, compute_type: str) -> None:
        logger.info(
            "Loading faster-whisper model='%s' device='%s' compute_type='%s'",
            self.settings.whisper_model,
            device,
            compute_type,
        )
        self._model = WhisperModel(
            self.settings.whisper_model,
            device=device,
            compute_type=compute_type,
        )
        self._device = device
        self._compute_type = compute_type

    def _run_transcribe(self, audio_path: str):
        return self._model.transcribe(  # type: ignore[union-attr]
            audio_path,
            beam_size=5,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            temperature=0.0,
        )


def _is_cuda_error(error: RuntimeError) -> bool:
    message = str(error).lower()
    return any(
        token in message
        for token in ("libcublas", "cublas", "cudnn", "cuda", "cannot be loaded")
    )

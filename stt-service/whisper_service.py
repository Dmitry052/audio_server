from faster_whisper import WhisperModel

model = WhisperModel("small", device="cuda", compute_type="float16")

def transcribe(audio_path: str):
    segments, info = model.transcribe(audio_path)

    text = " ".join([seg.text for seg in segments])

    return {
        "language": info.language,
        "text": text
    }
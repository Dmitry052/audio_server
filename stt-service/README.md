# STT Service

## Setup

```bash
bash setup.sh
source whisper-env/bin/activate
```

Dependencies (`requirements.txt`):
- `faster-whisper` — Whisper inference
- `fastapi` — HTTP framework
- `uvicorn[standard]` — ASGI server
- `python-multipart` — file upload support
- `pydantic-settings` — config from environment variables

## Install CUDA / cuBLAS (`libcublas.so.12`)

These commands are for `Ubuntu 22.04 x86_64`. If you use another distro, keep the checks below the same but swap the NVIDIA repo URL for your OS.

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update

# Full CUDA toolkit
sudo apt-get install -y cuda-toolkit

# If you only need cuBLAS runtime, this is the narrower option
sudo apt-get install -y libcublas-12-8 libcublas-dev-12-8
```

## Check GPU / CUDA / cuBLAS

```bash
# GPU is visible to the driver
nvidia-smi

# cuBLAS library can be found by the dynamic linker
ldconfig -p | grep libcublas.so.12

# Search the filesystem if ldconfig shows nothing
find /usr -name 'libcublas.so*' 2>/dev/null
find /usr/local -name 'libcublas.so*' 2>/dev/null

# Try loading the exact runtime from Python
python3 -c "import ctypes; ctypes.CDLL('libcublas.so.12'); print('libcublas.so.12: OK')"
```

## If `libcublas.so.12` is installed but not found

```bash
export LD_LIBRARY_PATH=/usr/local/lib/ollama/cuda_v12:$LD_LIBRARY_PATH
python3 -c 'import ctypes; ctypes.CDLL("libcublas.so.12"); print("libcublas.so.12: OK")'

# To make the path permanent for the dynamic linker
echo '/usr/local/lib/ollama/cuda_v12' | sudo tee /etc/ld.so.conf.d/ollama-cuda-v12.conf
sudo ldconfig

ldconfig -p | grep libcublas.so.12
python3 -c 'import ctypes; ctypes.CDLL("libcublas.so.12"); print("libcublas.so.12: OK")'
```

## Run

```bash
source whisper-env/bin/activate  # skip if already active
uvicorn main:app --host 0.0.0.0 --port 9000
```

## How to extend

### Add a config option

Add a field to `Settings` in [app/config.py](app/config.py) — it is automatically read from the environment (or `.env`):

```python
class Settings(BaseSettings):
    whisper_model: str = "small"
    whisper_beam_size: int = 5        # ← new option
```

Then use it inside `WhisperService._run_transcribe`:

```python
def _run_transcribe(self, audio_path: str):
    return self._model.transcribe(
        audio_path,
        beam_size=self.settings.whisper_beam_size,   # ← pass it here
        ...
    )
```

### Add a new STT backend

1. Create `app/services/my_backend.py` that returns `TranscribeResult`:

```python
from app.services.whisper import TranscribeResult

class MyBackendService:
    def load(self) -> None: ...

    def transcribe(self, audio_path: str) -> TranscribeResult:
        ...
        return TranscribeResult(language="en", text="...", device="cpu", compute_type="int8")
```

2. Swap it in [app/lifespan.py](app/lifespan.py):

```python
from app.services.my_backend import MyBackendService

service = MyBackendService()
service.load()
app.state.whisper = service
```

No other files need to change.

### Add a new endpoint

Create a router file under `app/routers/` and register it in [main.py](main.py):

```python
# app/routers/languages.py
from fastapi import APIRouter
router = APIRouter(tags=["languages"])

@router.get("/languages")
def supported_languages() -> list[str]:
    return ["en", "de", "fr"]
```

```python
# main.py
from app.routers.languages import router as languages_router
app.include_router(languages_router)
```

## Verify

```bash
curl -X POST http://localhost:9000/transcribe \
  -F "file=@/path/to/audio.wav"
```

Expected response shape:

```json
{"language":"en","text":"...","device":"cuda","compute_type":"float16"}
```

If CUDA runtime still cannot be loaded, the service now falls back to CPU and you will typically see:

```json
{"language":"en","text":"...","device":"cpu","compute_type":"int8"}
```

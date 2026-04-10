# Audio Server

Two-service system:

- **STT service** (`stt-service/`) — FastAPI HTTP API that accepts an audio file and returns a transcription via faster-whisper
- **WebSocket server** (`src/`) — accepts audio chunks from a client, buffers PCM, wraps it as WAV, forwards it to the STT service, then to an LLM (Ollama), and returns text + summary

```
Client  →  WS Server (:8080)  →  STT Service (:9000)  →  faster-whisper
                               →  Ollama (:11434)
```

---

## 1. STT Service (Python)

### Requirements

- Python 3.10+
- NVIDIA GPU for CUDA acceleration, or CPU fallback
- If using GPU: CUDA 12 runtime with `libcublas.so.12` available to the process

### Setup

```bash
cd stt-service
python3 -m venv whisper-env
source whisper-env/bin/activate
pip install faster-whisper fastapi uvicorn python-multipart
```

### Install CUDA / cuBLAS (`libcublas.so.12`)

These commands are for `Ubuntu 22.04 x86_64`.

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update

# Full toolkit
sudo apt-get install -y cuda-toolkit

# Or the narrower cuBLAS-only runtime path
sudo apt-get install -y libcublas-12-8 libcublas-dev-12-8
```

### Check GPU / CUDA / cuBLAS

```bash
nvidia-smi
ldconfig -p | grep libcublas.so.12
find /usr -name 'libcublas.so*' 2>/dev/null
find /usr/local -name 'libcublas.so*' 2>/dev/null
python3 -c "import ctypes; ctypes.CDLL('libcublas.so.12'); print('libcublas.so.12: OK')"
```

If the library exists but is still not found by Python:

```bash
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
sudo ldconfig
ldconfig -p | grep libcublas.so.12
```

### Run

```bash
uvicorn main:app --host 0.0.0.0 --port 9000
```

The service starts on `http://localhost:9000`. On first run, faster-whisper will download the `small` model (~244 MB).

### Verify

```bash
curl -X POST http://localhost:9000/transcribe \
  -F "file=@/path/to/audio.wav"
# {"language":"en","text":"...","device":"cuda","compute_type":"float16"}
```

If CUDA runtime cannot be loaded, the service falls back to CPU and the response will show `"device":"cpu"`.

---

## 2. Ollama (LLM)

### Install

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS via Homebrew
brew install ollama
```

For Windows, download the installer from [ollama.com/download](https://ollama.com/download).

### Pull model and run

```bash
ollama pull llama3
ollama serve          # starts the API on http://localhost:11434
```

> `ollama run llama3` combines pull + serve + interactive shell. For headless use, run `ollama serve` separately.

---

## 3. WebSocket Server (Node.js)

### Requirements

- Node.js 18+
- STT service running on `:9000`
- Ollama running with model `llama3` on `:11434`

### Setup

```bash
npm install
```

### Run

```bash
npm run dev
# or
npm run build && npm start
```

The server starts on `ws://localhost:8080`.

### Verify

```js
const ws = new WebSocket("ws://localhost:8080");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
// send binary PCM audio chunks over ws.send(audioBuffer)
// response: { text: "...", summary: "..." }
```

---

## Startup Order

1. Start Ollama: `ollama serve`
2. Start the STT service
3. Start the WebSocket server

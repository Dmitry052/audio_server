# Audio Server

Two-service system:

- **STT service** (`stt-service/`) — FastAPI HTTP API that accepts an audio file and returns a transcription via faster-whisper (GPU)
- **WebSocket server** (`src/`) — accepts audio chunks from a client, forwards them to the STT service, then to an LLM (Ollama), and returns text + summary

```
Client  →  WS Server (:8080)  →  STT Service (:9000)  →  faster-whisper (CUDA)
                               →  Ollama (:11434)
```

---

## 1. STT Service (Python, GPU)

### Requirements

- Python 3.10+
- NVIDIA GPU with CUDA 11.x or 12.x
- cuDNN 8+

### Setup

```bash
cd stt-service
python3 -m venv whisper-env
source whisper-env/bin/activate
pip install faster-whisper fastapi uvicorn python-multipart
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
# {"language": "en", "text": "..."}
```

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
npm run dev       # dev mode with hot-reload
# or
npm run build && npm start   # production
```

The server starts on `ws://localhost:8080`.

### Verify

```js
const ws = new WebSocket("ws://localhost:8080");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
// send audio buffer: ws.send(audioBuffer)
// response: { text: "...", summary: "..." }
```

---

## Startup Order

1. Start Ollama: `ollama serve`
2. Start the STT service
3. Start the WebSocket server

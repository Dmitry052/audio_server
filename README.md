# Audio Server

> 🎙️ Real-time speech pipeline: client audio → WebSocket streaming or HTTP file upload → speech-to-text → LLM summary.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-2F7D32?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-WS%20Server-3178C6?style=flat-square&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-STT%20Service-009688?style=flat-square&logo=fastapi&logoColor=white)
![faster-whisper](https://img.shields.io/badge/faster--whisper-STT-7A3FF2?style=flat-square)
![Ollama](https://img.shields.io/badge/Ollama-LLM%20Summary-111111?style=flat-square)
![WebSocket](https://img.shields.io/badge/WebSocket-Streaming-F97316?style=flat-square)
![HTTP](https://img.shields.io/badge/HTTP-REST%20Upload-22C55E?style=flat-square)

## Highlights

This repository combines two small services into one voice-processing pipeline:

- 🎧 `stt-service/` handles speech-to-text through `faster-whisper`
- 🌐 `src/` accepts PCM audio over WebSocket **or** a full WAV file over HTTP, buffers/encodes it, sends to STT, then asks Ollama for a summary
- 🧠 the client receives a compact JSON response with `text` and `summary`

## Architecture

```mermaid
flowchart LR
    client["Client<br/>PCM audio chunks"] --> ws["Audio Server<br/>Node.js + TypeScript<br/>:8080"]
    upload["HTTP Client<br/>WAV file upload"] -- "POST /summarize" --> ws
    ws --> stt["STT Service<br/>FastAPI<br/>:9000"]
    stt --> fw["faster-whisper<br/>transcription"]
    fw -. transcript .-> ws
    ws --> ollama["Ollama<br/>LLM summary<br/>:11434"]
    ollama -. summary .-> ws
    ws -. "JSON { text, summary }" .-> client
    ws -. "JSON { text, summary }" .-> upload

    classDef entry fill:#FFF4DB,stroke:#D97706,color:#7C2D12,stroke-width:1.5px;
    classDef service fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.5px;
    classDef engine fill:#ECFDF3,stroke:#059669,color:#064E3B,stroke-width:1.5px;
    classDef ai fill:#F5F3FF,stroke:#7C3AED,color:#4C1D95,stroke-width:1.5px;

    class client,upload entry;
    class ws,stt service;
    class fw engine;
    class ollama ai;
```

## Stack At a Glance

| Layer | Tech | Purpose |
| --- | --- | --- |
| Client | WebSocket client | Streams raw PCM chunks in real time |
| Client | HTTP client | Uploads a pre-recorded WAV file for summarization |
| Transport | `ws` + Node.js `http` | Shared port — WS streaming and REST on `:8080` |
| STT API | FastAPI | Accepts uploaded WAV and returns transcription |
| Speech Engine | `faster-whisper` | Converts speech to text |
| LLM | Ollama (`llama3`) | Builds a short summary |

## Code Structure

```
src/
├── index.ts                    # Entry point — creates and starts AudioServer
├── config.ts                   # All env vars and tuning constants
├── audio/
│   ├── signal.ts               # analyzePcmSignal — RMS / peak voice-activity gate
│   └── wav.ts                  # pcmToWav — builds RIFF/WAV header around raw PCM
├── services/
│   ├── SttService.ts           # HTTP client → STT microservice (:9000)
│   └── LlmService.ts           # HTTP client → Ollama (:11434)
├── pipeline/
│   └── AudioPipeline.ts        # Orchestrates signal → STT → LLM
│                               #   processPcm()  — used by WebSocket path
│                               #   processWav()  — used by HTTP upload path
├── server/
│   ├── WebSocketSession.ts     # Per-connection PCM buffer + flush logic
│   └── AudioServer.ts          # HTTP + WS server on the same port
└── utils/
    ├── errors.ts               # extractErrorDetails — normalises thrown values
    └── transcript.ts           # shouldIgnoreTranscript, hasEnoughContextForSummary
```

## Quick Start

### 1. Start Ollama 🧠

```bash
ollama pull llama3
ollama serve
```

Runs on `http://localhost:11434`.

### 2. Start the STT Service 🎙️

```bash
cd stt-service
python3 -m venv whisper-env
source whisper-env/bin/activate
pip install faster-whisper fastapi uvicorn python-multipart
uvicorn main:app --host 0.0.0.0 --port 9000
```

Runs on `http://localhost:9000`.

### 3. Start the Audio Server 🌐

```bash
npm install
npm run dev
```

Runs on `localhost:8080` — serves both WebSocket and HTTP on the same port.

## STT Service (Python)

### Requirements

- Python 3.10+
- NVIDIA GPU for CUDA acceleration, or CPU fallback
- if using GPU: CUDA 12 runtime with `libcublas.so.12` available to the process

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

If the library exists but is still not found by Python, and `find` shows it under Ollama's CUDA runtime path:

```bash
export LD_LIBRARY_PATH=/usr/local/lib/ollama/cuda_v12:$LD_LIBRARY_PATH
python3 -c 'import ctypes; ctypes.CDLL("libcublas.so.12"); print("libcublas.so.12: OK")'

# Make it permanent
echo '/usr/local/lib/ollama/cuda_v12' | sudo tee /etc/ld.so.conf.d/ollama-cuda-v12.conf
sudo ldconfig
ldconfig -p | grep libcublas.so.12
```

### Verify

```bash
curl -X POST http://localhost:9000/transcribe \
  -F "file=@/path/to/audio.wav"
# {"language":"en","text":"...","device":"cuda","compute_type":"float16"}
```

If CUDA runtime cannot be loaded, the service falls back to CPU and the response will show `"device":"cpu"`.

## Audio Server (Node.js)

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

### WebSocket — real-time PCM streaming

Connect to `ws://localhost:8080` and send raw 16-bit little-endian PCM chunks (16 kHz, mono).
The server buffers incoming audio, flushes once enough data has accumulated (≥ 5 s), and sends back a JSON result.

```js
const ws = new WebSocket("ws://localhost:8080");

ws.onmessage = (event) => {
  const { text, summary } = JSON.parse(event.data);
  console.log("transcript:", text);
  console.log("summary:   ", summary);
};

// stream raw PCM chunks
ws.send(pcmBuffer); // ArrayBuffer or Buffer, binary
```

Expected response:
```json
{ "text": "We need to move the meeting to Thursday.", "summary": "The caller requested to reschedule the meeting to Thursday." }
```

### HTTP — upload a pre-recorded WAV file

`POST /summarize` accepts the raw WAV binary as the request body and returns the same JSON structure.
Suitable for batch processing of recordings of any length.

**curl**
```bash
curl -X POST http://localhost:8080/summarize \
  --data-binary @recording.wav \
  -H "Content-Type: audio/wav"
```

**fetch (browser / Node.js)**
```js
const wavBytes = await fs.readFile("recording.wav");

const response = await fetch("http://localhost:8080/summarize", {
  method: "POST",
  headers: { "Content-Type": "audio/wav" },
  body: wavBytes,
});

const { text, summary } = await response.json();
```

**Python**
```python
import requests

with open("recording.wav", "rb") as f:
    r = requests.post(
        "http://localhost:8080/summarize",
        data=f,
        headers={"Content-Type": "audio/wav"},
    )

print(r.json())
# {"text": "...", "summary": "..."}
```

**Response codes**

| Code | Meaning |
| --- | --- |
| `200` | Success — `{ text, summary }` returned |
| `422` | Audio produced no usable transcript (silent or filtered) |
| `500` | Internal pipeline failure |

## Environment Variables

All variables are optional — defaults are shown in the **Default** column.

| Variable | Default | Description |
| --- | --- | --- |
| `STT_URL` | `http://localhost:9000/transcribe` | STT service endpoint |
| `OLLAMA_URL` | `http://localhost:11434/api/chat` | Ollama chat API endpoint |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |
| `SUMMARY_LANGUAGE` | `English` | Language for the generated summary (e.g. `Russian`, `Spanish`) |
| `SUMMARY_MAX_SENTENCES` | `3` | Maximum number of sentences in the summary |
| `DEBUG_SAVE_WAV` | _(off)_ | Set to `1` to save each processed WAV to disk |
| `DEBUG_WAV_PATH` | `/tmp/audio_server_debug.wav` | Path used when `DEBUG_SAVE_WAV=1` |

**Example:**
```bash
STT_URL=http://stt-host:9000/transcribe \
OLLAMA_MODEL=mistral \
SUMMARY_LANGUAGE=Russian \
SUMMARY_MAX_SENTENCES=2 \
npm run dev
```

## Startup Order

1. `ollama serve` — LLM on `:11434`
2. `uvicorn main:app --host 0.0.0.0 --port 9000` — STT service on `:9000`
3. `npm run dev` — Audio Server on `:8080` (WS + HTTP)

# Audio Server

> Real-time speech pipeline: client audio → WebSocket streaming or HTTP file upload → async job queue → speech-to-text → LLM summary.

![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-2F7D32?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![pg-boss](https://img.shields.io/badge/pg--boss-job%20queue-336791?style=flat-square&logo=postgresql&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-STT%20Service-009688?style=flat-square&logo=fastapi&logoColor=white)
![faster-whisper](https://img.shields.io/badge/faster--whisper-STT-7A3FF2?style=flat-square)
![Ollama](https://img.shields.io/badge/Ollama-LLM%20Summary-111111?style=flat-square)
![WebSocket](https://img.shields.io/badge/WebSocket-Streaming-F97316?style=flat-square)
![HTTP](https://img.shields.io/badge/HTTP-REST%20Upload-22C55E?style=flat-square)

## Highlights

- `stt-service/` — Python FastAPI service that handles speech-to-text via `faster-whisper`
- `src/` — NestJS server that accepts PCM audio over WebSocket **or** a WAV file over HTTP
- All heavy work (STT + LLM) runs **asynchronously** via a [pg-boss](https://github.com/timgit/pg-boss) job queue backed by PostgreSQL — no timeouts, no blocking, no load spikes
- The client receives `{ text, summary }` JSON after each pipeline run — either pushed over WebSocket or fetched by polling

---

## Architecture

```mermaid
flowchart TD
    subgraph Clients
        WS["WebSocket Client\nraw PCM chunks"]
        HTTP["HTTP Client\nWAV file upload"]
        POLL["HTTP Client\nGET polling"]
    end

    subgraph AudioServer["Audio Server (NestJS :8080)"]
        GW["AudioGateway\nWebSocket handler"]
        CTL["AudioController\nHTTP handler"]
        QSvc["QueueService\nenqueue / getJobStatus"]
        CSvc["AudioClientsService\nclientId → WebSocket map"]
        WORKER["AudioWorker\nteamSize = QUEUE_CONCURRENCY"]
    end

    subgraph Queue["Job Queue"]
        PG[("pg-boss\nPostgreSQL\n:5432")]
    end

    subgraph External
        STT["STT Service\nFastAPI :9000\nfaster-whisper"]
        LLM["LLM Service\nOllama :11434\nor LM Studio :1234"]
    end

    WS -- "binary PCM" --> GW
    HTTP -- "POST /summarize\nWAV body" --> CTL
    POLL -- "GET /summarize/:jobId" --> CTL

    GW -- "enqueue(pcm)" --> QSvc
    CTL -- "enqueue(wav)" --> QSvc
    CTL -- "getJobStatus(id)" --> QSvc
    QSvc -- "INSERT job" --> PG
    PG -. "{ jobId }" .-> QSvc
    QSvc -. "{ jobId, status: queued }" .-> GW
    GW -. "{ jobId, status: queued }" .-> WS

    PG -- "poll → pick job" --> WORKER
    WORKER -- "POST /transcribe" --> STT
    STT -. "transcript" .-> WORKER
    WORKER -- "summarize(text)" --> LLM
    LLM -. "summary" .-> WORKER
    WORKER -- "UPDATE job output" --> PG
    WORKER -. "{ text, summary }\nvia AudioClientsService" .-> CSvc
    CSvc -. "push result" .-> WS

    PG -. "{ state, output }" .-> QSvc
    QSvc -. "{ state, result }" .-> CTL
    CTL -. "{ state, result }" .-> POLL

    classDef client  fill:#FFF4DB,stroke:#D97706,color:#7C2D12,stroke-width:1.5px;
    classDef server  fill:#E8F1FF,stroke:#2563EB,color:#0F172A,stroke-width:1.5px;
    classDef queue   fill:#EFF6FF,stroke:#3B82F6,color:#1E3A5F,stroke-width:1.5px;
    classDef ext     fill:#ECFDF3,stroke:#059669,color:#064E3B,stroke-width:1.5px;

    class WS,HTTP,POLL client;
    class GW,CTL,QSvc,CSvc,WORKER server;
    class PG queue;
    class STT,LLM ext;
```

---

## Async Queue Flow

The sequence below shows exactly what happens from the moment audio arrives to the moment the result is delivered — for both transports.

```mermaid
sequenceDiagram
    autonumber
    participant C  as Client (WS / HTTP)
    participant GW as Gateway / Controller
    participant Q  as QueueService
    participant PG as pg-boss (PostgreSQL)
    participant W  as AudioWorker
    participant S  as STT Service
    participant L  as LLM Service

    C  ->>  GW : PCM chunks (≥5 s) / WAV file
    GW ->>  Q  : enqueue({ type, buffer, clientId })
    Q  ->>  PG : INSERT INTO pgboss.job
    PG -->> Q  : jobId
    Q  -->> GW : jobId
    GW -->> C  : { jobId, status: "queued" }

    Note over PG,W: Background — worker polls PostgreSQL
    PG  ->>  W  : pick up job (respects QUEUE_CONCURRENCY)
    W   ->>  S  : POST /transcribe  (WAV bytes)
    S   -->> W  : { text }
    W   ->>  L  : summarize(text)
    L   -->> W  : { summary }
    W   ->>  PG : complete job → output = { text, summary }

    alt WebSocket client still connected
        W -->> C : { text, summary }  (via AudioClientsService)
    end

    alt HTTP client polling
        C  ->>  GW : GET /summarize/:jobId
        GW ->>  PG : getJobById(jobId)
        PG -->> GW : { state: "completed", output }
        GW -->> C  : { jobId, state, result: { text, summary } }
    end
```

### Retry strategy

If STT or LLM fails, pg-boss retries the job automatically:

| Attempt | Delay |
|---------|-------|
| 1st retry | 5 s |
| 2nd retry | 10 s |
| 3rd retry | 20 s |
| After 3 failures | job state → `"failed"` |

---

## NestJS Module Structure

```
src/
├── main.ts                                # Bootstrap: NestFactory, WsAdapter, body parsers
├── app.module.ts                          # Root module — wires ConfigModule + feature modules
│
├── config/
│   └── configuration.ts                  # Config factory: server, stt, llm, audio, queue, debug
│
├── queue/                                 # QueueModule — pg-boss integration
│   ├── queue.module.ts                   # Provides PgBoss instance + QueueService
│   ├── pg-boss.provider.ts               # Async factory: new PgBoss → boss.start()
│   ├── queue.service.ts                  # enqueue() + getJobStatus()
│   ├── constants.ts                      # PG_BOSS_TOKEN, AUDIO_QUEUE name
│   └── interfaces/
│       └── audio-job.interface.ts        # AudioJobData, AudioJobResult
│
├── audio/                                 # AudioModule — transport + pipeline + worker
│   ├── audio.module.ts
│   ├── audio.controller.ts               # POST /summarize (202 + jobId)  GET /summarize/:id
│   ├── audio.gateway.ts                  # WebSocket: buffer PCM → enqueue → ack { jobId }
│   ├── audio-pipeline.service.ts         # Orchestrates signal → WAV → STT → LLM
│   ├── audio.worker.ts                   # OnApplicationBootstrap: boss.work() consumer
│   ├── audio-clients.service.ts          # Map<clientId, WebSocket> for async result push
│   └── interfaces/
│       └── pipeline-result.interface.ts  # { text, summary }
│
├── stt/                                   # SttModule
│   ├── stt.module.ts
│   └── stt.service.ts                    # HTTP client → STT microservice (:9000)
│
├── llm/                                   # LlmModule
│   ├── llm.module.ts                     # Factory provider: selects Ollama or LM Studio
│   ├── llm.tokens.ts                     # LLM_SERVICE injection token
│   ├── ollama-llm.service.ts             # Ollama backend → /api/chat
│   ├── lm-studio-llm.service.ts          # LM Studio backend → OpenAI-compatible API
│   └── interfaces/
│       └── llm.interface.ts              # ILlmService: summarize(text): Promise<string>
│
└── common/
    └── utils/
        ├── signal.util.ts                # analyzePcmSignal — RMS/peak voice-activity gate
        ├── wav.util.ts                   # pcmToWav — RIFF/WAV header builder
        ├── errors.util.ts                # extractErrorDetails — normalises thrown values
        └── transcript.util.ts            # shouldIgnoreTranscript, hasEnoughContextForSummary
```

### Module dependency graph

```
AppModule
 ├── ConfigModule (global)
 ├── SttModule
 ├── LlmModule
 └── AudioModule
      ├── imports SttModule
      ├── imports LlmModule
      ├── imports QueueModule ──────── pg-boss provider + QueueService
      ├── AudioController              POST /summarize (202)  GET /summarize/:jobId
      ├── AudioGateway                 WebSocket PCM streaming
      ├── AudioPipelineService         signal → STT → LLM
      ├── AudioWorker                  job consumer (OnApplicationBootstrap)
      └── AudioClientsService          clientId → WebSocket result delivery
```

---

## Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | NestJS 10 + Express | DI, modules, HTTP routing |
| Transport | `@nestjs/platform-ws` + `ws` | WebSocket on the same HTTP port |
| Config | `@nestjs/config` | Typed env-var loading |
| **Job queue** | **pg-boss 9** | **Async job processing, retries, status polling** |
| **Queue storage** | **PostgreSQL** | **pg-boss persists jobs in `pgboss` schema** |
| STT client | axios | Multipart WAV upload to FastAPI |
| LLM — Ollama | axios | `/api/chat` endpoint |
| LLM — LM Studio | `openai` SDK | OpenAI-compatible `/v1` endpoint |
| STT engine | FastAPI + `faster-whisper` | Speech-to-text microservice |

---

## Quick Start

### With Ollama

**1. Start PostgreSQL** (pg-boss requires it)

```bash
docker compose up -d
```

pg-boss creates its own `pgboss` schema automatically on first start.

**2. Start Ollama**

```bash
ollama pull llama3
ollama serve
```

Runs on `http://localhost:11434`.

**3. Start the STT service**

```bash
cd stt-service
bash setup.sh
source whisper-env/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9000
```

Runs on `http://localhost:9000`.

**4. Start the Audio Server**

```bash
npm install
npm run dev
```

Runs on `localhost:8080` — serves both WebSocket and HTTP on the same port.

---

### With LM Studio

**1. Start PostgreSQL**

```bash
docker compose up -d
```

**2. Open LM Studio, load a model, and start the local server**

In the LM Studio UI: *Local Server → Start Server* (default port: `1234`).
Note the exact model identifier shown in the UI — you will need it for `LM_STUDIO_MODEL`.

**3. Start the STT service** (same as above)

**4. Start the Audio Server**

```bash
npm install
LLM_PROVIDER=lmstudio \
LM_STUDIO_URL=http://localhost:1234/v1 \
LM_STUDIO_MODEL=mistral-7b-instruct \
npm run dev
```

`LM_STUDIO_MODEL` must match the identifier shown in LM Studio (e.g. `mistral-7b-instruct`, `llama-3-8b-instruct`, etc.).

---

## STT Service (Python)

### Requirements

- Python 3.10+
- NVIDIA GPU for CUDA acceleration, or CPU fallback
- If using GPU: CUDA 12 runtime with `libcublas.so.12` available to the process

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

If CUDA runtime cannot be loaded the service falls back to CPU and the response will show `"device":"cpu"`.

---

## Audio Server (Node.js / NestJS)

### Requirements

- Node.js 18+
- PostgreSQL running (pg-boss creates its own schema automatically)
- STT service running on `:9000`
- Ollama running with model `llama3` on `:11434`

### Setup

```bash
npm install
```

### Run

```bash
npm run dev           # hot-reload via tsx watch
npm run build && npm start   # compile to dist/ then run
```

---

### WebSocket — real-time PCM streaming

Connect to `ws://localhost:8080` and send raw 16-bit little-endian PCM chunks (16 kHz, mono).

The server **immediately acknowledges** with `{ jobId, status: "queued" }` and processes in the background. When done, the result is pushed back over the same connection.

```js
const ws = new WebSocket("ws://localhost:8080");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.status === "queued") {
    // Acknowledged — heavy processing running in background
    console.log("job queued:", msg.jobId);
  } else if (msg.text !== undefined) {
    // Result delivered asynchronously once STT + LLM complete
    console.log("transcript:", msg.text);
    console.log("summary:   ", msg.summary);
  } else if (msg.error) {
    console.error("pipeline error:", msg.error);
  }
};

// Stream raw PCM chunks
ws.send(pcmBuffer); // ArrayBuffer or Buffer, binary
```

---

### HTTP — upload a pre-recorded WAV file

Processing is **fully asynchronous**: `POST /summarize` returns `202 Accepted` with a `jobId`, then poll `GET /summarize/:jobId` until `state` is `"completed"`.

#### Step 1 — Submit the job

```bash
curl -s -X POST http://localhost:8080/summarize \
  --data-binary @recording.wav \
  -H "Content-Type: audio/wav"
```

```json
{ "jobId": "b3d7a1e2-...", "status": "queued" }
```

#### Step 2 — Poll for the result

```bash
curl http://localhost:8080/summarize/b3d7a1e2-...
```

While processing:
```json
{ "jobId": "b3d7a1e2-...", "state": "active" }
```

When done:
```json
{
  "jobId": "b3d7a1e2-...",
  "state": "completed",
  "result": { "text": "We need to move the meeting to Thursday.", "summary": "The caller requested rescheduling to Thursday." },
  "createdAt": "2026-04-29T10:00:00.000Z",
  "completedAt": "2026-04-29T10:00:04.312Z"
}
```

#### Job states

| `state` | Meaning |
|---|---|
| `created` | Waiting in queue |
| `active` | STT + LLM running |
| `completed` | Result ready in `result` field |
| `retry` | Previous attempt failed, queued for retry |
| `failed` | All 3 attempts exhausted — error in `error` field |
| `expired` | Job was not picked up within 5 minutes |

#### Response codes

| Code | Meaning |
|---|---|
| `202` | Job accepted — returns `{ jobId, status: "queued" }` |
| `200` | Job status returned (polling) |
| `404` | `jobId` not found or expired |
| `500` | Failed to enqueue |

#### fetch (browser / Node.js)

```js
// Submit
const res = await fetch("http://localhost:8080/summarize", {
  method: "POST",
  headers: { "Content-Type": "audio/wav" },
  body: wavBytes,
});
const { jobId } = await res.json(); // res.status === 202

// Poll
let result;
while (!result) {
  await new Promise(r => setTimeout(r, 1000));
  const poll = await fetch(`http://localhost:8080/summarize/${jobId}`);
  const data = await poll.json();
  if (data.state === "completed") result = data.result;
  if (data.state === "failed")    throw new Error("pipeline failed");
}
console.log(result.text, result.summary);
```

#### Python

```python
import time, requests

# Submit
r = requests.post(
    "http://localhost:8080/summarize",
    data=open("recording.wav", "rb"),
    headers={"Content-Type": "audio/wav"},
)
job_id = r.json()["jobId"]  # r.status_code == 202

# Poll
while True:
    time.sleep(1)
    data = requests.get(f"http://localhost:8080/summarize/{job_id}").json()
    if data["state"] == "completed":
        print(data["result"])
        break
    if data["state"] == "failed":
        raise RuntimeError(data.get("error"))
```

---

## Environment Variables

All variables are optional — defaults are shown in the **Default** column.

| Variable | Default | Description |
|---|---|---|
| `WS_PORT` | `8080` | Port for both HTTP and WebSocket |
| `WS_HOST` | `0.0.0.0` | Bind address |
| `STT_URL` | `http://localhost:9000/transcribe` | STT service endpoint |
| `LLM_PROVIDER` | `ollama` | LLM backend: `ollama` or `lmstudio` |
| `OLLAMA_URL` | `http://localhost:11434/api/chat` | Ollama chat API endpoint |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |
| `LM_STUDIO_URL` | `http://localhost:1234/v1` | LM Studio base URL (OpenAI-compatible) |
| `LM_STUDIO_MODEL` | `local-model` | Model identifier shown in LM Studio |
| `SUMMARY_LANGUAGE` | `English` | Language for the generated summary (e.g. `Russian`, `Spanish`) |
| `SUMMARY_MAX_SENTENCES` | `3` | Maximum sentences in the summary |
| `MIN_AUDIO_SECONDS` | `5` | Minimum buffered seconds before a WebSocket flush is triggered |
| `MIN_RMS` | `0.003` | RMS amplitude gate — audio below this is skipped |
| `QUEUE_DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/audio_server` | PostgreSQL connection string for pg-boss |
| `QUEUE_CONCURRENCY` | `2` | Max parallel STT+LLM jobs processed simultaneously |
| `DEBUG_SAVE_WAV` | _(off)_ | Set to `1` to save each processed WAV to disk |
| `DEBUG_WAV_PATH` | `/tmp/audio_server_debug.wav` | Path used when `DEBUG_SAVE_WAV=1` |

**Example:**
```bash
QUEUE_DATABASE_URL=postgres://app:secret@db:5432/audio_server \
QUEUE_CONCURRENCY=4 \
LLM_PROVIDER=ollama \
OLLAMA_MODEL=mistral \
SUMMARY_LANGUAGE=Russian \
npm run dev
```

---

## Startup Order

1. `docker compose up -d` — PostgreSQL 18 on `:5432` (pg-boss creates its schema on first start)
2. `ollama serve` — LLM on `:11434`
3. `uvicorn main:app --host 0.0.0.0 --port 9000` — STT service on `:9000`
4. `npm run dev` — Audio Server on `:8080` (WS + HTTP)

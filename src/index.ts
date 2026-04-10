import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import axios from "axios";

const WS_PORT = 8080;
const WS_HOST = "0.0.0.0";
const STT_URL = process.env.STT_URL || "http://localhost:9000/transcribe";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const MIN_AUDIO_SECONDS = 5;
const MIN_PCM_BYTES = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * MIN_AUDIO_SECONDS;
const MIN_SUMMARY_WORDS = 3;
const IGNORED_TRANSCRIPTS = new Set([
  "you",
  "thank you",
  "thanks",
  "bye",
  "bye-bye",
  "goodbye",
]);

const wss = new WebSocketServer({ port: WS_PORT, host: WS_HOST });

console.log(`🚀 WS Server started on ws://${WS_HOST}:${WS_PORT}`);

wss.on("connection", (ws) => {
  console.log("📡 Client connected");

  let pcmChunks: Buffer[] = [];
  let pcmBytes = 0;
  let isProcessing = false;

  const flushBufferedAudio = async (reason: string) => {
    if (isProcessing || pcmBytes === 0) {
      return;
    }

    isProcessing = true;

    const pcmBuffer = Buffer.concat(pcmChunks, pcmBytes);
    pcmChunks = [];
    pcmBytes = 0;

    try {
      const wavBuffer = pcmToWav(pcmBuffer, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);
      const filename = `audio-${randomUUID()}.wav`;
      const form = new FormData();

      const wavBytes = new Uint8Array(wavBuffer);
      form.append("file", new Blob([wavBytes], { type: "audio/wav" }), filename);

      console.log(
        `🎙️ Sending audio to STT: reason=${reason}, pcmBytes=${pcmBuffer.length}, wavBytes=${wavBuffer.length}`,
      );

      const stt = await axios.post(STT_URL, form, {
        headers: {
          Accept: "application/json",
        },
        maxBodyLength: Infinity,
      });

      const text = String(stt.data?.text || "").trim();

      console.log(`🧠 STT: ${text || "<empty>"}`);

      if (!text) {
        return;
      }

      if (shouldIgnoreTranscript(text)) {
        console.log(`🧹 Ignoring low-signal transcript: ${text}`);
        return;
      }

      let summary = "";

      if (hasEnoughContextForSummary(text)) {
        try {
          const llm = await axios.post(OLLAMA_URL, {
            model: OLLAMA_MODEL,
            prompt: `Summarize this call: ${text}`,
            stream: false,
          });

          summary = String(llm.data?.response || "").trim();
        } catch (error) {
          console.error("ollama error:", extractErrorDetails(error));
        }
      } else {
        console.log(`⏭️ Skipping summary for short transcript: ${text}`);
      }

      if (ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify({
          text,
          summary,
        });

        ws.send(payload);
        console.log(`📤 Sent result to client: ${payload}`);
      }
    } catch (error) {
      console.error("pipeline error:", extractErrorDetails(error));

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            error: "audio pipeline failed",
          }),
        );
      }
    } finally {
      isProcessing = false;

      if (pcmBytes >= MIN_PCM_BYTES) {
        void flushBufferedAudio("backlog");
      }
    }
  };

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      const message = data.toString();

      if (message !== "pong") {
        console.log(`ℹ️ Ignoring non-binary WS message: ${message}`);
      }

      return;
    }

    const audioBuffer = Buffer.from(data as Buffer);

    pcmChunks.push(audioBuffer);
    pcmBytes += audioBuffer.length;

    if (pcmChunks.length === 1) {
      console.log(`📦 First PCM chunk received: ${audioBuffer.length} bytes`);
    }

    if (pcmBytes >= MIN_PCM_BYTES) {
      void flushBufferedAudio("threshold");
    }
  });

  ws.on("close", () => {
    console.log("🔌 Client disconnected");

    if (pcmBytes > 0) {
      void flushBufferedAudio("close");
    }
  });

  ws.on("error", (error) => {
    console.error("ws error:", extractErrorDetails(error));
  });
});

function hasEnoughContextForSummary(text: string) {
  return text.split(/\s+/).filter(Boolean).length >= MIN_SUMMARY_WORDS;
}

function shouldIgnoreTranscript(text: string) {
  const normalized = text.toLowerCase().replace(/[.!?,;:]+$/g, "").trim();

  if (!normalized) {
    return true;
  }

  if (IGNORED_TRANSCRIPTS.has(normalized)) {
    return true;
  }

  return normalized.split(/\s+/).length === 1 && normalized.length <= 4;
}

function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function extractErrorDetails(error: unknown) {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

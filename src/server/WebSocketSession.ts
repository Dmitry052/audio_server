import WebSocket from "ws";
import { AudioPipeline } from "../pipeline/AudioPipeline";
import { extractErrorDetails } from "../utils/errors";
import { MIN_PCM_BYTES } from "../config";

// Manages the PCM audio buffer and processing state for a single connected WebSocket client.
// Each connection gets its own instance so sessions are fully isolated.
export class WebSocketSession {
  private pcmChunks: Buffer[] = [];
  private pcmBytes = 0;
  private isProcessing = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly pipeline: AudioPipeline,
  ) {
    this.ws.on("message", this.onMessage.bind(this));
    this.ws.on("close", this.onClose.bind(this));
    this.ws.on("error", this.onError.bind(this));
  }

  // Drains all accumulated PCM chunks through the pipeline.
  // Re-entrant calls while processing is in progress are dropped silently.
  private async flushBufferedAudio(reason: string): Promise<void> {
    if (this.isProcessing || this.pcmBytes === 0) return;

    this.isProcessing = true;

    const pcmBuffer = Buffer.concat(this.pcmChunks, this.pcmBytes);
    this.pcmChunks = [];
    this.pcmBytes = 0;

    try {
      const result = await this.pipeline.processPcm(pcmBuffer, reason);

      if (result && this.ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(result);
        this.ws.send(payload);
        console.log(`📤 Sent result to client: ${payload}`);
      }
    } catch (error) {
      console.error("pipeline error:", extractErrorDetails(error));

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ error: "audio pipeline failed" }));
      }
    } finally {
      this.isProcessing = false;

      // Flush again if more audio arrived while we were processing.
      if (this.pcmBytes >= MIN_PCM_BYTES) {
        void this.flushBufferedAudio("backlog");
      }
    }
  }

  private onMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (!isBinary) {
      const message = data.toString();
      if (message !== "pong") {
        console.log(`ℹ️ Ignoring non-binary WS message: ${message}`);
      }
      return;
    }

    const audioBuffer = Buffer.from(data as Buffer);
    this.pcmChunks.push(audioBuffer);
    this.pcmBytes += audioBuffer.length;

    if (this.pcmChunks.length === 1) {
      console.log(`📦 First PCM chunk received: ${audioBuffer.length} bytes`);
    }

    if (this.pcmBytes >= MIN_PCM_BYTES) {
      void this.flushBufferedAudio("threshold");
    }
  }

  private onClose(): void {
    console.log("🔌 Client disconnected");
    if (this.pcmBytes > 0) {
      void this.flushBufferedAudio("close");
    }
  }

  private onError(error: Error): void {
    console.error("ws error:", extractErrorDetails(error));
  }
}

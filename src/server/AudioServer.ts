import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { AudioPipeline } from "../pipeline/AudioPipeline";
import { WebSocketSession } from "./WebSocketSession";
import { extractErrorDetails } from "../utils/errors";
import { WS_HOST, WS_PORT } from "../config";

// Hosts both the WebSocket streaming endpoint and the HTTP REST endpoint on the same port.
// WebSocket and HTTP traffic share a single TCP listener; the WS upgrade handshake is
// handled transparently by the ws library.
export class AudioServer {
  private readonly httpServer: http.Server;
  private readonly wss: WebSocketServer;
  private readonly pipeline: AudioPipeline;

  constructor(pipeline: AudioPipeline = new AudioPipeline()) {
    this.pipeline = pipeline;
    this.httpServer = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on("connection", this.handleWsConnection.bind(this));
  }

  // Routes incoming HTTP requests to the appropriate handler.
  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === "POST" && req.url === "/summarize") {
      this.handleSummarize(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  // POST /summarize
  // Accepts a raw WAV file as the request body (Content-Type: audio/wav).
  // Returns JSON { text, summary } on success, or an error object with an appropriate status code.
  // Designed for large files — the body is streamed and buffered before processing.
  private handleSummarize(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));

    req.on("end", async () => {
      try {
        const wavBuffer = Buffer.concat(chunks);
        console.log(`📂 Received WAV for summarization: ${wavBuffer.length} bytes`);

        const result = await this.pipeline.processWav(wavBuffer);

        if (!result) {
          res.writeHead(422, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Audio produced no usable transcript" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("summarize error:", extractErrorDetails(error));
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Summarization failed" }));
      }
    });

    req.on("error", (error) => {
      console.error("request read error:", extractErrorDetails(error));
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request read failed" }));
    });
  }

  // Creates a scoped WebSocketSession for each incoming client connection.
  private handleWsConnection(ws: WebSocket): void {
    console.log("📡 Client connected");
    new WebSocketSession(ws, this.pipeline);
  }

  start(): void {
    this.httpServer.listen(WS_PORT, WS_HOST, () => {
      console.log(`🚀 Server started on ${WS_HOST}:${WS_PORT}`);
      console.log(`   WS  : ws://${WS_HOST}:${WS_PORT}`);
      console.log(`   HTTP: http://${WS_HOST}:${WS_PORT}/summarize`);
    });
  }
}

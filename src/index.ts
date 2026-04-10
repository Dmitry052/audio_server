import WebSocket, { WebSocketServer } from "ws";
import axios from "axios";

const wss = new WebSocketServer({ port: 8080 });

console.log("🚀 WS Server started on :8080");

wss.on("connection", (ws) => {
  console.log("📡 Client connected");

  ws.on("message", async (data) => {
    try {
      // 1. receive audio chunk
      const audioBuffer = Buffer.from(data as Buffer);

      // 2. send to whisper
      const form = new FormData();
      form.append("file", new Blob([audioBuffer]), "audio.wav");

      const stt = await axios.post("http://localhost:9000/transcribe", form);

      const text = stt.data.text;

      console.log("🧠 STT:", text);

      // 3. send to LLM
      const llm = await axios.post("http://localhost:11434/api/generate", {
        model: "llama3",
        prompt: `Summarize this call: ${text}`,
        stream: false,
      });

      ws.send(
        JSON.stringify({
          text,
          summary: llm.data.response,
        }),
      );
    } catch (e) {
      console.error("pipeline error:", e);
    }
  });
});

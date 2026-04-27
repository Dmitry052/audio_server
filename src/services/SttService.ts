import { randomUUID } from "node:crypto";
import axios from "axios";
import { STT_URL } from "../config";

// HTTP client for the speech-to-text microservice.
// Sends a WAV buffer as multipart form-data and returns the transcript string.
export class SttService {
  constructor(private readonly url: string = STT_URL) {}

  async transcribe(wavBuffer: Buffer): Promise<string> {
    const form = new FormData();
    const wavBytes = new Uint8Array(wavBuffer);
    const filename = `audio-${randomUUID()}.wav`;

    form.append("file", new Blob([wavBytes], { type: "audio/wav" }), filename);

    const response = await axios.post(this.url, form, {
      headers: { Accept: "application/json" },
      maxBodyLength: Infinity,
    });

    return String(response.data?.text || "").trim();
  }
}

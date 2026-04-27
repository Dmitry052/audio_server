import axios from "axios";
import { OLLAMA_URL, OLLAMA_MODEL } from "../config";

// HTTP client for the local Ollama LLM instance.
// Sends a transcript and returns a prose summary.
export class LlmService {
  constructor(
    private readonly url: string = OLLAMA_URL,
    private readonly model: string = OLLAMA_MODEL,
  ) {}

  async summarize(text: string): Promise<string> {
    const response = await axios.post(this.url, {
      model: this.model,
      prompt: `Summarize this call: ${text}`,
      stream: false,
    });

    return String(response.data?.response || "").trim();
  }
}

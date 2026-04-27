import axios from "axios";
import { OLLAMA_URL, OLLAMA_MODEL, SUMMARY_LANGUAGE, SUMMARY_MAX_SENTENCES } from "../config";

// HTTP client for the local Ollama LLM instance.
// Sends a transcript and returns a prose summary.
export class LlmService {
  constructor(
    private readonly url: string = OLLAMA_URL,
    private readonly model: string = OLLAMA_MODEL,
  ) {}

  async summarize(text: string): Promise<string> {
    const prompt =
      `Write a summary of the following call transcript in 1 to ${SUMMARY_MAX_SENTENCES} sentences in ${SUMMARY_LANGUAGE}. ` +
      `Only output the summary itself — no headings, no bullet points, no extra commentary.\n\n` +
      `Transcript: ${text}\n\n` +
      `Summary:`;

    const response = await axios.post(this.url, {
      model: this.model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 120,
      },
    });

    return String(response.data?.response || "").trim();
  }
}

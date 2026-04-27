import axios from "axios";
import { OLLAMA_URL, OLLAMA_MODEL, SUMMARY_LANGUAGE, SUMMARY_MAX_SENTENCES } from "../config";
import type { ILlmService } from "./ILlmService";

// Ollama backend — uses the /api/chat endpoint (OpenAI-style messages format).
export class LlmService implements ILlmService {
  constructor(
    private readonly url: string = OLLAMA_URL,
    private readonly model: string = OLLAMA_MODEL,
  ) {}

  async summarize(text: string): Promise<string> {
    const response = await axios.post(this.url, {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            `You are a call summarization assistant. ` +
            `Always respond in ${SUMMARY_LANGUAGE}. ` +
            `Write exactly 1 to ${SUMMARY_MAX_SENTENCES} sentences. ` +
            `Output only the summary — no headings, no bullet points, no preamble.`,
        },
        {
          role: "user",
          content: `Summarize this call transcript:\n\n${text}`,
        },
      ],
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 200,
      },
    });

    return String(response.data?.message?.content || "").trim();
  }
}

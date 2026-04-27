import OpenAI from "openai";
import { LM_STUDIO_URL, LM_STUDIO_MODEL, SUMMARY_LANGUAGE, SUMMARY_MAX_SENTENCES } from "../config";
import type { ILlmService } from "./ILlmService";

// LM Studio backend — uses its OpenAI-compatible /v1/chat/completions endpoint.
// LM Studio does not validate the API key, so any non-empty string is accepted.
export class LmStudioService implements ILlmService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(baseURL: string = LM_STUDIO_URL, model: string = LM_STUDIO_MODEL) {
    this.client = new OpenAI({ baseURL, apiKey: "lm-studio" });
    this.model = model;
  }

  async summarize(text: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
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
      temperature: 0.2,
      max_tokens: 200,
    });

    return String(completion.choices[0]?.message?.content || "").trim();
  }
}

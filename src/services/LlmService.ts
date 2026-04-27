import axios from "axios";
import { OLLAMA_URL, OLLAMA_MODEL } from "../config";

const SUMMARY_SYSTEM_PROMPT = `You are a call summarization assistant.
Your task is to write a concise summary of the provided call transcript in 1-3 sentences.
Rules:
- Focus on key topics, decisions, and action items
- Do NOT copy or paraphrase sentences verbatim from the transcript
- Write in third person, past tense
- Output only the summary — no headings, no preamble, no bullet points`;

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
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: `Transcript:\n${text}`,
      stream: false,
      options: {
        temperature: 0.3,
      },
    });

    return String(response.data?.response || "").trim();
  }
}

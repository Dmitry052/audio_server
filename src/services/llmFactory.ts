import { LLM_PROVIDER } from "../config";
import { LlmService } from "./LlmService";
import { LmStudioService } from "./LmStudioService";
import type { ILlmService } from "./ILlmService";

// Returns the correct LLM backend based on the LLM_PROVIDER environment variable.
export function createLlmService(): ILlmService {
  switch (LLM_PROVIDER) {
    case "lmstudio":
      console.log("🤖 LLM provider: LM Studio");
      return new LmStudioService();
    case "ollama":
    default:
      console.log("🤖 LLM provider: Ollama");
      return new LlmService();
  }
}

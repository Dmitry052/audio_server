// Common interface for all LLM backend implementations.
// AudioPipeline depends on this interface, not on any concrete provider.
export interface ILlmService {
  summarize(text: string): Promise<string>;
}

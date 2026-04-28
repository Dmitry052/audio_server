export interface ILlmService {
  summarize(text: string): Promise<string>;
}

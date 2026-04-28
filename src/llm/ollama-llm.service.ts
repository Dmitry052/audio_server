import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ILlmService } from './interfaces/llm.interface';

@Injectable()
export class OllamaLlmService implements ILlmService {
  private readonly url: string;
  private readonly model: string;
  private readonly language: string;
  private readonly maxSentences: number;

  constructor(config: ConfigService) {
    this.url = config.get<string>('llm.ollama.url')!;
    this.model = config.get<string>('llm.ollama.model')!;
    this.language = config.get<string>('summary.language')!;
    this.maxSentences = config.get<number>('summary.maxSentences')!;
  }

  async summarize(text: string): Promise<string> {
    const response = await axios.post(this.url, {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            `You are a call summarization assistant. ` +
            `Always respond in ${this.language}. ` +
            `Write exactly 1 to ${this.maxSentences} sentences. ` +
            `Output only the summary — no headings, no bullet points, no preamble.`,
        },
        {
          role: 'user',
          content: `Summarize this call transcript:\n\n${text}`,
        },
      ],
      stream: false,
      options: { temperature: 0.2, num_predict: 200 },
    });

    return String(response.data?.message?.content || '').trim();
  }
}

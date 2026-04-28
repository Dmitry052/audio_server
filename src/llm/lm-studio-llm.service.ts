import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ILlmService } from './interfaces/llm.interface';

@Injectable()
export class LmStudioLlmService implements ILlmService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly language: string;
  private readonly maxSentences: number;

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      baseURL: config.get<string>('llm.lmStudio.url'),
      apiKey: 'lm-studio',
    });
    this.model = config.get<string>('llm.lmStudio.model')!;
    this.language = config.get<string>('summary.language')!;
    this.maxSentences = config.get<number>('summary.maxSentences')!;
  }

  async summarize(text: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
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
      temperature: 0.2,
      max_tokens: 200,
    });

    return String(completion.choices[0]?.message?.content || '').trim();
  }
}

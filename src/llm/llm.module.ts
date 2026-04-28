import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaLlmService } from './ollama-llm.service';
import { LmStudioLlmService } from './lm-studio-llm.service';
import { LLM_SERVICE } from './llm.tokens';

@Module({
  providers: [
    OllamaLlmService,
    LmStudioLlmService,
    {
      provide: LLM_SERVICE,
      useFactory: (
        config: ConfigService,
        ollama: OllamaLlmService,
        lmStudio: LmStudioLlmService,
      ) => {
        const provider = config.get<string>('llm.provider');
        if (provider === 'lmstudio') {
          console.log('LLM provider: LM Studio');
          return lmStudio;
        }
        console.log('LLM provider: Ollama');
        return ollama;
      },
      inject: [ConfigService, OllamaLlmService, LmStudioLlmService],
    },
  ],
  exports: [LLM_SERVICE],
})
export class LlmModule {}

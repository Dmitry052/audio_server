import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { SttModule } from './stt/stt.module';
import { LlmModule } from './llm/llm.module';
import { AudioModule } from './audio/audio.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    SttModule,
    LlmModule,
    AudioModule,
  ],
})
export class AppModule {}

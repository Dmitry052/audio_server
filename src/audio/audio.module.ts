import { Module } from '@nestjs/common';
import { SttModule } from '../stt/stt.module';
import { LlmModule } from '../llm/llm.module';
import { AudioController } from './audio.controller';
import { AudioGateway } from './audio.gateway';
import { AudioPipelineService } from './audio-pipeline.service';

@Module({
  imports: [SttModule, LlmModule],
  controllers: [AudioController],
  providers: [AudioPipelineService, AudioGateway],
})
export class AudioModule {}

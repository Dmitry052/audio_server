import { Module } from '@nestjs/common';
import { SttModule } from '../stt/stt.module';
import { LlmModule } from '../llm/llm.module';
import { QueueModule } from '../queue/queue.module';
import { AudioController } from './audio.controller';
import { AudioGateway } from './audio.gateway';
import { AudioPipelineService } from './audio-pipeline.service';
import { AudioClientsService } from './audio-clients.service';
import { AudioWorker } from './audio.worker';

@Module({
  imports: [SttModule, LlmModule, QueueModule],
  controllers: [AudioController],
  providers: [AudioPipelineService, AudioGateway, AudioClientsService, AudioWorker],
})
export class AudioModule {}

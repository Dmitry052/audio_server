import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';
import { PG_BOSS_TOKEN, AUDIO_QUEUE } from '../queue/constants';
import type { AudioJobData } from '../queue/interfaces/audio-job.interface';
import { AudioPipelineService } from './audio-pipeline.service';
import { AudioClientsService } from './audio-clients.service';
import { extractErrorDetails } from '../common/utils/errors.util';

@Injectable()
export class AudioWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss,
    private readonly pipeline: AudioPipelineService,
    private readonly clients: AudioClientsService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const concurrency = this.config.get<number>('queue.concurrency')!;

    await this.boss.work<AudioJobData>(
      AUDIO_QUEUE,
      { teamSize: concurrency, teamConcurrency: 1 },
      async (job) => {
        const buffer = Buffer.from(job.data.buffer, 'base64');

        try {
          const result =
            job.data.type === 'pcm'
              ? await this.pipeline.processPcm(buffer, job.data.reason ?? 'queue')
              : await this.pipeline.processWav(buffer);

          if (job.data.clientId) {
            this.clients.send(job.data.clientId, result ?? { jobId: job.id, result: null });
          }

          return result;
        } catch (error) {
          console.error(`worker job ${job.id} error:`, extractErrorDetails(error));

          if (job.data.clientId) {
            this.clients.send(job.data.clientId, { error: 'processing failed' });
          }

          // Re-throw so pg-boss marks the job as failed and retries it
          throw error;
        }
      },
    );

    console.log(`Audio worker started (concurrency=${concurrency})`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    console.log('pg-boss stopped');
  }
}

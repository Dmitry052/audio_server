import { Inject, Injectable } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { PG_BOSS_TOKEN, AUDIO_QUEUE } from './constants';
import type { AudioJobData, AudioJobResult } from './interfaces/audio-job.interface';

const SEND_OPTIONS: PgBoss.SendOptions = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 300,
};

@Injectable()
export class QueueService {
  constructor(@Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss) {}

  async enqueue(data: AudioJobData): Promise<string> {
    const jobId = await this.boss.send(AUDIO_QUEUE, data as unknown as object, SEND_OPTIONS);
    if (!jobId) throw new Error('pg-boss rejected the job (deduplication)');
    return jobId;
  }

  async getJobStatus(jobId: string) {
    const job = await this.boss.getJobById(jobId);
    if (!job) return null;

    return {
      jobId: job.id,
      state: job.state,
      result: job.state === 'completed' ? (job.output as AudioJobResult) : undefined,
      error: job.state === 'failed' ? (job.output as { message?: string }) : undefined,
      createdAt: job.createdon,
      completedAt: job.completedon,
    };
  }
}

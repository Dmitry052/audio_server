import { Module } from '@nestjs/common';
import { PgBossProvider } from './pg-boss.provider';
import { QueueService } from './queue.service';
import { PG_BOSS_TOKEN } from './constants';

@Module({
  providers: [PgBossProvider, QueueService],
  exports: [QueueService, PG_BOSS_TOKEN],
})
export class QueueModule {}

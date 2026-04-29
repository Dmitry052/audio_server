import PgBoss from 'pg-boss';
import { ConfigService } from '@nestjs/config';
import { PG_BOSS_TOKEN } from './constants';

export const PgBossProvider = {
  provide: PG_BOSS_TOKEN,
  useFactory: async (config: ConfigService): Promise<PgBoss> => {
    const boss = new PgBoss({
      connectionString: config.get<string>('queue.databaseUrl')!,
      // Keep completed jobs 1 hour, failed jobs 7 days for status polling
      deleteAfterHours: 1,
      archiveFailedAfterSeconds: 604800,
    });

    boss.on('error', (err: Error) => console.error('pg-boss error:', err));
    await boss.start();
    console.log('pg-boss started');

    return boss;
  },
  inject: [ConfigService],
};

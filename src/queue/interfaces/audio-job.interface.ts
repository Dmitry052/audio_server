import type { PipelineResult } from '../../audio/interfaces/pipeline-result.interface';

export interface AudioJobData {
  type: 'pcm' | 'wav';
  buffer: string; // base64-encoded Buffer
  clientId?: string; // WebSocket client ID for async result delivery
  reason?: string;
}

export type AudioJobResult = PipelineResult | null;

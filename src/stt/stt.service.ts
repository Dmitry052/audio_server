import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

@Injectable()
export class SttService {
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('stt.url')!;
  }

  async transcribe(wavBuffer: Buffer): Promise<string> {
    const form = new FormData();
    const wavBytes = new Uint8Array(wavBuffer);
    const filename = `audio-${randomUUID()}.wav`;

    form.append('file', new Blob([wavBytes], { type: 'audio/wav' }), filename);

    const response = await axios.post(this.url, form, {
      headers: { Accept: 'application/json' },
      maxBodyLength: Infinity,
    });

    return String(response.data?.text || '').trim();
  }
}

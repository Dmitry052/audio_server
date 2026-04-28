import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'node:fs/promises';
import { SttService } from '../stt/stt.service';
import { LLM_SERVICE } from '../llm/llm.tokens';
import type { ILlmService } from '../llm/interfaces/llm.interface';
import type { PipelineResult } from './interfaces/pipeline-result.interface';
import { analyzePcmSignal } from '../common/utils/signal.util';
import { pcmToWav } from '../common/utils/wav.util';
import { shouldIgnoreTranscript, hasEnoughContextForSummary } from '../common/utils/transcript.util';
import { extractErrorDetails } from '../common/utils/errors.util';

@Injectable()
export class AudioPipelineService {
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly bitsPerSample: number;
  private readonly minRms: number;
  private readonly debugSaveWav: boolean;
  private readonly debugWavPath: string;

  constructor(
    private readonly stt: SttService,
    @Inject(LLM_SERVICE) private readonly llm: ILlmService,
    config: ConfigService,
  ) {
    this.sampleRate = config.get<number>('audio.sampleRate')!;
    this.channels = config.get<number>('audio.channels')!;
    this.bitsPerSample = config.get<number>('audio.bitsPerSample')!;
    this.minRms = config.get<number>('audio.minRms')!;
    this.debugSaveWav = config.get<boolean>('debug.saveWav')!;
    this.debugWavPath = config.get<string>('debug.wavPath')!;
  }

  async processPcm(pcmBuffer: Buffer, reason: string): Promise<PipelineResult | null> {
    const signal = analyzePcmSignal(pcmBuffer);

    console.log(
      `Audio stats: reason=${reason}, rms=${signal.rms.toFixed(6)}, peak=${signal.peak.toFixed(6)}, pcmBytes=${pcmBuffer.length}`,
    );

    if (signal.rms < this.minRms) {
      console.log(`Skipping STT: signal too quiet (rms=${signal.rms.toFixed(6)} < ${this.minRms})`);
      return null;
    }

    const wavBuffer = pcmToWav(pcmBuffer, this.sampleRate, this.channels, this.bitsPerSample);

    if (this.debugSaveWav) {
      await writeFile(this.debugWavPath, wavBuffer);
      console.log(`Saved debug WAV: ${this.debugWavPath}`);
    }

    console.log(
      `Sending to STT: reason=${reason}, pcmBytes=${pcmBuffer.length}, wavBytes=${wavBuffer.length}`,
    );

    return this.processWav(wavBuffer);
  }

  async processWav(wavBuffer: Buffer): Promise<PipelineResult | null> {
    const text = await this.stt.transcribe(wavBuffer);

    console.log(`STT: ${text || '<empty>'}`);

    if (!text) return null;

    if (shouldIgnoreTranscript(text)) {
      console.log(`Ignoring low-signal transcript: ${text}`);
      return null;
    }

    let summary = '';

    if (hasEnoughContextForSummary(text)) {
      try {
        summary = await this.llm.summarize(text);
      } catch (error) {
        console.error('llm error:', extractErrorDetails(error));
      }
    } else {
      console.log(`Skipping summary for short transcript: ${text}`);
    }

    return { text, summary };
  }
}

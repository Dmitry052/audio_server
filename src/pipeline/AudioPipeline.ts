import { writeFile } from "node:fs/promises";
import { SttService } from "../services/SttService";
import { createLlmService } from "../services/llmFactory";
import type { ILlmService } from "../services/ILlmService";
import { analyzePcmSignal } from "../audio/signal";
import { pcmToWav } from "../audio/wav";
import { shouldIgnoreTranscript, hasEnoughContextForSummary } from "../utils/transcript";
import { extractErrorDetails } from "../utils/errors";
import {
  SAMPLE_RATE,
  CHANNELS,
  BITS_PER_SAMPLE,
  MIN_RMS,
  DEBUG_SAVE_WAV,
  DEBUG_WAV_PATH,
} from "../config";

export interface PipelineResult {
  text: string;
  summary: string;
}

// Orchestrates the full audio processing pipeline:
//   PCM signal analysis → WAV encoding → STT transcription → LLM summary.
// Returns null when the audio or transcript does not meet quality thresholds.
export class AudioPipeline {
  constructor(
    private readonly stt: SttService = new SttService(),
    private readonly llm: ILlmService = createLlmService(),
  ) {}

  // Entry point for WebSocket streaming: receives raw PCM, applies RMS gate, then delegates to processWav.
  async processPcm(pcmBuffer: Buffer, reason: string): Promise<PipelineResult | null> {
    const signal = analyzePcmSignal(pcmBuffer);

    console.log(
      `🔊 Audio stats: reason=${reason}, rms=${signal.rms.toFixed(6)}, peak=${signal.peak.toFixed(6)}, pcmBytes=${pcmBuffer.length}`,
    );

    if (signal.rms < MIN_RMS) {
      console.log(`🤫 Skipping STT: signal too quiet (rms=${signal.rms.toFixed(6)} < ${MIN_RMS})`);
      return null;
    }

    const wavBuffer = pcmToWav(pcmBuffer, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);

    if (DEBUG_SAVE_WAV) {
      await writeFile(DEBUG_WAV_PATH, wavBuffer);
      console.log(`💾 Saved debug WAV: ${DEBUG_WAV_PATH}`);
    }

    console.log(
      `🎙️ Sending to STT: reason=${reason}, pcmBytes=${pcmBuffer.length}, wavBytes=${wavBuffer.length}`,
    );

    return this.processWav(wavBuffer);
  }

  // Entry point for HTTP uploads: receives an already-encoded WAV buffer and runs STT → LLM.
  async processWav(wavBuffer: Buffer): Promise<PipelineResult | null> {
    const text = await this.stt.transcribe(wavBuffer);

    console.log(`🧠 STT: ${text || "<empty>"}`);

    if (!text) return null;

    if (shouldIgnoreTranscript(text)) {
      console.log(`🧹 Ignoring low-signal transcript: ${text}`);
      return null;
    }

    let summary = "";

    if (hasEnoughContextForSummary(text)) {
      try {
        summary = await this.llm.summarize(text);
      } catch (error) {
        console.error("llm error:", extractErrorDetails(error));
      }
    } else {
      console.log(`⏭️ Skipping summary for short transcript: ${text}`);
    }

    return { text, summary };
  }
}

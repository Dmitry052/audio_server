// Central configuration — all environment variables and tuning constants live here.
// Import from this module instead of reading process.env directly elsewhere.

export const WS_PORT = 8080;
export const WS_HOST = "0.0.0.0";

// External service endpoints
export const STT_URL = process.env.STT_URL || "http://localhost:9000/transcribe";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

// Language for the generated summary (e.g. "English", "Russian", "Spanish").
// Defaults to English when not set.
export const SUMMARY_LANGUAGE = process.env.SUMMARY_LANGUAGE || "English";

// Maximum number of sentences in the generated summary.
export const SUMMARY_MAX_SENTENCES = Number(process.env.SUMMARY_MAX_SENTENCES) || 3;

// PCM audio format — must match what the client streams
export const SAMPLE_RATE = 16000;
export const CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;
export const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

// Minimum accumulated PCM before the pipeline is triggered
export const MIN_AUDIO_SECONDS = 5;
export const MIN_PCM_BYTES = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * MIN_AUDIO_SECONDS;

// Quality gates for filtering low-value audio/transcripts
export const MIN_SUMMARY_WORDS = 3;
export const MIN_RMS = 0.003;

// Debug helpers for saving intermediate WAV files to disk
export const DEBUG_SAVE_WAV = process.env.DEBUG_SAVE_WAV === "1";
export const DEBUG_WAV_PATH = process.env.DEBUG_WAV_PATH || "/tmp/audio_server_debug.wav";

// Transcripts that carry no real content and should be discarded immediately
export const IGNORED_TRANSCRIPTS = new Set([
  "you",
  "thank you",
  "thanks",
  "bye",
  "bye-bye",
  "goodbye",
]);

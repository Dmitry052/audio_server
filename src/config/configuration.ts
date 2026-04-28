export default () => ({
  server: {
    port: parseInt(process.env.WS_PORT ?? '8080', 10),
    host: process.env.WS_HOST ?? '0.0.0.0',
  },
  stt: {
    url: process.env.STT_URL ?? 'http://localhost:9000/transcribe',
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'ollama',
    ollama: {
      url: process.env.OLLAMA_URL ?? 'http://localhost:11434/api/chat',
      model: process.env.OLLAMA_MODEL ?? 'llama3',
    },
    lmStudio: {
      url: process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1',
      model: process.env.LM_STUDIO_MODEL ?? 'local-model',
    },
  },
  audio: {
    sampleRate: parseInt(process.env.SAMPLE_RATE ?? '16000', 10),
    channels: parseInt(process.env.CHANNELS ?? '1', 10),
    bitsPerSample: parseInt(process.env.BITS_PER_SAMPLE ?? '16', 10),
    minAudioSeconds: parseFloat(process.env.MIN_AUDIO_SECONDS ?? '5'),
    minRms: parseFloat(process.env.MIN_RMS ?? '0.003'),
  },
  summary: {
    language: process.env.SUMMARY_LANGUAGE ?? 'English',
    maxSentences: parseInt(process.env.SUMMARY_MAX_SENTENCES ?? '3', 10),
  },
  debug: {
    saveWav: process.env.DEBUG_SAVE_WAV === '1',
    wavPath: process.env.DEBUG_WAV_PATH ?? '/tmp/audio_server_debug.wav',
  },
});

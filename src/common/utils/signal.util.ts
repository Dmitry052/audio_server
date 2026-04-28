export function analyzePcmSignal(pcmBuffer: Buffer): { rms: number; peak: number } {
  let sumSquares = 0;
  let peak = 0;
  const sampleCount = Math.floor(pcmBuffer.length / 2);

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) / 32768;
    const absSample = Math.abs(sample);

    sumSquares += sample * sample;
    peak = Math.max(peak, absSample);
  }

  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;

  return { rms, peak };
}

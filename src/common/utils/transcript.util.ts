const IGNORED_TRANSCRIPTS = new Set([
  'you',
  'thank you',
  'thanks',
  'bye',
  'bye-bye',
  'goodbye',
]);

const MIN_SUMMARY_WORDS = 3;

export function shouldIgnoreTranscript(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.!?,;:]+$/g, '').trim();

  if (!normalized) return true;
  if (IGNORED_TRANSCRIPTS.has(normalized)) return true;

  return normalized.split(/\s+/).length === 1 && normalized.length <= 4;
}

export function hasEnoughContextForSummary(text: string): boolean {
  return text.split(/\s+/).filter(Boolean).length >= MIN_SUMMARY_WORDS;
}

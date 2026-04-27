import { IGNORED_TRANSCRIPTS, MIN_SUMMARY_WORDS } from "../config";

// Returns true if the transcript is too trivial to process further
// (empty, a known filler word, or a single very short token).
export function shouldIgnoreTranscript(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.!?,;:]+$/g, "").trim();

  if (!normalized) return true;
  if (IGNORED_TRANSCRIPTS.has(normalized)) return true;

  return normalized.split(/\s+/).length === 1 && normalized.length <= 4;
}

// Returns true when the transcript has enough words to justify an LLM summary pass.
export function hasEnoughContextForSummary(text: string): boolean {
  return text.split(/\s+/).filter(Boolean).length >= MIN_SUMMARY_WORDS;
}

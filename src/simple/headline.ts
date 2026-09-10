const MAX_HEADLINE_LENGTH = 70;

export interface HeadlineCandidates {
  title?: string | null;
  ctaDescription?: string | null;
  ctaLinkDescription?: string | null;
  primaryText?: string | null;
}

function truncateAtWordBoundary(text: string): string {
  if (text.length <= MAX_HEADLINE_LENGTH) return text;
  const truncated = text.slice(0, MAX_HEADLINE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

/**
 * TrendTrack's `content.title` is often null - most ads only have body
 * copy, no separate headline. When that happens, prefer whichever of
 * `ctaDescription`/`ctaLinkDescription` is populated (these are short
 * link-description-style fields, much closer to a real headline than a
 * chunk of the primary text) before falling back to deriving one from the
 * primary text itself.
 */
export function deriveHeadline(candidates: HeadlineCandidates): string {
  for (const candidate of [candidates.title, candidates.ctaDescription, candidates.ctaLinkDescription]) {
    const clean = (candidate ?? "").trim();
    if (clean) return clean;
  }

  const body = (candidates.primaryText ?? "").trim();
  if (!body) return "";

  const firstLine = body.split(/\r?\n/)[0].trim();
  const firstSentenceMatch = firstLine.match(/^.*?[.!?](?=\s|$)/);
  const candidate = firstSentenceMatch ? firstSentenceMatch[0] : firstLine;
  return truncateAtWordBoundary(candidate);
}

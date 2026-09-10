const MAX_HEADLINE_LENGTH = 70;

/**
 * TrendTrack's `content.title` field is "usually null in practice" - most
 * ads only have body copy, no separate headline. When that happens, derive
 * a readable headline from the primary text instead of leaving the column
 * blank: take the first line/sentence, trimmed to a word boundary.
 */
export function deriveHeadline(title: string | null | undefined, primaryText: string | null | undefined): string {
  const cleanTitle = (title ?? "").trim();
  if (cleanTitle) return cleanTitle;

  const body = (primaryText ?? "").trim();
  if (!body) return "";

  const firstLine = body.split(/\r?\n/)[0].trim();
  const firstSentenceMatch = firstLine.match(/^.*?[.!?](?=\s|$)/);
  const candidate = firstSentenceMatch ? firstSentenceMatch[0] : firstLine;

  if (candidate.length <= MAX_HEADLINE_LENGTH) return candidate;

  const truncated = candidate.slice(0, MAX_HEADLINE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

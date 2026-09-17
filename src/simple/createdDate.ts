const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolves the date a creative actually started running, as a YYYY-MM-DD
 * string. Prefers TrendTrack's own observed date (`firstSeenAt` for Meta,
 * `publishedAt` for TikTok - NOT `createdAt`, which is when TrendTrack's own
 * database record was created, not when the ad went live). Falls back to
 * back-calculating from `daysRunning` when that field is missing, and to ""
 * when neither is available.
 */
export function resolveCreatedDate(
  rawDate: string | null | undefined,
  daysRunning: number | null | undefined,
  now: Date = new Date(),
): string {
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (typeof daysRunning === "number" && daysRunning >= 0) {
    const computed = new Date(now.getTime() - daysRunning * MS_PER_DAY);
    return computed.toISOString().slice(0, 10);
  }
  return "";
}

/** Compares two YYYY-MM-DD dates lexicographically (valid for this format). An unknown (empty) date never meets a cutoff. */
export function isOnOrAfter(date: string, cutoff: string): boolean {
  if (!date) return false;
  return date >= cutoff;
}

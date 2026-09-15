export interface CandidateSelection<T> {
  chosen: T[];
  /** True when nothing met minDaysRunning and we fell back to the best currently-active ads instead. */
  usingFallback: boolean;
}

/**
 * Prefers ads that have run at least `minDaysRunning` days (validated
 * winners), but never lets that bar zero out a competitor entirely: if
 * every one of their active ads is younger than that - e.g. they're
 * mid-cycle on fresh creative testing right now - falls back to all of
 * their (already junk-filtered) active ads instead of excluding the
 * competitor from the sheet altogether.
 *
 * Operates directly on whatever candidate objects the caller has (Meta ad
 * summaries, TikTok library items, or a mix of both as a discriminated
 * union) rather than a wrapper type, so the exact per-item type - and any
 * platform discriminant on it - survives selection unchanged.
 */
export function selectCandidates<T extends { daysRunning?: number | null }>(
  candidates: T[],
  minDaysRunning: number,
): CandidateSelection<T> {
  const validated = candidates.filter((c) => (c.daysRunning ?? 0) >= minDaysRunning);
  const usingFallback = validated.length === 0 && candidates.length > 0;
  return { chosen: usingFallback ? candidates : validated, usingFallback };
}

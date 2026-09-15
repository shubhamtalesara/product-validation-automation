import type { TrendtrackAdSummary } from "../trendtrack/types.js";

export interface CandidateSummary<T = TrendtrackAdSummary> {
  advertiserId: string;
  summary: T;
}

export interface CandidateSelection<T = TrendtrackAdSummary> {
  chosen: CandidateSummary<T>[];
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
 */
export function selectCandidateSummaries<T extends Pick<TrendtrackAdSummary, "daysRunning">>(
  nonJunkSummaries: CandidateSummary<T>[],
  minDaysRunning: number,
): CandidateSelection<T> {
  const validated = nonJunkSummaries.filter(({ summary }) => (summary.daysRunning ?? 0) >= minDaysRunning);
  const usingFallback = validated.length === 0 && nonJunkSummaries.length > 0;
  return { chosen: usingFallback ? nonJunkSummaries : validated, usingFallback };
}

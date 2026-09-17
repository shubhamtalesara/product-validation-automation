export interface RecencyCandidate {
  id: string;
  createdDate: string;
  reach: number | null;
}

export interface RecencyQuotaResult {
  /** Ids of the selected ads after any swaps - same length as the input `selected`. */
  selectedIds: string[];
  swappedIn: number;
  /** How many post-cutoff slots the quota still couldn't fill (not enough qualifying candidates existed). */
  shortfall: number;
}

/**
 * Ensures at least `minCount` of the already-selected ads have a
 * `createdDate` on or after `cutoff`. Recency always wins over reach here:
 * when the quota isn't met, the weakest-reach pre-cutoff selected ad is
 * swapped for the best-reach not-yet-selected post-cutoff candidate from
 * `pool` (the full candidate universe, selected or not), one pair at a
 * time, until the quota is met or no more post-cutoff candidates remain.
 * A swap can move a slot from one competitor to another - the quota is a
 * global count across the whole selection, not per-competitor.
 */
export function enforceRecencyQuota(
  selected: RecencyCandidate[],
  pool: RecencyCandidate[],
  cutoff: string,
  minCount: number,
): RecencyQuotaResult {
  const isPostCutoff = (c: RecencyCandidate) => c.createdDate >= cutoff;
  const selectedIds = new Set(selected.map((c) => c.id));

  const postCount = selected.filter(isPostCutoff).length;
  const needed = Math.max(0, minCount - postCount);
  if (needed === 0) {
    return { selectedIds: selected.map((c) => c.id), swappedIn: 0, shortfall: 0 };
  }

  const availableSwapIns = pool
    .filter((c) => isPostCutoff(c) && !selectedIds.has(c.id))
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  const availableSwapOuts = selected
    .filter((c) => !isPostCutoff(c))
    .sort((a, b) => (a.reach ?? 0) - (b.reach ?? 0));

  const swapCount = Math.min(needed, availableSwapIns.length, availableSwapOuts.length);
  const swapIns = availableSwapIns.slice(0, swapCount);
  const outIds = new Set(availableSwapOuts.slice(0, swapCount).map((c) => c.id));

  const result = [...selected.filter((c) => !outIds.has(c.id)), ...swapIns];

  return {
    selectedIds: result.map((c) => c.id),
    swappedIn: swapCount,
    shortfall: needed - swapCount,
  };
}

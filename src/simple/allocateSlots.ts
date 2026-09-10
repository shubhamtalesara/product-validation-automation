export interface SlotAllocationInput {
  name: string;
  /** Live-ad count (or similar activity signal) - a bigger, more active advertiser earns more of the swipe file. */
  weight: number;
  /** How many qualifying ads this competitor actually has to offer - allocation can never exceed this. */
  available: number;
}

/**
 * Splits `totalSlots` across competitors proportionally to `weight`, while
 * guaranteeing every competitor with at least one qualifying ad gets at
 * least one slot, and never allocating more slots to a competitor than they
 * have ads for. Plain largest-remainder apportionment (the same method used
 * to divide parliamentary seats by population) - no ML, just arithmetic, so
 * a single high-reach competitor can never crowd everyone else out to zero.
 */
export function allocateAdSlots(entries: SlotAllocationInput[], totalSlots: number): Map<string, number> {
  const active = entries.filter((e) => e.available > 0);
  const result = new Map<string, number>(active.map((e) => [e.name, 0]));
  if (active.length === 0 || totalSlots <= 0) return result;

  // Phase 1: floor of 1 slot each, highest weight first, in case totalSlots
  // can't even cover one per competitor.
  const byWeightDesc = [...active].sort((a, b) => b.weight - a.weight);
  for (const entry of byWeightDesc) {
    const allocatedSoFar = [...result.values()].reduce((sum, v) => sum + v, 0);
    if (allocatedSoFar >= totalSlots) break;
    result.set(entry.name, 1);
  }

  // Phase 2: distribute whatever's left proportionally to weight, capped by
  // each competitor's remaining capacity, using largest-remainder rounding.
  // Repeats because capacity caps can leave slots unspent in one round.
  for (;;) {
    const allocatedSoFar = [...result.values()].reduce((sum, v) => sum + v, 0);
    const remaining = totalSlots - allocatedSoFar;
    if (remaining <= 0) break;

    const eligible = active.filter((e) => (result.get(e.name) ?? 0) < e.available);
    if (eligible.length === 0) break;

    const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
    const shares = eligible.map((e) => {
      const idealShare = totalWeight > 0 ? (e.weight / totalWeight) * remaining : remaining / eligible.length;
      const capacity = e.available - (result.get(e.name) ?? 0);
      const floorShare = Math.min(Math.floor(idealShare), capacity);
      return { entry: e, floorShare, remainder: idealShare - floorShare, capacity };
    });

    for (const share of shares) {
      if (share.floorShare > 0) {
        result.set(share.entry.name, (result.get(share.entry.name) ?? 0) + share.floorShare);
      }
    }

    let leftover = remaining - shares.reduce((sum, s) => sum + s.floorShare, 0);
    if (leftover <= 0) continue;

    let progressed = false;
    for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
      if (leftover <= 0) break;
      const capLeft = share.capacity - share.floorShare;
      if (capLeft > 0) {
        result.set(share.entry.name, (result.get(share.entry.name) ?? 0) + 1);
        leftover -= 1;
        progressed = true;
      }
    }
    if (!progressed) break; // nobody had spare capacity left - stop rather than loop forever
  }

  return result;
}

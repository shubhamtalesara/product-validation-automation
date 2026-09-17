import { describe, expect, it } from "vitest";
import { enforceRecencyQuota, type RecencyCandidate } from "./recencyQuota.js";

function c(id: string, createdDate: string, reach: number | null): RecencyCandidate {
  return { id, createdDate, reach };
}

describe("enforceRecencyQuota", () => {
  it("makes no changes when the quota is already met", () => {
    const selected = [c("a", "2026-07-01", 100), c("b", "2026-08-01", 50), c("c", "2025-01-01", 10)];
    const result = enforceRecencyQuota(selected, selected, "2026-06-01", 2);
    expect(result).toEqual({ selectedIds: ["a", "b", "c"], swappedIn: 0, shortfall: 0 });
  });

  it("swaps the weakest pre-cutoff ad for the best-reach available post-cutoff candidate", () => {
    const selected = [c("a", "2025-01-01", 500), c("b", "2025-06-01", 10), c("c", "2026-07-01", 5)];
    const pool = [...selected, c("d", "2026-08-01", 40), c("e", "2026-09-01", 20)];
    const result = enforceRecencyQuota(selected, pool, "2026-06-01", 2);
    // Needed 1 more post-cutoff (c already qualifies). Weakest pre-cutoff is "b" (reach 10, not "a" reach 500).
    expect(result.selectedIds.sort()).toEqual(["a", "c", "d"]);
    expect(result.swappedIn).toBe(1);
    expect(result.shortfall).toBe(0);
  });

  it("prefers recency over reach: swaps out a higher-reach pre-cutoff ad only when it's the weakest pre-cutoff one", () => {
    const selected = [c("a", "2025-01-01", 5), c("b", "2026-07-01", 1000)];
    const pool = [...selected, c("c", "2026-08-01", 1)];
    const result = enforceRecencyQuota(selected, pool, "2026-06-01", 2);
    // "a" is the only pre-cutoff ad, so it must be swapped out even though "c" has far lower reach.
    expect(result.selectedIds.sort()).toEqual(["b", "c"]);
    expect(result.swappedIn).toBe(1);
  });

  it("never swaps in a candidate that's already selected", () => {
    const selected = [c("a", "2025-01-01", 5), c("b", "2026-07-01", 10)];
    const pool = [...selected, c("c", "2020-01-01", 999)];
    const result = enforceRecencyQuota(selected, pool, "2026-06-01", 2);
    // No post-cutoff candidate available to swap in besides already-selected "b" - shortfall reported.
    expect(result.selectedIds).toEqual(["a", "b"]);
    expect(result.swappedIn).toBe(0);
    expect(result.shortfall).toBe(1);
  });

  it("reports a shortfall instead of over-swapping when not enough post-cutoff candidates exist anywhere", () => {
    const selected = [c("a", "2025-01-01", 5), c("b", "2024-01-01", 3)];
    const pool = [...selected, c("c", "2026-07-01", 1)];
    const result = enforceRecencyQuota(selected, pool, "2026-06-01", 2);
    expect(result.swappedIn).toBe(1);
    expect(result.shortfall).toBe(1);
    expect(result.selectedIds.sort()).toEqual(["a", "c"]);
  });

  it("never swaps out more pre-cutoff ads than actually exist in the selection", () => {
    const selected = [c("a", "2026-07-01", 1), c("b", "2026-08-01", 2), c("c", "2025-01-01", 3)];
    const pool = [...selected, c("d", "2026-09-01", 100), c("e", "2026-09-02", 200)];
    const result = enforceRecencyQuota(selected, pool, "2026-06-01", 5);
    // Only 1 pre-cutoff ad ("c") exists to swap out, even though 3 more post-cutoff slots are "needed".
    expect(result.swappedIn).toBe(1);
    expect(result.selectedIds).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import { selectCandidateSummaries } from "./selectCandidates.js";

function candidate(advertiserId: string, daysRunning: number | undefined) {
  return { advertiserId, summary: { daysRunning } };
}

describe("selectCandidateSummaries", () => {
  it("keeps only ads meeting the minimum days-running when at least one does", () => {
    const result = selectCandidateSummaries(
      [candidate("a", 45), candidate("a", 5), candidate("a", 30)],
      30,
    );
    expect(result.usingFallback).toBe(false);
    expect(result.chosen.map((c) => c.summary.daysRunning)).toEqual([45, 30]);
  });

  it("falls back to every candidate when none meet the minimum, instead of returning nothing", () => {
    const result = selectCandidateSummaries([candidate("a", 5), candidate("a", 12)], 30);
    expect(result.usingFallback).toBe(true);
    expect(result.chosen).toHaveLength(2);
  });

  it("returns nothing (not a fallback) when there were no candidates at all", () => {
    const result = selectCandidateSummaries([], 30);
    expect(result.usingFallback).toBe(false);
    expect(result.chosen).toEqual([]);
  });

  it("treats a missing daysRunning as too young, not as automatically qualifying", () => {
    const result = selectCandidateSummaries([candidate("a", undefined), candidate("a", 40)], 30);
    expect(result.usingFallback).toBe(false);
    expect(result.chosen.map((c) => c.summary.daysRunning)).toEqual([40]);
  });
});

import { describe, expect, it } from "vitest";
import { selectCandidates } from "./selectCandidates.js";

function candidate(id: string, daysRunning: number | undefined) {
  return { id, daysRunning };
}

describe("selectCandidates", () => {
  it("keeps only ads meeting the minimum days-running when at least one does", () => {
    const result = selectCandidates([candidate("a", 45), candidate("b", 5), candidate("c", 30)], 30);
    expect(result.usingFallback).toBe(false);
    expect(result.chosen.map((c) => c.daysRunning)).toEqual([45, 30]);
  });

  it("falls back to every candidate when none meet the minimum, instead of returning nothing", () => {
    const result = selectCandidates([candidate("a", 5), candidate("b", 12)], 30);
    expect(result.usingFallback).toBe(true);
    expect(result.chosen).toHaveLength(2);
  });

  it("returns nothing (not a fallback) when there were no candidates at all", () => {
    const result = selectCandidates([], 30);
    expect(result.usingFallback).toBe(false);
    expect(result.chosen).toEqual([]);
  });

  it("treats a missing daysRunning as too young, not as automatically qualifying", () => {
    const result = selectCandidates([candidate("a", undefined), candidate("b", 40)], 30);
    expect(result.usingFallback).toBe(false);
    expect(result.chosen.map((c) => c.daysRunning)).toEqual([40]);
  });

  it("preserves extra fields (e.g. a platform discriminant) on the chosen items", () => {
    const items = [
      { id: "a", daysRunning: 5, platform: "Meta" as const },
      { id: "b", daysRunning: 3, platform: "TikTok" as const },
    ];
    const result = selectCandidates(items, 30);
    expect(result.usingFallback).toBe(true);
    expect(result.chosen.map((c) => c.platform)).toEqual(["Meta", "TikTok"]);
  });
});

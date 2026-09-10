import { describe, expect, it } from "vitest";
import { computeValidationScores, selectTopN, type ScoringInput, type ScoringWeights } from "./scoring.js";

const defaultWeights: ScoringWeights = {
  longevity: 0.4,
  reach: 0.3,
  growth: 0.2,
  duplication: 0.1,
};

describe("computeValidationScores", () => {
  it("normalizes all component scores into [0, 1]", () => {
    const items: ScoringInput[] = [
      { id: "a", daysRunning: 10, reach: 1000, reachDelta7d: 50, duplicateCount: 2 },
      { id: "b", daysRunning: 200, reach: 500000, reachDelta7d: -10, duplicateCount: 8 },
      { id: "c", daysRunning: 1, reach: 10, reachDelta7d: 0, duplicateCount: 1 },
    ];
    const scored = computeValidationScores(items, defaultWeights);
    for (const s of scored) {
      expect(s.validationScore).toBeGreaterThanOrEqual(0);
      expect(s.validationScore).toBeLessThanOrEqual(1);
      for (const component of Object.values(s.components)) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles missing metrics without throwing and scores them lowest", () => {
    const items: ScoringInput[] = [
      { id: "complete", daysRunning: 90, reach: 100000, reachDelta7d: 500, duplicateCount: 5 },
      { id: "empty" },
    ];
    const scored = computeValidationScores(items, defaultWeights);
    const empty = scored.find((s) => s.item.id === "empty")!;
    const complete = scored.find((s) => s.item.id === "complete")!;
    expect(empty.validationScore).toBeLessThan(complete.validationScore);
    expect(empty.validationScore).toBe(0);
  });

  it("does not let a single huge reach outlier fully dominate the score", () => {
    const items: ScoringInput[] = [
      // Huge reach, but brand new and no repetition signal.
      { id: "reach-spike", daysRunning: 1, reach: 10_000_000, reachDelta7d: 0, duplicateCount: 1 },
      // Long-running, well-established, moderately reached concept.
      { id: "proven", daysRunning: 180, reach: 100_000, reachDelta7d: 20_000, duplicateCount: 6 },
    ];
    const scored = computeValidationScores(items, defaultWeights);
    const spike = scored.find((s) => s.item.id === "reach-spike")!;
    const proven = scored.find((s) => s.item.id === "proven")!;
    // Reach alone (100x) should not translate into a 100x score gap.
    expect(spike.validationScore).toBeLessThan(proven.validationScore * 3);
  });

  it("applies configurable weights", () => {
    const items: ScoringInput[] = [
      { id: "a", daysRunning: 100, reach: 0, reachDelta7d: 0, duplicateCount: 1 },
      { id: "b", daysRunning: 0, reach: 100, reachDelta7d: 0, duplicateCount: 1 },
    ];
    const longevityOnly: ScoringWeights = { longevity: 1, reach: 0, growth: 0, duplication: 0 };
    const scored = computeValidationScores(items, longevityOnly);
    const a = scored.find((s) => s.item.id === "a")!;
    const b = scored.find((s) => s.item.id === "b")!;
    expect(a.validationScore).toBe(1);
    expect(b.validationScore).toBe(0);
  });

  it("gives all-equal batches a defined score rather than NaN", () => {
    const items: ScoringInput[] = [
      { id: "a", daysRunning: 10, reach: 10, reachDelta7d: 0, duplicateCount: 1 },
      { id: "b", daysRunning: 10, reach: 10, reachDelta7d: 0, duplicateCount: 1 },
    ];
    const scored = computeValidationScores(items, defaultWeights);
    expect(scored.every((s) => Number.isFinite(s.validationScore))).toBe(true);
  });
});

describe("selectTopN", () => {
  it("selects the highest scoring N items", () => {
    const items: ScoringInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      daysRunning: i,
      reach: i * 100,
      reachDelta7d: i,
      duplicateCount: 1,
    }));
    const scored = computeValidationScores(items, defaultWeights);
    const top3 = selectTopN(scored, 3);
    expect(top3).toHaveLength(3);
    expect(top3.map((s) => s.item.id)).toEqual(["item-9", "item-8", "item-7"]);
  });

  it("respects a configurable TOP_AD_COUNT", () => {
    const items: ScoringInput[] = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, reach: i }));
    const scored = computeValidationScores(items, defaultWeights);
    expect(selectTopN(scored, 25)).toHaveLength(25);
  });
});

import { describe, expect, it } from "vitest";
import { computeVerdict, type VerdictThresholds } from "./verdict.js";

const thresholds: VerdictThresholds = {
  minSpend: 50,
  minImpressions: 1000,
  targetCpa: 30,
  targetRoas: 1.5,
  minCtr: 0.01,
};

describe("computeVerdict", () => {
  it("returns INSUFFICIENT_DATA below minimum spend", () => {
    const verdict = computeVerdict(
      { spend: 10, impressions: 5000, clicks: 100, conversions: 5, conversionValue: 500 },
      thresholds,
    );
    expect(verdict).toBe("INSUFFICIENT_DATA");
  });

  it("returns INSUFFICIENT_DATA below minimum impressions even with high spend", () => {
    const verdict = computeVerdict(
      { spend: 500, impressions: 500, clicks: 50, conversions: 10, conversionValue: 1000 },
      thresholds,
    );
    expect(verdict).toBe("INSUFFICIENT_DATA");
  });

  it("returns WINNER when ROAS target and CTR floor are both hit", () => {
    const verdict = computeVerdict(
      { spend: 100, impressions: 10000, clicks: 200, conversions: 5, conversionValue: 300 },
      thresholds,
    );
    expect(verdict).toBe("WINNER");
  });

  it("returns WINNER when CPA target is hit even if ROAS target is not", () => {
    const verdict = computeVerdict(
      { spend: 100, impressions: 10000, clicks: 200, conversions: 5, conversionValue: 100 }, // cpa=20, roas=1
      thresholds,
    );
    expect(verdict).toBe("WINNER");
  });

  it("returns LOSER when CTR is below the quality floor even with good ROAS", () => {
    const verdict = computeVerdict(
      { spend: 100, impressions: 100000, clicks: 50, conversions: 5, conversionValue: 300 }, // ctr=0.0005
      thresholds,
    );
    expect(verdict).toBe("LOSER");
  });

  it("returns LOSER when neither CPA nor ROAS targets are hit", () => {
    const verdict = computeVerdict(
      { spend: 200, impressions: 10000, clicks: 200, conversions: 1, conversionValue: 50 },
      thresholds,
    );
    expect(verdict).toBe("LOSER");
  });

  it("returns LOSER (not insufficient) when there are zero conversions but data is sufficient", () => {
    const verdict = computeVerdict(
      { spend: 100, impressions: 5000, clicks: 100, conversions: 0, conversionValue: 0 },
      thresholds,
    );
    expect(verdict).toBe("LOSER");
  });
});

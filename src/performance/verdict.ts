export interface VerdictThresholds {
  minSpend: number;
  minImpressions: number;
  targetCpa: number;
  targetRoas: number;
  minCtr: number;
}

export interface CumulativePerformance {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export type Verdict = "INSUFFICIENT_DATA" | "WINNER" | "LOSER";

/**
 * Classifies cumulative ad performance against configurable validation
 * thresholds. This is a prioritization/validation verdict for deciding what
 * to scale or kill next - not a definitive profitability judgment.
 *
 * Rules:
 *  - Below MIN_SPEND or MIN_IMPRESSIONS -> INSUFFICIENT_DATA, always.
 *  - Otherwise WINNER if it clears the CTR quality floor AND hits either the
 *    ROAS or CPA target; LOSER otherwise.
 */
export function computeVerdict(
  performance: CumulativePerformance,
  thresholds: VerdictThresholds,
): Verdict {
  if (performance.spend < thresholds.minSpend) return "INSUFFICIENT_DATA";
  if (performance.impressions < thresholds.minImpressions) return "INSUFFICIENT_DATA";

  const ctr = performance.impressions > 0 ? performance.clicks / performance.impressions : 0;
  const cpa = performance.conversions > 0 ? performance.spend / performance.conversions : Infinity;
  const roas = performance.spend > 0 ? performance.conversionValue / performance.spend : 0;

  const meetsQualityFloor = ctr >= thresholds.minCtr;
  const hitsCpaTarget = cpa <= thresholds.targetCpa;
  const hitsRoasTarget = roas >= thresholds.targetRoas;

  if (meetsQualityFloor && (hitsCpaTarget || hitsRoasTarget)) return "WINNER";
  return "LOSER";
}

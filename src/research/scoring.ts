export interface ScoringInput {
  id: string;
  daysRunning?: number | null;
  reach?: number | null;
  reachDelta7d?: number | null;
  duplicateCount?: number | null;
}

export interface ScoringWeights {
  longevity: number;
  reach: number;
  growth: number;
  duplication: number;
}

export interface ScoreComponents {
  longevity: number;
  reach: number;
  growth: number;
  duplication: number;
}

export interface ScoredItem<T extends ScoringInput> {
  item: T;
  validationScore: number;
  components: ScoreComponents;
}

function log1p(x: number): number {
  return Math.log1p(Math.max(0, x));
}

/** Log-dampened but sign-preserving, so reach declines score lower than reach growth. */
function signedLog1p(x: number): number {
  return Math.sign(x) * Math.log1p(Math.abs(x));
}

/**
 * Builds a min-max normalizer over a batch of raw values so a single huge
 * outlier (e.g. reach) cannot dominate the combined score - every dimension
 * is rescaled to [0, 1] relative to the other candidates in the same batch.
 */
function minMaxNormalize(values: number[]): (value: number) => number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return () => 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) {
    return (value) => (value > 0 ? 1 : 0);
  }
  return (value) => (value - min) / (max - min);
}

/**
 * Computes a configurable-weight validation/prioritization score for a
 * batch of candidate creatives. This score reflects how worth-validating a
 * concept is (longevity + reach + growth + repetition signal) - it is NOT a
 * profitability estimate.
 */
export function computeValidationScores<T extends ScoringInput>(
  items: T[],
  weights: ScoringWeights,
): ScoredItem<T>[] {
  const longevityRaw = items.map((item) => log1p(item.daysRunning ?? 0));
  const reachRaw = items.map((item) => log1p(item.reach ?? 0));
  const growthRaw = items.map((item) => signedLog1p(item.reachDelta7d ?? 0));
  const duplicationRaw = items.map((item) => log1p(Math.max(0, (item.duplicateCount ?? 1) - 1)));

  const normLongevity = minMaxNormalize(longevityRaw);
  const normReach = minMaxNormalize(reachRaw);
  const normGrowth = minMaxNormalize(growthRaw);
  const normDuplication = minMaxNormalize(duplicationRaw);

  return items.map((item, index) => {
    const components: ScoreComponents = {
      longevity: normLongevity(longevityRaw[index]),
      reach: normReach(reachRaw[index]),
      growth: normGrowth(growthRaw[index]),
      duplication: normDuplication(duplicationRaw[index]),
    };
    const validationScore =
      weights.longevity * components.longevity +
      weights.reach * components.reach +
      weights.growth * components.growth +
      weights.duplication * components.duplication;
    return { item, validationScore, components };
  });
}

export function selectTopN<T extends ScoringInput>(
  scored: ScoredItem<T>[],
  topN: number,
): ScoredItem<T>[] {
  return [...scored].sort((a, b) => b.validationScore - a.validationScore).slice(0, topN);
}

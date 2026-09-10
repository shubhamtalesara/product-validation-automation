export interface MyLandingPage {
  url: string;
  type: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Canonicalizes near-synonym words so e.g. "PDP" and "Product Page" land on the same tokens. */
const TOKEN_SYNONYMS: Record<string, string> = {
  pdp: "product",
  products: "product",
  home: "home",
  homepage: "home",
  root: "home",
  collection: "collection",
  collections: "collection",
  category: "collection",
  categories: "collection",
  shop: "collection",
};

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter(Boolean)
      .map((token) => TOKEN_SYNONYMS[token] ?? token),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

type Bucket = "product" | "home" | "collection" | "advertorial";

/** Any page type that isn't clearly a product/home/collection page is treated as the catch-all "advertorial" bucket (quiz, VSL, "N reasons why", listicle, etc). */
function bucketOf(type: string): Bucket {
  const tokens = tokenize(type);
  if (tokens.has("product")) return "product";
  if (tokens.has("home")) return "home";
  if (tokens.has("collection")) return "collection";
  return "advertorial";
}

/**
 * Picks whichever of the user's own replicated landing pages best matches a
 * competitor ad's landing page type. Exact match isn't required - this
 * first narrows to pages in the same broad bucket (product/home/collection/
 * advertorial), falling back to the full option list if none share a
 * bucket, then breaks ties within that pool by word overlap with the
 * competitor's own type text. Deterministic, no fuzzy ML matching.
 */
export function matchLandingPage(competitorType: string, options: MyLandingPage[]): MyLandingPage | null {
  if (options.length === 0) return null;

  const competitorBucket = bucketOf(competitorType);
  const competitorTokens = tokenize(competitorType);
  const sameBucket = options.filter((option) => bucketOf(option.type) === competitorBucket);
  const pool = sameBucket.length > 0 ? sameBucket : options;

  let best = pool[0];
  let bestScore = -1;
  for (const option of pool) {
    const score = jaccard(competitorTokens, tokenize(option.type));
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

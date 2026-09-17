export interface ClassificationRule {
  name: string;
  keywords: string[];
}

/**
 * Classifies free-form ad copy against a user-maintained list of
 * keyword-defined categories (used for both "angle" and "offer"
 * classification) - deterministic substring matching, not AI, consistent
 * with every other classification in this pipeline (junk-ad detection,
 * landing-page typing, brand matching).
 *
 * Returns "" (not the fallback) when no rules are configured at all, so
 * the feature is fully opt-in: until you add an `angles`/`offers` list to
 * competitors.simple.json, every ad classifies as "" and nothing changes
 * about ad-set labels or the sheet. Once rules exist, anything that
 * doesn't match one is labeled with `fallback` ("Uncategorized" by
 * default) rather than silently dropped, so you can see what needs better
 * keyword coverage.
 *
 * Rules are checked in list order and the first keyword match wins - list
 * your more specific rules first if two rules could otherwise both match
 * the same ad.
 */
export function classifyText(text: string, rules: ClassificationRule[], fallback = "Uncategorized"): string {
  if (rules.length === 0) return "";
  const normalized = text.toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return rule.name;
    }
  }
  return fallback;
}

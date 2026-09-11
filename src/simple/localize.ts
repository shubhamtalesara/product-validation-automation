function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a regex that matches a brand name regardless of how its words are
 * joined - a config name like "nano-revive" needs to match "NanoRevive"
 * (concatenated, no separator), "Nano Revive" (space), or "Nano-Revive"
 * (hyphen) in real ad copy, since the domain-derived name in
 * competitors.simple.json rarely matches the brand's own stylization
 * exactly. Splits the configured name into word tokens and allows any run
 * of spaces/hyphens/underscores (including none at all) between them.
 */
function brandNamePattern(competitorBrand: string): RegExp {
  const tokens = competitorBrand
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(escapeRegExp);
  return new RegExp(`\\b${tokens.join("[\\s\\-_]*")}(['’]s)?\\b`, "gi");
}

/** Replaces a competitor's brand name (and its possessive form) with your own brand name, case-insensitively, tolerant of spacing/hyphenation differences. */
export function replaceBrandName(text: string, competitorBrand: string, myBrand: string): string {
  const brand = competitorBrand.trim();
  if (!text || !brand || !myBrand.trim()) return text;
  const pattern = brandNamePattern(brand);
  return text.replace(pattern, (_match, possessive?: string) => (possessive ? `${myBrand}${possessive}` : myBrand));
}

/**
 * Replaces an entire inline mention of a competitor's URL - domain plus
 * whatever subpage/path follows it - with your own landing page URL, used
 * verbatim exactly as configured. Swapping only the domain and keeping the
 * competitor's own path (e.g. "yourbrand.com/their-page-slug") would
 * produce a link to a page that doesn't exist on your site; the whole URL
 * has to go, not just the host part of it.
 */
export function replaceLinkMentions(text: string, competitorDomain: string, myLandingPageUrl: string): string {
  const domain = competitorDomain.trim();
  const myUrl = myLandingPageUrl.trim();
  if (!text || !domain || !myUrl) return text;
  const pattern = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${escapeRegExp(domain)}(?:\\/[^\\s"'()<>]*)?`, "gi");
  return text.replace(pattern, (match) => {
    // Keep sentence-ending punctuation stuck to the URL (e.g. "...page.")
    // outside the replacement instead of swallowing it into the link.
    const trailingPunctuation = match.match(/[.,!?;:]+$/)?.[0] ?? "";
    return trailingPunctuation ? `${myUrl}${trailingPunctuation}` : myUrl;
  });
}

export interface LocalizeParams {
  body: string;
  competitorBrandName: string;
  competitorDomain: string;
  myBrandName?: string;
  myLandingPageUrl?: string;
}

/**
 * Produces a version of the competitor's ad copy with their brand name and
 * any inline link mentions swapped for yours, so it reads as your own ad
 * rather than theirs. A no-op wherever the corresponding "my" info hasn't
 * been provided yet (no myBrandName, or no matched landing page).
 *
 * Link mentions are swapped before the brand name: a brand name is very
 * often the domain's own name too (e.g. brand "Avouria" -> domain
 * "avouria.com"), so swapping the brand first would corrupt "avouria.com"
 * into "mybrand.com" mid-word before the link step ever saw the real
 * domain to replace it properly.
 */
export function localizePrimaryText(params: LocalizeParams): string {
  let text = params.body;
  if (params.myLandingPageUrl) {
    text = replaceLinkMentions(text, params.competitorDomain, params.myLandingPageUrl);
  }
  if (params.myBrandName) {
    text = replaceBrandName(text, params.competitorBrandName, params.myBrandName);
  }
  return text;
}

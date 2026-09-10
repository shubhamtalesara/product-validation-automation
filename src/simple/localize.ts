import { extractDomain } from "./domain.js";

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

/** Replaces any inline mention of a competitor's domain (with or without protocol/www) with your own domain. */
export function replaceLinkMentions(text: string, competitorDomain: string, myDomain: string): string {
  const domain = competitorDomain.trim();
  if (!text || !domain || !myDomain.trim()) return text;
  const pattern = new RegExp(`(https?:\\/\\/)?(www\\.)?${escapeRegExp(domain)}`, "gi");
  return text.replace(pattern, (_match, protocol = "", www = "") => `${protocol}${www}${myDomain}`);
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
    try {
      const myDomain = extractDomain(params.myLandingPageUrl);
      text = replaceLinkMentions(text, params.competitorDomain, myDomain);
    } catch {
      // Malformed "my" landing page URL - leave any link mentions untouched.
    }
  }
  if (params.myBrandName) {
    text = replaceBrandName(text, params.competitorBrandName, params.myBrandName);
  }
  return text;
}

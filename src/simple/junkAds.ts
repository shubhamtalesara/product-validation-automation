import { extractDomain } from "./domain.js";
import type { TrendtrackAdContent } from "../trendtrack/types.js";

/**
 * Landing page domains that mean an ad isn't a real product ad at all - a
 * boosted post whose CTA just links back to the advertiser's own Facebook
 * page, or a broken/placeholder link pointing at google.com. Left
 * unfiltered, these would take up slots in the top-N selection instead of
 * real competitor ads.
 */
const JUNK_LANDING_PAGE_DOMAINS = new Set(["facebook.com", "google.com"]);

/** CTA values that only ever accompany a page-engagement ad, never a real conversion ad. */
const JUNK_CTAS = new Set(["LIKE PAGE", "LIKE_PAGE", "FOLLOW PAGE", "FOLLOW_PAGE"]);

export function isJunkAd(content: TrendtrackAdContent | undefined): boolean {
  const cta = (content?.callToAction ?? "").trim().toUpperCase();
  if (JUNK_CTAS.has(cta)) return true;

  const landingPageUrl = content?.landingPageUrl ?? "";
  if (!landingPageUrl) return false;
  try {
    return JUNK_LANDING_PAGE_DOMAINS.has(extractDomain(landingPageUrl));
  } catch {
    return false;
  }
}

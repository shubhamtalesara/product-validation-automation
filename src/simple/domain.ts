/**
 * TrendTrack's public API (per its docs) only exposes ads by `advertiserId` -
 * there's no documented "look up an advertiser by landing page/domain"
 * endpoint. Many ad-intelligence tools key advertisers by their root
 * domain, so as a zero-config default we try the landing page's domain as
 * the advertiserId. If that 404s, `competitors.simple.json` lets a human
 * override it with the exact advertiserId (found via TrendTrack's own
 * dashboard search) - no code changes required either way.
 */
export function extractDomain(landingPageUrl: string): string {
  let url: URL;
  try {
    url = new URL(landingPageUrl);
  } catch {
    try {
      url = new URL(`https://${landingPageUrl}`);
    } catch {
      throw new Error(`"${landingPageUrl}" is not a valid URL or domain`);
    }
  }
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

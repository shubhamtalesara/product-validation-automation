/**
 * Labels a landing page URL with a human-readable "type" so the sheet shows
 * what kind of page an ad sends traffic to, not just the raw URL. Since
 * TrendTrack doesn't classify pages for us, this is a lightweight heuristic
 * over the URL path - a Shopify-style `/products/x` is a plain product page
 * (PDP), and anything else surfaces its slug as-is (e.g. "5-reasons-why"),
 * which is usually already a readable advertorial/quiz/listicle name.
 */
export function classifyLandingPage(landingPageUrl: string): string {
  if (!landingPageUrl) return "";

  let url: URL;
  try {
    url = new URL(landingPageUrl);
  } catch {
    try {
      url = new URL(`https://${landingPageUrl}`);
    } catch {
      return landingPageUrl;
    }
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "Home";

  const lower = segments.map((s) => s.toLowerCase());
  if (lower.includes("products")) return "PDP";
  if (lower.includes("collections")) return "Collection";

  const slug = decodeURIComponent(segments[segments.length - 1])
    .replace(/\.(html?|php)$/i, "")
    .trim();
  return slug || "Home";
}

import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { env } from "../config/env.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import { extractDomain } from "./domain.js";
import type { SimpleCompetitor } from "./config.js";

const logger = createLogger("resolve-advertisers");

/**
 * Walks the /v1/lookup response looking for advertiser identifiers. The
 * exact response shape isn't confirmed yet (TrendTrack's docs site isn't
 * reachable from this environment to verify field-by-field), so this scans
 * broadly: any string value under a key that looks like an advertiser/page
 * id, plus any object that looks like an advertiser record (has `id` plus
 * an advertiser-shaped sibling field such as `facebookPageId` or
 * `liveAdsCount`, matching the shape TrendTrack uses elsewhere in its API).
 */
function extractAdvertiserIds(node: unknown, depth = 0, found: Set<string> = new Set()): string[] {
  if (depth > 5 || node === null || typeof node !== "object") return [...found];

  if (Array.isArray(node)) {
    for (const item of node) extractAdvertiserIds(item, depth + 1, found);
    return [...found];
  }

  const obj = node as Record<string, unknown>;
  const looksLikeAdvertiser =
    typeof obj.id === "string" &&
    ("facebookPageId" in obj || "liveAdsCount" in obj || "type" in obj);
  if (looksLikeAdvertiser) {
    found.add((obj.facebookPageId as string | undefined) ?? (obj.id as string));
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && /advertiser.?id$|facebook.?page.?id$/i.test(key)) {
      found.add(value);
    } else if (typeof value === "object") {
      extractAdvertiserIds(value, depth + 1, found);
    }
  }
  return [...found];
}

export interface ResolvedAdvertisers {
  advertiserIds: string[];
  source: "override" | "lookup" | "domain-guess";
}

/**
 * Resolves the TrendTrack advertiser ID(s) for one configured competitor.
 * Priority: an explicit manual override in competitors.simple.json, then
 * TrendTrack's own /v1/lookup (can return more than one page/advertiser for
 * a single brand), finally a same-as-domain guess as a last resort.
 */
export async function resolveAdvertiserIds(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
): Promise<ResolvedAdvertisers> {
  if (competitor.advertiserId) {
    return { advertiserIds: [competitor.advertiserId], source: "override" };
  }

  const domain = extractDomain(competitor.landingPage);
  try {
    const lookup = await trendtrack.lookup(domain);
    if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
      logger.info(`RAW lookup response for ${competitor.name} (${domain})`, { lookup });
    }
    const ids = extractAdvertiserIds(lookup);
    if (ids.length > 0) {
      logger.info(`Resolved ${ids.length} advertiser ID(s) for ${competitor.name} via lookup`, {
        domain,
        ids,
      });
      return { advertiserIds: ids, source: "lookup" };
    }
    logger.warn(`Lookup for ${competitor.name} returned no advertiser IDs, falling back to domain guess`, {
      domain,
    });
  } catch (err) {
    logger.warn(`Lookup failed for ${competitor.name}, falling back to domain guess`, {
      domain,
      error: toSanitizedMessage(err),
    });
  }

  return { advertiserIds: [domain], source: "domain-guess" };
}

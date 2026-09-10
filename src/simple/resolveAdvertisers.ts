import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import { extractDomain } from "./domain.js";
import type { SimpleCompetitor } from "./config.js";

const logger = createLogger("resolve-advertisers");

export interface ResolvedAdvertisers {
  advertiserIds: string[];
  source: "override" | "lookup" | "domain-guess";
}

function dedupeIds(ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/**
 * Resolves every TrendTrack advertiser (Facebook page) ID for one configured
 * competitor. Priority:
 *  1. An explicit manual override in competitors.simple.json.
 *  2. TrendTrack's own resolution chain: one `/v1/lookup?type=auto` call
 *     finds the shop(s) (and/or advertiser) behind the domain, then
 *     `/v1/shops/{shopId}/advertisers` lists every Facebook page that shop
 *     runs ads from - a brand with two ad accounts gets both pooled
 *     together instead of only the first one. A domain can resolve to more
 *     than one shop candidate (exact + fuzzy matches); every shop candidate
 *     is tried in turn until one actually has linked advertisers, instead
 *     of giving up after the first (often fuzzy/wrong) match comes back
 *     empty. If no shop candidate has any, a direct advertiser match is
 *     used instead.
 *  3. A same-as-domain guess as a last resort.
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
    const matches = await trendtrack.lookup(domain, { type: "auto", limit: 10 });

    const shopIds = dedupeIds(matches.map((m) => m.shop?.id));
    for (const shopId of shopIds) {
      const advertisers = await trendtrack.getShopAdvertisers(shopId);
      const ids = dedupeIds(advertisers.map((a) => a.facebookPageId ?? a.id));
      if (ids.length > 0) {
        logger.info(`Resolved ${ids.length} advertiser page(s) for ${competitor.name} via shop lookup`, {
          domain,
          shopId,
          ids,
        });
        return { advertiserIds: ids, source: "lookup" };
      }
      logger.warn(`Shop ${shopId} for ${competitor.name} has no linked advertisers, trying next candidate`, {
        domain,
      });
    }

    const advertiserIds = dedupeIds(matches.map((m) => m.advertiser?.facebookPageId ?? m.advertiser?.id));
    if (advertiserIds.length > 0) {
      logger.info(`Resolved ${advertiserIds.length} advertiser page(s) for ${competitor.name} via direct lookup`, {
        domain,
        ids: advertiserIds,
      });
      return { advertiserIds, source: "lookup" };
    }

    logger.warn(`Lookup for ${competitor.name} found no shop or advertiser, falling back to domain guess`, {
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

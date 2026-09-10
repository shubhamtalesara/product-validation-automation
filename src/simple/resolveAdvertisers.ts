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

/**
 * Resolves every TrendTrack advertiser (Facebook page) ID for one configured
 * competitor. Priority:
 *  1. An explicit manual override in competitors.simple.json.
 *  2. TrendTrack's own resolution chain: `/v1/lookup?type=shop` finds the
 *     shop behind the domain, then `/v1/shops/{shopId}/advertisers` lists
 *     every Facebook page that shop runs ads from - a brand with two ad
 *     accounts gets both pooled together instead of only the first one.
 *  3. `/v1/lookup?type=advertiser` as a fallback when the domain isn't
 *     indexed as a shop but does resolve directly to an advertiser page.
 *  4. A same-as-domain guess as a last resort.
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
    const shopMatches = await trendtrack.lookup(domain, { type: "shop", limit: 5 });
    const shopId = shopMatches.find((m) => m.shop?.id)?.shop?.id;
    if (shopId) {
      const advertisers = await trendtrack.getShopAdvertisers(shopId);
      const ids = [
        ...new Set(advertisers.map((a) => a.facebookPageId ?? a.id).filter((id): id is string => Boolean(id))),
      ];
      if (ids.length > 0) {
        logger.info(`Resolved ${ids.length} advertiser page(s) for ${competitor.name} via shop lookup`, {
          domain,
          shopId,
          ids,
        });
        return { advertiserIds: ids, source: "lookup" };
      }
      logger.warn(`Shop ${shopId} for ${competitor.name} has no linked advertisers, trying direct lookup`, {
        domain,
      });
    }

    const advertiserMatches = await trendtrack.lookup(domain, { type: "advertiser", limit: 5 });
    const advertiserIds = [
      ...new Set(
        advertiserMatches
          .map((m) => m.advertiser?.facebookPageId ?? m.advertiser?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
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

import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import { extractDomain } from "./domain.js";
import type { SimpleCompetitor } from "./config.js";

const logger = createLogger("resolve-advertisers");

export interface ResolvedCompetitorSources {
  advertiserIds: string[];
  source: "override" | "lookup" | "domain-guess";
  /**
   * TrendTrack shop id(s) behind this competitor's domain, for the separate
   * TikTok library fetch (`GET /v1/shops/{shopId}/tiktok/library`). Empty
   * when lookup found no shop, or failed outright.
   */
  shopIds: string[];
}

function dedupeIds(ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function lookupShopIds(trendtrack: TrendtrackClient, competitor: SimpleCompetitor, domain: string): Promise<string[]> {
  try {
    const matches = await trendtrack.lookup(domain, { type: "auto", limit: 10 });
    return dedupeIds(matches.map((m) => m.shop?.id));
  } catch (err) {
    logger.warn(`Shop lookup failed for ${competitor.name}, skipping TikTok fetch for this competitor`, {
      domain,
      error: toSanitizedMessage(err),
    });
    return [];
  }
}

/**
 * Resolves everywhere a competitor's ads can be found on TrendTrack: every
 * Meta advertiser (Facebook page) ID, and every shop ID (for the separate
 * TikTok library fetch) - both derived from the SAME `/v1/lookup?type=auto`
 * call, so a slow or timed-out lookup only costs once per competitor, not
 * twice (Meta and TikTok used to each make their own lookup call).
 *
 * Meta resolution priority:
 *  1. An explicit manual override in competitors.simple.json (this still
 *     makes its own lookup call for shopIds, so TikTok keeps resolving
 *     normally even when Meta's own advertiser ID is pinned manually).
 *  2. TrendTrack's own resolution chain: the lookup finds the shop(s)
 *     (and/or advertiser) behind the domain, then
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
export async function resolveCompetitorSources(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
): Promise<ResolvedCompetitorSources> {
  const domain = extractDomain(competitor.landingPage);

  if (competitor.advertiserId) {
    const shopIds = await lookupShopIds(trendtrack, competitor, domain);
    return { advertiserIds: [competitor.advertiserId], source: "override", shopIds };
  }

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
        return { advertiserIds: ids, source: "lookup", shopIds };
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
      return { advertiserIds, source: "lookup", shopIds };
    }

    logger.warn(`Lookup for ${competitor.name} found no shop or advertiser, falling back to domain guess`, {
      domain,
    });
    return { advertiserIds: [domain], source: "domain-guess", shopIds };
  } catch (err) {
    logger.warn(`Lookup failed for ${competitor.name}, falling back to domain guess`, {
      domain,
      error: toSanitizedMessage(err),
    });
    return { advertiserIds: [domain], source: "domain-guess", shopIds: [] };
  }
}

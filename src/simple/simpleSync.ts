import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { env } from "../config/env.js";
import { TrendtrackClient } from "../trendtrack/client.js";
import type { TiktokLibraryItem, TrendtrackAdSummary } from "../trendtrack/types.js";
import { dedupeCreatives, type DedupCandidate, type DedupGroup } from "../research/dedupe.js";
import { SheetsClient, type SheetsCredentials } from "../sheets/sheetsClient.js";
import { loadSimpleConfig, type MyLandingPage, type SimpleCompetitor } from "./config.js";
import { resolveCompetitorSources } from "./resolveAdvertisers.js";
import { classifyLandingPage } from "./landingPageType.js";
import { deriveHeadline } from "./headline.js";
import { isJunkAd } from "./junkAds.js";
import { clubIntoAdSets } from "./adSets.js";
import { matchLandingPage } from "./matchLandingPage.js";
import { localizePrimaryText } from "./localize.js";
import { allocateAdSlots } from "./allocateSlots.js";
import { selectCandidates } from "./selectCandidates.js";
import { extractDomain } from "./domain.js";
import { SIMPLE_SHEET_COLUMNS, simpleRowToSheetValues, type SimpleAdRow } from "./simpleRow.js";

const logger = createLogger("simple-sync");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_JSON_PATH = resolve(projectRoot, "docs/data.json");

/**
 * A creative must have been running at least this many days to count as a
 * validated winner rather than a fresh test TrendTrack just started
 * tracking. This is a preference, not a hard requirement: a competitor who
 * is mid-cycle on fresh creative testing right now can legitimately have
 * zero ads this old on every one of their pages, and excluding them
 * entirely in that case would silently drop a whole competitor from the
 * sheet instead of just deprioritizing their newer ads. See the fallback
 * in gatherCandidateGroups.
 */
const MIN_DAYS_RUNNING = 30;

function metaReach(summary: TrendtrackAdSummary): number | null {
  return summary.metrics?.reach ?? null;
}

/** TikTok has no "reach" metric - views is its closest equivalent for sorting/ranking purposes. */
function tiktokReach(item: TiktokLibraryItem): number | null {
  return item.metrics?.views ?? null;
}

interface CompetitorResult {
  name: string;
  landingPage: string;
  advertiserIds: string[];
  error: string | null;
  ads: SimpleAdRow[];
}

/**
 * A candidate creative from either platform, tagged so downstream code
 * (enrichment, ad-set clubbing) can branch on which one it came from. Meta
 * and TikTok are separate namespaces in TrendTrack's API (see
 * src/trendtrack/types.ts) with no shared object shape beyond `daysRunning`,
 * so the raw source object is kept as-is rather than forced into one shape.
 */
type CompetitorCandidate = DedupCandidate &
  ({ platform: "Meta"; ad: TrendtrackAdSummary } | { platform: "TikTok"; item: TiktokLibraryItem });

interface CandidateGathering {
  competitor: SimpleCompetitor;
  advertiserIds: string[];
  groups: DedupGroup<CompetitorCandidate>[];
  /** Total live-ad count across the competitor's page(s)/shop(s) - how much weight they get in slot allocation. */
  weight: number;
  error: string | null;
}

/** Fetches and tags every qualifying-pool Meta ad for one competitor's resolved advertiser pages. */
async function gatherMetaCandidates(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  advertiserIds: string[],
  poolSize: number,
): Promise<{ candidates: CompetitorCandidate[]; liveAdsByPage: Map<string, number>; error: string | null }> {
  const candidates: CompetitorCandidate[] = [];
  const liveAdsByPage = new Map<string, number>();

  try {
    for (const advertiserId of advertiserIds) {
      const summaries: TrendtrackAdSummary[] = [];
      for await (const ad of trendtrack.paginateAdvertiserAds(
        advertiserId,
        { status: "active", sortBy: "reach", order: "desc" },
        poolSize,
      )) {
        summaries.push(ad);
      }
      const liveAdsCount = summaries.find((s) => typeof s.advertiser?.liveAdsCount === "number")?.advertiser
        ?.liveAdsCount;
      if (typeof liveAdsCount === "number") liveAdsByPage.set(`meta:${advertiserId}`, liveAdsCount);

      const tooYoung = summaries.filter((s) => (s.daysRunning ?? 0) < MIN_DAYS_RUNNING);
      const junk = summaries.filter((s) => isJunkAd(s.content));
      const qualifying = summaries.filter(
        (s) => (s.daysRunning ?? 0) >= MIN_DAYS_RUNNING && !isJunkAd(s.content),
      );
      const daysRunningValues = summaries.map((s) => s.daysRunning).filter((d): d is number => typeof d === "number");
      logger.info(
        `Retrieved ${summaries.length} active Meta ads for ${competitor.name} (${qualifying.length} qualify: 30+ days running, not a page-engagement/junk ad)`,
        {
          advertiserId,
          excludedTooYoung: tooYoung.length,
          excludedJunk: junk.length,
          daysRunningMissing: summaries.length - daysRunningValues.length,
          daysRunningMin: daysRunningValues.length ? Math.min(...daysRunningValues) : null,
          daysRunningMax: daysRunningValues.length ? Math.max(...daysRunningValues) : null,
        },
      );
      if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
        const distinctCollationIds = new Set(summaries.map((s) => s.collationId ?? null)).size;
        logger.info(`RAW Meta list summary sample for ${competitor.name}`, {
          advertiserId,
          distinctCollationIds,
          totalSummaries: summaries.length,
          firstThree: summaries.slice(0, 3),
        });
      }
      for (const s of summaries) {
        if (isJunkAd(s.content)) continue;
        candidates.push({
          platform: "Meta",
          id: s.id,
          collationId: s.collationId ?? null,
          advertiserId,
          reach: metaReach(s),
          daysRunning: s.daysRunning ?? null,
          ad: s,
        });
      }
    }
    return { candidates, liveAdsByPage, error: null };
  } catch (err) {
    const message = toSanitizedMessage(err);
    logger.error(`Could not fetch Meta ads for ${competitor.name}`, { advertiserIds, error: message });
    return {
      candidates,
      liveAdsByPage,
      error: `Could not find TrendTrack Meta ads for ${JSON.stringify(advertiserIds)} (from ${competitor.landingPage}). If these aren't the right TrendTrack advertiser IDs, look them up in TrendTrack's dashboard and add "advertiserId" for this competitor in competitors.simple.json. (${message})`,
    };
  }
}

/** Fetches every qualifying-pool TikTok ad for one competitor's resolved shop(s). Independent of the Meta fetch - a failure here never blocks Meta results, and vice versa. */
async function gatherTiktokCandidates(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  shopIds: string[],
  poolSize: number,
): Promise<{ candidates: CompetitorCandidate[]; liveAdsByPage: Map<string, number> }> {
  const candidates: CompetitorCandidate[] = [];
  const liveAdsByPage = new Map<string, number>();

  if (shopIds.length === 0) return { candidates, liveAdsByPage };

  logger.info(`Fetching TikTok ads for ${competitor.name}`, { shopIds });
  for (const shopId of shopIds) {
    try {
      const items: TiktokLibraryItem[] = [];
      for await (const item of trendtrack.paginateShopTiktokLibrary(
        shopId,
        { status: "active", type: "ad", sortBy: "views", order: "desc" },
        poolSize,
      )) {
        items.push(item);
      }
      // No equivalent of Meta's advertiser.liveAdsCount field is exposed for
      // a TikTok shop - the count of active ads actually retrieved (capped
      // at poolSize) is used as a proxy for slot-allocation weight instead.
      liveAdsByPage.set(`tiktok:${shopId}`, items.length);

      const tooYoung = items.filter((i) => (i.daysRunning ?? 0) < MIN_DAYS_RUNNING);
      const daysRunningValues = items.map((i) => i.daysRunning).filter((d): d is number => typeof d === "number");
      logger.info(
        `Retrieved ${items.length} active TikTok ads for ${competitor.name} (${items.length - tooYoung.length} qualify: 30+ days running)`,
        {
          shopId,
          excludedTooYoung: tooYoung.length,
          daysRunningMin: daysRunningValues.length ? Math.min(...daysRunningValues) : null,
          daysRunningMax: daysRunningValues.length ? Math.max(...daysRunningValues) : null,
        },
      );
      if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
        logger.info(`RAW TikTok library sample for ${competitor.name}`, {
          shopId,
          totalItems: items.length,
          firstThree: items.slice(0, 3),
        });
      }
      for (const item of items) {
        candidates.push({
          platform: "TikTok",
          id: item.id,
          collationId: null,
          advertiserId: shopId,
          reach: tiktokReach(item),
          daysRunning: item.daysRunning ?? null,
          item,
        });
      }
    } catch (err) {
      logger.warn(`Could not fetch TikTok ads for ${competitor.name} from shop ${shopId}`, {
        error: toSanitizedMessage(err),
      });
    }
  }
  return { candidates, liveAdsByPage };
}

/**
 * Gathers and dedupes active ads for one competitor from both Meta and
 * TikTok (TikTok fetch skipped entirely when SIMPLE_FETCH_TIKTOK=false), and
 * groups them into creative-concept groups (cheap: list endpoints only, no
 * per-ad detail calls yet). Always drops Meta page-engagement/junk ads.
 * Prefers ads that have run at least MIN_DAYS_RUNNING days across BOTH
 * platforms combined, but falls back to the competitor's best
 * currently-active ads when none of theirs are that old yet, so a
 * competitor never gets shut out of the sheet just because they're mid-cycle
 * on fresh creative testing. Also computes this competitor's total live-ad
 * count (summed once per distinct page/shop) for weighted slot allocation.
 */
async function gatherCandidateGroups(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
): Promise<CandidateGathering> {
  const poolSize = Math.max(env.SIMPLE_TOTAL_AD_COUNT * 3, 50);

  // One resolution call covers both platforms - Meta's advertiserIds and
  // TikTok's shopIds both come off the same /v1/lookup, so a slow lookup
  // only costs once per competitor rather than once per platform.
  const resolved = await resolveCompetitorSources(trendtrack, competitor);
  logger.info(`Fetching Meta ads for ${competitor.name}`, {
    advertiserIds: resolved.advertiserIds,
    source: resolved.source,
  });

  const meta = await gatherMetaCandidates(trendtrack, competitor, resolved.advertiserIds, poolSize);
  const tiktok = env.SIMPLE_FETCH_TIKTOK
    ? await gatherTiktokCandidates(trendtrack, competitor, resolved.shopIds, poolSize)
    : { candidates: [] as CompetitorCandidate[], liveAdsByPage: new Map<string, number>() };

  const allCandidates = [...meta.candidates, ...tiktok.candidates];
  const { chosen, usingFallback } = selectCandidates(allCandidates, MIN_DAYS_RUNNING);
  if (usingFallback) {
    logger.warn(
      `No ads for ${competitor.name} have run ${MIN_DAYS_RUNNING}+ days yet - falling back to their best currently active ads instead of excluding this competitor`,
      { candidateCount: chosen.length },
    );
  }

  const groups = dedupeCreatives(chosen);
  const liveAdsByPage = new Map([...meta.liveAdsByPage, ...tiktok.liveAdsByPage]);
  const weight = [...liveAdsByPage.values()].reduce((sum, n) => sum + n, 0);
  logger.info(`Deduplicated to ${groups.length} unique creative concepts for ${competitor.name}`, { weight });

  // Only surface the Meta fetch error when it left this competitor with
  // nothing at all - if TikTok still turned up ads, there's no failure to
  // report, just a partial result.
  const error = groups.length === 0 ? meta.error : null;

  return { competitor, advertiserIds: resolved.advertiserIds, groups, weight, error };
}

interface EnrichedContent {
  pageName: string;
  headline: string;
  body: string;
  cta: string;
  landingPageUrl: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  trendtrackPreviewUrl: string;
  reach: number | null;
  daysRunning: number | null;
  rank: number | null;
}

/** Fetches full Meta ad detail + media + a TrendTrack preview link. Returns null if the ad turns out to be junk on closer inspection. */
async function enrichMetaAd(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  adId: string,
  candidate: CompetitorCandidate & { platform: "Meta" },
): Promise<EnrichedContent | null> {
  const detail = await trendtrack.getAdDetail(adId);
  if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
    logger.info(`RAW Meta ad detail for ${adId}`, { detail });
  }

  if (isJunkAd(detail.content)) {
    logger.info(`Skipping ad ${adId} for ${competitor.name} - looks like a page-engagement/junk ad, not a real ad`);
    return null;
  }

  // The list summary and the single-ad detail response are documented as
  // the same shape, but TrendTrack's own fields sometimes carry more (or
  // less) content on one than the other for the same ad - fall back to
  // the summary's content wherever the detail response left a field null.
  const summaryContent = candidate.ad.content;
  const title = detail.content?.title ?? summaryContent?.title;
  const ctaDescription = detail.content?.ctaDescription ?? summaryContent?.ctaDescription;
  const ctaLinkDescription = detail.content?.ctaLinkDescription ?? summaryContent?.ctaLinkDescription;
  const body = detail.content?.body ?? summaryContent?.body ?? "";

  let mediaUrl = detail.media?.mediaUrl ?? "";
  let thumbnailUrl = detail.media?.thumbnailUrl ?? "";
  try {
    const media = await trendtrack.getAdMediaUrl(adId);
    if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
      logger.info(`RAW media response for ${adId}`, { media });
    }
    mediaUrl = media.mediaUrl ?? media.url ?? mediaUrl;
    thumbnailUrl = media.thumbnailUrl ?? thumbnailUrl;
  } catch (err) {
    logger.warn(`Could not resolve media URL for ${adId}, using detail fallback`, {
      error: toSanitizedMessage(err),
    });
  }

  let trendtrackPreviewUrl = "";
  try {
    const share = await trendtrack.createAdShare(adId);
    trendtrackPreviewUrl = share.shareUrl ?? "";
  } catch (err) {
    logger.warn(`Could not create a TrendTrack preview link for ${adId}`, {
      error: toSanitizedMessage(err),
    });
  }

  return {
    pageName: detail.advertiser?.name ?? candidate.ad.advertiser?.name ?? "",
    headline: deriveHeadline({ title, ctaDescription, ctaLinkDescription, primaryText: body }),
    body,
    cta: detail.content?.callToAction ?? summaryContent?.callToAction ?? "",
    landingPageUrl: detail.content?.landingPageUrl ?? summaryContent?.landingPageUrl ?? "",
    mediaType: detail.media?.type ?? "",
    mediaUrl,
    thumbnailUrl,
    trendtrackPreviewUrl,
    reach: detail.metrics?.reach ?? metaReach(candidate.ad),
    daysRunning: detail.daysRunning ?? candidate.daysRunning ?? null,
    rank: detail.rank?.currentRank ?? detail.rank?.positionInPage ?? null,
  };
}

/**
 * Fetches full TikTok item detail. TikTok's API embeds media and the
 * public video link directly on the item - no separate media-url or
 * share-link calls exist for this namespace like Meta has.
 *
 * TikTok items don't carry a full per-ad destination URL (no landingPageUrl
 * field like Meta's content object) - only a bare domain, and only on the
 * detail response. When that domain differs from the competitor's
 * configured landing page (a multi-product competitor), it's used directly;
 * otherwise the full configured landing page is reused so classification
 * has a real path to work with instead of a bare domain.
 */
async function enrichTiktokAd(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  adId: string,
  candidate: CompetitorCandidate & { platform: "TikTok" },
): Promise<EnrichedContent> {
  const detail = await trendtrack.getTiktokLibraryItem(adId);
  if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
    logger.info(`RAW TikTok item detail for ${adId}`, { detail });
  }

  const summaryContent = candidate.item.content;
  const body = detail.content?.description ?? summaryContent?.description ?? "";

  const tiktokDomain = detail.source?.domain || detail.shop?.domain || candidate.item.shop?.domain || "";
  let competitorConfiguredDomain = "";
  try {
    competitorConfiguredDomain = extractDomain(competitor.landingPage);
  } catch {
    // Leave blank - the landingPageUrl fallback below still works either way.
  }
  const landingPageUrl =
    tiktokDomain && tiktokDomain !== competitorConfiguredDomain ? `https://${tiktokDomain}` : competitor.landingPage;

  return {
    pageName: detail.profile?.name ?? detail.profile?.handle ?? candidate.item.profile?.name ?? candidate.item.profile?.handle ?? "",
    headline: deriveHeadline({ primaryText: body }),
    body,
    cta: "",
    landingPageUrl,
    mediaType: detail.media?.type ?? candidate.item.media?.type ?? "",
    mediaUrl: detail.media?.mediaUrl ?? detail.media?.videoUrl ?? candidate.item.media?.mediaUrl ?? candidate.item.media?.videoUrl ?? "",
    thumbnailUrl: detail.media?.thumbnailUrl ?? candidate.item.media?.thumbnailUrl ?? "",
    trendtrackPreviewUrl: detail.links?.tiktokUrl ?? "",
    reach: detail.metrics?.views ?? tiktokReach(candidate.item),
    daysRunning: detail.daysRunning ?? candidate.daysRunning ?? null,
    rank: detail.metrics?.rank ?? null,
  };
}

/** Fetches full ad detail for one selected creative concept, on whichever platform it came from, then localizes and shapes it into a sheet row. */
async function enrichAd(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  group: DedupGroup<CompetitorCandidate>,
  defaultBrandName: string | undefined,
  myLandingPages: MyLandingPage[],
): Promise<SimpleAdRow | null> {
  const candidate = group.representative;
  const adId = candidate.id;

  try {
    const enriched =
      candidate.platform === "Meta"
        ? await enrichMetaAd(trendtrack, competitor, adId, candidate)
        : await enrichTiktokAd(trendtrack, competitor, adId, candidate);
    if (!enriched) return null;

    const landingPageType = classifyLandingPage(enriched.landingPageUrl);
    const myMatch = matchLandingPage(landingPageType, myLandingPages);
    let competitorDomain = "";
    try {
      competitorDomain = extractDomain(enriched.landingPageUrl || competitor.landingPage);
    } catch {
      // Leave blank - localizePrimaryText treats an empty domain as "nothing to swap".
    }
    const localizedPrimaryText = localizePrimaryText({
      body: enriched.body,
      competitorBrandName: competitor.name,
      competitorDomain,
      // A matched landing page's own brand name wins (myLandingPages can span
      // more than one of your own brands); otherwise fall back to myBrand.name.
      myBrandName: myMatch?.brandName ?? defaultBrandName,
      myLandingPageUrl: myMatch?.url,
    });

    return {
      competitor: competitor.name,
      competitorLandingPage: competitor.landingPage,
      platform: candidate.platform,
      pageName: enriched.pageName,
      adSet: "",
      trendtrackAdId: adId,
      trendtrackPreviewUrl: enriched.trendtrackPreviewUrl,
      headline: enriched.headline,
      primaryText: enriched.body,
      localizedPrimaryText,
      cta: enriched.cta,
      landingPageUrl: enriched.landingPageUrl,
      landingPageType,
      myLandingPageUrl: myMatch?.url ?? "",
      myLandingPageType: myMatch?.type ?? "",
      mediaType: enriched.mediaType,
      mediaUrl: enriched.mediaUrl,
      thumbnailUrl: enriched.thumbnailUrl,
      reach: enriched.reach,
      daysRunning: enriched.daysRunning,
      rank: enriched.rank,
    };
  } catch (err) {
    logger.error(`Failed to fetch detail for ad ${adId}, skipping`, {
      error: toSanitizedMessage(err),
    });
    return null;
  }
}

async function writeToSheet(results: CompetitorResult[]): Promise<void> {
  const credentials: SheetsCredentials | undefined = env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? { kind: "service-account", json: env.GOOGLE_SERVICE_ACCOUNT_JSON }
    : env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN
      ? {
          kind: "oauth",
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
        }
      : undefined;

  if (!credentials || !env.GOOGLE_SHEET_ID) {
    logger.warn(
      "Google Sheets not configured (set GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_SHEET_ID) - skipping sheet write",
    );
    return;
  }

  const sheets = new SheetsClient({
    credentials,
    spreadsheetId: env.GOOGLE_SHEET_ID,
    sheetTab: env.SIMPLE_SHEET_TAB,
  });

  const rows: (string | number)[][] = [[...SIMPLE_SHEET_COLUMNS]];
  for (const result of results) {
    for (const ad of result.ads.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))) {
      rows.push(simpleRowToSheetValues(ad));
    }
  }

  await sheets.replaceAll(rows);
  logger.info(`Synced ${rows.length - 1} rows to Google Sheet tab "${env.SIMPLE_SHEET_TAB}"`);
}

async function writeDataJson(results: CompetitorResult[]): Promise<void> {
  const payload = {
    generatedAt: new Date().toISOString(),
    sheetUrl: env.GOOGLE_SHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID}/edit`
      : null,
    competitors: results.map((r) => ({
      name: r.name,
      landingPage: r.landingPage,
      error: r.error,
      ads: r.ads.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)),
    })),
  };
  await mkdir(dirname(DATA_JSON_PATH), { recursive: true });
  await writeFile(DATA_JSON_PATH, JSON.stringify(payload, null, 2));
  logger.info(`Wrote dashboard data to ${DATA_JSON_PATH}`);
}

/**
 * Selects `SIMPLE_TOTAL_AD_COUNT` ads total, split across competitors
 * proportionally to each one's live-ad count (see allocateAdSlots) rather
 * than a single global top-N by reach - a competitor running far more ads
 * than the others earns more slots, but everyone with at least one
 * qualifying ad gets at least one, so nobody gets shut out by a single
 * high-reach competitor.
 */
export async function runSimpleSync(): Promise<CompetitorResult[]> {
  logger.info("Starting simple competitor ad sync", { fetchTiktok: env.SIMPLE_FETCH_TIKTOK });
  const { myBrand, myLandingPages, competitors } = await loadSimpleConfig();
  const trendtrack = new TrendtrackClient({
    apiKey: env.TRENDTRACK_API_KEY,
    baseUrl: env.TRENDTRACK_BASE_URL,
  });

  const gatherings = await Promise.all(
    competitors.map((competitor) => gatherCandidateGroups(trendtrack, competitor)),
  );

  const slotsByCompetitor = allocateAdSlots(
    gatherings.map((g) => ({ name: g.competitor.name, weight: g.weight, available: g.groups.length })),
    env.SIMPLE_TOTAL_AD_COUNT,
  );
  logger.info("Allocated ad slots per competitor by live-ad weight", {
    allocation: Object.fromEntries(slotsByCompetitor),
  });

  const selected = gatherings.flatMap((gathering) => {
    const slots = slotsByCompetitor.get(gathering.competitor.name) ?? 0;
    return [...gathering.groups]
      .sort((a, b) => (b.representative.reach ?? 0) - (a.representative.reach ?? 0))
      .slice(0, slots)
      .map((group) => ({ gathering, group }));
  });

  const resultsByCompetitor = new Map<string, CompetitorResult>(
    gatherings.map((g) => [
      g.competitor.name,
      {
        name: g.competitor.name,
        landingPage: g.competitor.landingPage,
        advertiserIds: g.advertiserIds,
        error: g.error,
        ads: [],
      },
    ]),
  );

  for (const { gathering, group } of selected) {
    const ad = await enrichAd(trendtrack, gathering.competitor, group, myBrand?.name, myLandingPages);
    if (ad) resultsByCompetitor.get(gathering.competitor.name)!.ads.push(ad);
  }

  const results = [...resultsByCompetitor.values()];

  // Club the selected ads into ready-to-launch ad sets (max 5 ads, never
  // mixing video with static or Meta with TikTok within one set) before
  // writing anything out.
  const allSelectedAds = results.flatMap((r) => r.ads).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  for (const adSetGroup of clubIntoAdSets(allSelectedAds)) {
    for (const ad of adSetGroup.ads) ad.adSet = adSetGroup.label;
  }

  await writeDataJson(results);
  await writeToSheet(results);

  const totalAds = results.reduce((sum, r) => sum + r.ads.length, 0);
  const errors = results.filter((r) => r.error);
  logger.info(`Complete: ${totalAds} ads across ${results.length} competitors (${errors.length} errors)`);
  if (errors.length > 0) {
    for (const e of errors) logger.error(`Competitor "${e.name}" failed`, { reason: e.error });
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runSimpleSync()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Simple sync failed", { error: toSanitizedMessage(err) });
      process.exit(1);
    });
}

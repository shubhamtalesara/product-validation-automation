import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { env } from "../config/env.js";
import { TrendtrackClient } from "../trendtrack/client.js";
import type { TrendtrackAdSummary } from "../trendtrack/types.js";
import { dedupeCreatives, type DedupCandidate, type DedupGroup } from "../research/dedupe.js";
import { SheetsClient, type SheetsCredentials } from "../sheets/sheetsClient.js";
import { loadSimpleConfig, type SimpleCompetitor } from "./config.js";
import { resolveAdvertiserIds } from "./resolveAdvertisers.js";
import { SIMPLE_SHEET_COLUMNS, simpleRowToSheetValues, type SimpleAdRow } from "./simpleRow.js";

const logger = createLogger("simple-sync");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_JSON_PATH = resolve(projectRoot, "docs/data.json");

function reachOf(summary: TrendtrackAdSummary): number | null {
  const metrics = summary["metrics"] as { reach?: number } | undefined;
  return (summary["reach"] as number | undefined) ?? metrics?.reach ?? null;
}

interface CompetitorResult {
  name: string;
  landingPage: string;
  advertiserIds: string[];
  error: string | null;
  ads: SimpleAdRow[];
}

type CompetitorCandidate = DedupCandidate & { summary: TrendtrackAdSummary };

interface CandidateGathering {
  competitor: SimpleCompetitor;
  advertiserIds: string[];
  groups: DedupGroup<CompetitorCandidate>[];
  error: string | null;
}

/**
 * Resolves a competitor's TrendTrack advertiser ID(s) - a single brand can
 * run ads from more than one Facebook page - then fetches and dedupes
 * active ads from ALL of them into one pooled set of creative-concept
 * groups (cheap: list endpoint only, no per-ad detail calls yet). Pool size
 * per advertiser is sized off the global total so every competitor gets a
 * fair shot at making the final cross-competitor ranking.
 */
async function gatherCandidateGroups(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
): Promise<CandidateGathering> {
  const resolved = await resolveAdvertiserIds(trendtrack, competitor);
  const advertiserIds = resolved.advertiserIds;
  logger.info(`Fetching ads for ${competitor.name}`, { advertiserIds, source: resolved.source });
  const poolSize = Math.max(env.SIMPLE_TOTAL_AD_COUNT * 3, 50);

  try {
    const allCandidates: CompetitorCandidate[] = [];
    for (const advertiserId of advertiserIds) {
      const summaries: TrendtrackAdSummary[] = [];
      for await (const ad of trendtrack.paginateAdvertiserAds(
        advertiserId,
        { status: "active", sortBy: "reach", order: "desc" },
        poolSize,
      )) {
        summaries.push(ad);
      }
      logger.info(`Retrieved ${summaries.length} active ads for ${competitor.name}`, { advertiserId });
      if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
        const distinctCollationIds = new Set(summaries.map((s) => s.collationId ?? null)).size;
        logger.info(`RAW list summary sample for ${competitor.name}`, {
          advertiserId,
          distinctCollationIds,
          totalSummaries: summaries.length,
          firstThree: summaries.slice(0, 3),
        });
      }
      for (const s of summaries) {
        allCandidates.push({
          id: s.id,
          collationId: s.collationId ?? null,
          advertiserId,
          reach: reachOf(s),
          daysRunning: s.daysRunning ?? null,
          summary: s,
        });
      }
    }

    const groups = dedupeCreatives(allCandidates);
    logger.info(`Deduplicated to ${groups.length} unique creative concepts for ${competitor.name}`);

    return { competitor, advertiserIds, groups, error: null };
  } catch (err) {
    const message = toSanitizedMessage(err);
    logger.error(`Could not fetch ads for ${competitor.name}`, { advertiserIds, error: message });
    return {
      competitor,
      advertiserIds,
      groups: [],
      error: `Could not find TrendTrack ads for ${JSON.stringify(advertiserIds)} (from ${competitor.landingPage}). If these aren't the right TrendTrack advertiser IDs, look them up in TrendTrack's dashboard and add "advertiserId" for this competitor in competitors.simple.json. (${message})`,
    };
  }
}

/** Fetches full ad detail + media for one selected creative concept. */
async function enrichAd(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  group: DedupGroup<CompetitorCandidate>,
): Promise<SimpleAdRow | null> {
  const adId = group.representative.id;
  try {
    const detail = await trendtrack.getAdDetail(adId);
    if (env.LOG_RAW_TRENDTRACK_RESPONSES) {
      logger.info(`RAW ad detail for ${adId}`, { detail });
    }
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
    return {
      competitor: competitor.name,
      competitorLandingPage: competitor.landingPage,
      trendtrackAdId: adId,
      headline: detail.content?.title ?? "",
      primaryText: detail.content?.body ?? "",
      cta: detail.content?.callToAction ?? "",
      landingPageUrl: detail.content?.landingPageUrl ?? "",
      mediaType: detail.media?.type ?? "",
      mediaUrl,
      thumbnailUrl,
      reach: detail.metrics?.reach ?? reachOf(group.representative.summary),
      daysRunning: detail.daysRunning ?? group.representative.daysRunning ?? null,
      rank: detail.rank?.currentRank ?? detail.rank?.positionInPage ?? null,
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
 * Selects the single best `SIMPLE_TOTAL_AD_COUNT` ads by impressions across
 * ALL configured competitors combined - not a per-competitor quota. A
 * competitor with many high-reach ads can take most of the slots; a quiet
 * one might get none this run.
 */
export async function runSimpleSync(): Promise<CompetitorResult[]> {
  logger.info("Starting simple competitor ad sync");
  const competitors = await loadSimpleConfig();
  const trendtrack = new TrendtrackClient({
    apiKey: env.TRENDTRACK_API_KEY,
    baseUrl: env.TRENDTRACK_BASE_URL,
  });

  const gatherings = await Promise.all(
    competitors.map((competitor) => gatherCandidateGroups(trendtrack, competitor)),
  );

  const pooled = gatherings.flatMap((g) => g.groups.map((group) => ({ gathering: g, group })));
  const globalTop = pooled
    .sort((a, b) => (b.group.representative.reach ?? 0) - (a.group.representative.reach ?? 0))
    .slice(0, env.SIMPLE_TOTAL_AD_COUNT);
  logger.info(`Selected the top ${globalTop.length} ads by impressions across all competitors`);

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

  for (const { gathering, group } of globalTop) {
    const ad = await enrichAd(trendtrack, gathering.competitor, group);
    if (ad) resultsByCompetitor.get(gathering.competitor.name)!.ads.push(ad);
  }

  const results = [...resultsByCompetitor.values()];
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

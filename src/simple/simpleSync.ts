import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { env } from "../config/env.js";
import { TrendtrackClient } from "../trendtrack/client.js";
import type { TrendtrackAdSummary } from "../trendtrack/types.js";
import { dedupeCreatives, type DedupCandidate } from "../research/dedupe.js";
import { SheetsClient, type SheetsCredentials } from "../sheets/sheetsClient.js";
import { loadSimpleConfig, type SimpleCompetitor } from "./config.js";
import { extractDomain } from "./domain.js";
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
  advertiserId: string;
  error: string | null;
  ads: SimpleAdRow[];
}

async function fetchTopAdsForCompetitor(
  trendtrack: TrendtrackClient,
  competitor: SimpleCompetitor,
  topN: number,
): Promise<CompetitorResult> {
  const advertiserId = competitor.advertiserId ?? extractDomain(competitor.landingPage);
  logger.info(`Fetching ads for ${competitor.name}`, { advertiserId });

  try {
    const summaries: TrendtrackAdSummary[] = [];
    for await (const ad of trendtrack.paginateAdvertiserAds(
      advertiserId,
      { status: "active", sortBy: "reach", order: "desc" },
      Math.max(topN * 5, 50),
    )) {
      summaries.push(ad);
    }
    logger.info(`Retrieved ${summaries.length} active ads for ${competitor.name}`);

    const candidates: (DedupCandidate & { summary: TrendtrackAdSummary })[] = summaries.map((s) => ({
      id: s.id,
      collationId: s.collationId ?? null,
      advertiserId,
      reach: reachOf(s),
      daysRunning: s.daysRunning ?? null,
      summary: s,
    }));
    const groups = dedupeCreatives(candidates)
      .sort((a, b) => (b.representative.reach ?? 0) - (a.representative.reach ?? 0))
      .slice(0, topN);
    logger.info(`Selected top ${groups.length} concepts by impressions for ${competitor.name}`);

    const ads: SimpleAdRow[] = [];
    for (const group of groups) {
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
        ads.push({
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
        });
      } catch (err) {
        logger.error(`Failed to fetch detail for ad ${adId}, skipping`, {
          error: toSanitizedMessage(err),
        });
      }
    }

    return { name: competitor.name, landingPage: competitor.landingPage, advertiserId, error: null, ads };
  } catch (err) {
    const message = toSanitizedMessage(err);
    logger.error(`Could not fetch ads for ${competitor.name}`, { advertiserId, error: message });
    return {
      name: competitor.name,
      landingPage: competitor.landingPage,
      advertiserId,
      error: `Could not find TrendTrack ads for "${advertiserId}" (from ${competitor.landingPage}). If this domain isn't the right TrendTrack advertiser ID, look it up in TrendTrack's dashboard and add "advertiserId" for this competitor in competitors.simple.json. (${message})`,
      ads: [],
    };
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

export async function runSimpleSync(): Promise<CompetitorResult[]> {
  logger.info("Starting simple competitor ad sync");
  const competitors = await loadSimpleConfig();
  const trendtrack = new TrendtrackClient({
    apiKey: env.TRENDTRACK_API_KEY,
    baseUrl: env.TRENDTRACK_BASE_URL,
  });

  const results: CompetitorResult[] = [];
  for (const competitor of competitors) {
    results.push(await fetchTopAdsForCompetitor(trendtrack, competitor, env.SIMPLE_TOP_PER_COMPETITOR));
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

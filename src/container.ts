import { getPrisma } from "./db/client.js";
import { env, scoringWeights, verdictThresholds } from "./config/env.js";
import { TrendtrackClient } from "./trendtrack/client.js";
import { getStorageProvider } from "./storage/index.js";
import { SheetsClient, type SheetsCredentials } from "./sheets/sheetsClient.js";
import { MetaClient } from "./meta/metaClient.js";
import type { ResearchWorkerDeps } from "./research/researchWorker.js";
import type { ApprovalWorkerDeps } from "./approval/approvalWorker.js";
import type { PublisherDeps } from "./meta/publisher.js";
import type { PerformanceWorkerDeps } from "./performance/performanceWorker.js";

/** Wires up all real (non-test) dependencies from environment configuration. */
export function buildContainer() {
  const prisma = getPrisma();

  const trendtrack = new TrendtrackClient({
    apiKey: env.TRENDTRACK_API_KEY,
    baseUrl: env.TRENDTRACK_BASE_URL,
  });

  const storage = getStorageProvider();

  const sheetsCredentials: SheetsCredentials | undefined = env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? { kind: "service-account", json: env.GOOGLE_SERVICE_ACCOUNT_JSON }
    : env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN
      ? {
          kind: "oauth",
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
        }
      : undefined;
  const sheetsConfigured = Boolean(sheetsCredentials && env.GOOGLE_SHEET_ID);
  const sheets = sheetsConfigured
    ? new SheetsClient({
        credentials: sheetsCredentials!,
        spreadsheetId: env.GOOGLE_SHEET_ID,
        sheetTab: env.GOOGLE_SHEET_TAB,
      })
    : undefined;

  const metaClient = new MetaClient({
    accessToken: env.META_ACCESS_TOKEN,
    adAccountId: env.META_AD_ACCOUNT_ID,
    apiVersion: env.META_API_VERSION,
  });

  const researchDeps: ResearchWorkerDeps = {
    prisma,
    trendtrack,
    storage,
    topAdCount: env.TOP_AD_COUNT,
    adsPerCompetitorFetch: env.ADS_PER_COMPETITOR_FETCH,
    scoringWeights,
  };

  const metaAccountConfig = {
    accessToken: env.META_ACCESS_TOKEN,
    adAccountId: env.META_AD_ACCOUNT_ID,
    pageId: env.META_PAGE_ID,
    campaignId: env.META_DEFAULT_CAMPAIGN_ID,
    adSetId: env.META_DEFAULT_ADSET_ID,
  };

  const approvalDeps: Omit<ApprovalWorkerDeps, "sheets"> & { sheets?: SheetsClient } = {
    prisma,
    sheets,
    meta: metaAccountConfig,
  };

  const publisherDeps: PublisherDeps = {
    prisma,
    metaClient,
    pageId: env.META_PAGE_ID,
    instagramActorId: env.META_INSTAGRAM_ACCOUNT_ID || undefined,
    adSetId: env.META_DEFAULT_ADSET_ID,
    campaignId: env.META_DEFAULT_CAMPAIGN_ID,
    urlTagsTemplate: env.META_UTM_TEMPLATE || undefined,
    dryRun: env.DRY_RUN,
  };

  const performanceDeps: PerformanceWorkerDeps = {
    prisma,
    metaClient,
    thresholds: verdictThresholds,
  };

  return {
    prisma,
    trendtrack,
    storage,
    sheets,
    sheetsConfigured,
    metaClient,
    researchDeps,
    approvalDeps,
    publisherDeps,
    performanceDeps,
  };
}

export type Container = ReturnType<typeof buildContainer>;

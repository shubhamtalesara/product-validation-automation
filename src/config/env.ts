import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

loadDotenv();

// SQLite "file:" URLs are resolved differently depending on whether Prisma's
// CLI, its schema-baked env() binding, or a runtime `datasourceUrl` override
// is doing the resolving. To sidestep that ambiguity entirely, the default
// DATABASE_URL is an absolute path next to prisma/schema.prisma.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDatabaseUrl = `file:${resolve(projectRoot, "prisma/dev.db")}`;

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1")
  .default("false");

const numberFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number());

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),

  // TrendTrack
  TRENDTRACK_API_KEY: z.string().optional().default(""),
  TRENDTRACK_BASE_URL: z.string().default("https://api.trendtrack.io"),

  // Google
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REFRESH_TOKEN: z.string().optional().default(""),
  // Simplest auth path: paste the whole downloaded service-account JSON key file.
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional().default(""),
  GOOGLE_SHEET_ID: z.string().optional().default(""),
  GOOGLE_SHEET_TAB: z.string().optional().default("Research"),
  SIMPLE_SHEET_TAB: z.string().optional().default("Competitor Ads"),
  // Global cap across ALL configured competitors combined - the single
  // best N ads by impressions, regardless of which competitor they're
  // from. Not a per-competitor quota.
  SIMPLE_TOTAL_AD_COUNT: numberFromString(30),

  // Meta
  META_ACCESS_TOKEN: z.string().optional().default(""),
  META_AD_ACCOUNT_ID: z.string().optional().default(""),
  META_PAGE_ID: z.string().optional().default(""),
  META_INSTAGRAM_ACCOUNT_ID: z.string().optional().default(""),
  META_API_VERSION: z.string().optional().default("v21.0"),
  META_DEFAULT_CAMPAIGN_ID: z.string().optional().default(""),
  META_DEFAULT_ADSET_ID: z.string().optional().default(""),
  META_UTM_TEMPLATE: z.string().optional().default(""),

  // Database
  DATABASE_URL: z.string().default(defaultDatabaseUrl),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("us-east-1"),
  S3_ACCESS_KEY: z.string().optional().default(""),
  S3_SECRET_KEY: z.string().optional().default(""),
  S3_ENDPOINT: z.string().optional(),

  // Dry run
  DRY_RUN: boolFromString,

  // Schedules (cron expressions)
  RESEARCH_CRON: z.string().default("0 6 * * *"),
  APPROVAL_CRON: z.string().default("*/5 * * * *"),
  PUBLISH_CRON: z.string().default("* * * * *"),
  PERFORMANCE_CRON: z.string().default("0 */6 * * *"),

  // Research / scoring
  TOP_AD_COUNT: numberFromString(25),
  ADS_PER_COMPETITOR_FETCH: numberFromString(200),
  LONGEVITY_WEIGHT: numberFromString(0.4),
  REACH_WEIGHT: numberFromString(0.3),
  GROWTH_WEIGHT: numberFromString(0.2),
  DUPLICATION_WEIGHT: numberFromString(0.1),

  // Winner/loser thresholds
  MIN_SPEND: numberFromString(50),
  MIN_IMPRESSIONS: numberFromString(1000),
  TARGET_CPA: numberFromString(30),
  TARGET_ROAS: numberFromString(1.5),
  MIN_CTR: numberFromString(0.01),

  // Misc
  DEFAULT_TIMEZONE: z.string().default("America/New_York"),
  LOG_LEVEL: z.string().default("info"),
  // Diagnostic: dumps raw TrendTrack list/detail/media-url responses to the
  // log, plus a distinct-collationId count per competitor (to tell apart
  // "TrendTrack genuinely reports one dominant creative" from "our summary
  // objects lack enough info and got merged incorrectly"). Temporarily on
  // by default while confirming the dedup fix against the real API; safe
  // to flip back to "false" afterward.
  LOG_RAW_TRENDTRACK_RESPONSES: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0")
    .default("true"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = loadEnv();

export const scoringWeights = {
  longevity: env.LONGEVITY_WEIGHT,
  reach: env.REACH_WEIGHT,
  growth: env.GROWTH_WEIGHT,
  duplication: env.DUPLICATION_WEIGHT,
};

export const verdictThresholds = {
  minSpend: env.MIN_SPEND,
  minImpressions: env.MIN_IMPRESSIONS,
  targetCpa: env.TARGET_CPA,
  targetRoas: env.TARGET_ROAS,
  minCtr: env.MIN_CTR,
};

import type { Competitor, PrismaClient } from "@prisma/client";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { failJobRun, finishJobRun, startJobRun } from "../lib/jobRun.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import type { TrendtrackAdSummary } from "../trendtrack/types.js";
import { dedupeCreatives, type DedupCandidate } from "./dedupe.js";
import { computeValidationScores, selectTopN, type ScoringWeights } from "./scoring.js";
import type { StorageProvider } from "../storage/types.js";
import { downloadAndStoreMedia } from "../storage/downloadMedia.js";

const logger = createLogger("research");

export interface ResearchWorkerDeps {
  prisma: PrismaClient;
  trendtrack: TrendtrackClient;
  storage: StorageProvider;
  topAdCount: number;
  adsPerCompetitorFetch: number;
  scoringWeights: ScoringWeights;
}

function extractSummaryReach(summary: TrendtrackAdSummary): number | null {
  const metrics = summary["metrics"] as { reach?: number } | undefined;
  return (summary["reach"] as number | undefined) ?? metrics?.reach ?? null;
}

function extractSummaryReachDelta7d(summary: TrendtrackAdSummary): number | null {
  const metrics = summary["metrics"] as { reachDelta7d?: number } | undefined;
  return (summary["reachDelta7d"] as number | undefined) ?? metrics?.reachDelta7d ?? null;
}

export interface CompetitorResearchResult {
  competitorId: string;
  fetched: number;
  deduped: number;
  selected: number;
  downloaded: number;
}

export class ResearchWorker {
  constructor(private readonly deps: ResearchWorkerDeps) {}

  async runForCompetitor(competitor: Competitor): Promise<CompetitorResearchResult> {
    logger.info("Starting competitor research", { competitor: competitor.name });

    const summaries: TrendtrackAdSummary[] = [];
    for await (const ad of this.deps.trendtrack.paginateAdvertiserAds(
      competitor.advertiserId,
      { status: "active", sortBy: "reach", order: "desc" },
      this.deps.adsPerCompetitorFetch,
    )) {
      summaries.push(ad);
    }
    logger.info("Retrieved active ads", { competitor: competitor.name, count: summaries.length });

    const candidates: (DedupCandidate & { summary: TrendtrackAdSummary })[] = summaries.map(
      (summary) => ({
        id: summary.id,
        collationId: summary.collationId ?? null,
        advertiserId: competitor.advertiserId,
        mediaUrl: (summary["mediaUrl"] as string | undefined) ?? null,
        headline: (summary["headline"] as string | undefined) ?? null,
        primaryText: (summary["primaryText"] as string | undefined) ?? null,
        reach: extractSummaryReach(summary),
        daysRunning: summary.daysRunning ?? null,
        summary,
      }),
    );

    const groups = dedupeCreatives(candidates);
    logger.info("Deduplicated to unique creative concepts", {
      competitor: competitor.name,
      count: groups.length,
    });

    const scoringInputs = groups.map((group) => ({
      id: group.fingerprint,
      daysRunning: group.representative.daysRunning,
      reach: group.representative.reach,
      reachDelta7d: extractSummaryReachDelta7d(group.representative.summary),
      duplicateCount: group.duplicateCount,
    }));
    const scored = computeValidationScores(scoringInputs, this.deps.scoringWeights);
    const scoreByFingerprint = new Map(scored.map((s) => [s.item.id, s]));
    const topGroups = selectTopN(scored, this.deps.topAdCount).map(
      (s) => groups.find((g) => g.fingerprint === s.item.id)!,
    );
    logger.info(`Top ${this.deps.topAdCount} selected`, {
      competitor: competitor.name,
      count: topGroups.length,
    });

    let downloaded = 0;
    for (const group of topGroups) {
      try {
        await this.ingestSelectedAd(competitor, group, scoreByFingerprint.get(group.fingerprint)!.validationScore, group.duplicateCount);
        downloaded += 1;
      } catch (err) {
        logger.error("Failed to ingest ad, skipping", {
          competitor: competitor.name,
          adId: group.representative.id,
          error: toSanitizedMessage(err),
        });
      }
    }
    logger.info("Downloaded assets", { competitor: competitor.name, count: downloaded });

    return {
      competitorId: competitor.id,
      fetched: summaries.length,
      deduped: groups.length,
      selected: topGroups.length,
      downloaded,
    };
  }

  private async ingestSelectedAd(
    competitor: Competitor,
    group: ReturnType<typeof dedupeCreatives<DedupCandidate & { summary: TrendtrackAdSummary }>>[number],
    validationScore: number,
    duplicateCount: number,
  ): Promise<void> {
    const adId = group.representative.id;
    const detail = await this.deps.trendtrack.getAdDetail(adId);

    let storageUrl: string | null = null;
    let mediaUrl: string | null = detail.media?.mediaUrl ?? null;
    let thumbnailUrl: string | null = detail.media?.thumbnailUrl ?? null;

    try {
      const media = await this.deps.trendtrack.getAdMediaUrl(adId);
      mediaUrl = media.mediaUrl ?? media.url ?? mediaUrl;
      thumbnailUrl = media.thumbnailUrl ?? thumbnailUrl;
      if (mediaUrl) {
        const downloaded = await downloadAndStoreMedia(this.deps.storage, {
          competitorId: competitor.id,
          trendtrackAdId: adId,
          mediaUrl,
          mediaType: media.mediaType ?? detail.media?.type,
          filename: media.filename,
        });
        storageUrl = downloaded.storageUrl;
      }
    } catch (err) {
      logger.warn("Media download failed, keeping metadata without local asset", {
        adId,
        error: toSanitizedMessage(err),
      });
    }

    const competitorAd = await this.deps.prisma.competitorAd.upsert({
      where: { trendtrackAdId: adId },
      create: {
        trendtrackAdId: adId,
        collationId: detail.collationId ?? null,
        competitorId: competitor.id,
        status: detail.status ?? "active",
        firstSeenAt: detail.firstSeenAt ? new Date(detail.firstSeenAt) : null,
        lastSeenAt: detail.lastSeenAt ? new Date(detail.lastSeenAt) : null,
        daysRunning: detail.daysRunning ?? null,
        mediaType: detail.media?.type ?? null,
        mediaUrl,
        thumbnailUrl,
        storageUrl,
        primaryText: detail.content?.body ?? null,
        headline: detail.content?.title ?? null,
        cta: detail.content?.callToAction ?? null,
        landingPageUrl: detail.content?.landingPageUrl ?? null,
        reach: detail.metrics?.reach ?? null,
        reachDelta1d: detail.metrics?.reachDelta1d ?? null,
        reachDelta7d: detail.metrics?.reachDelta7d ?? null,
        reachDelta30d: detail.metrics?.reachDelta30d ?? null,
        currentRank: detail.rank?.currentRank ?? detail.rank?.positionInPage ?? null,
        rankDelta: detail.rank?.rankDelta ?? null,
        transcript:
          typeof detail.transcript === "string"
            ? detail.transcript
            : (detail.transcript?.fullText ?? null),
        creativeAnalysis:
          typeof detail.creativeAnalysis === "string"
            ? detail.creativeAnalysis
            : detail.creativeAnalysis
              ? JSON.stringify(detail.creativeAnalysis)
              : null,
        dedupeFingerprint: group.fingerprint,
        duplicateCount,
        validationScore,
        rawTrendtrackData: JSON.stringify(detail),
      },
      update: {
        collationId: detail.collationId ?? null,
        status: detail.status ?? "active",
        lastSeenAt: detail.lastSeenAt ? new Date(detail.lastSeenAt) : null,
        daysRunning: detail.daysRunning ?? null,
        mediaUrl,
        thumbnailUrl,
        storageUrl: storageUrl ?? undefined,
        reach: detail.metrics?.reach ?? null,
        reachDelta1d: detail.metrics?.reachDelta1d ?? null,
        reachDelta7d: detail.metrics?.reachDelta7d ?? null,
        reachDelta30d: detail.metrics?.reachDelta30d ?? null,
        currentRank: detail.rank?.currentRank ?? detail.rank?.positionInPage ?? null,
        rankDelta: detail.rank?.rankDelta ?? null,
        duplicateCount,
        validationScore,
        rawTrendtrackData: JSON.stringify(detail),
      },
    });

    await this.deps.prisma.testCreative.upsert({
      where: { competitorAdId: competitorAd.id },
      create: { competitorAdId: competitorAd.id, status: "RESEARCHED" },
      update: {},
    });
  }
}

export async function runResearch(
  deps: ResearchWorkerDeps,
  options: { competitorId?: string } = {},
): Promise<CompetitorResearchResult[]> {
  const jobRun = await startJobRun(deps.prisma, "research");
  const worker = new ResearchWorker(deps);
  const results: CompetitorResearchResult[] = [];
  try {
    const competitors = options.competitorId
      ? [await deps.prisma.competitor.findUniqueOrThrow({ where: { id: options.competitorId } })]
      : await deps.prisma.competitor.findMany({ where: { active: true } });

    for (const competitor of competitors) {
      try {
        results.push(await worker.runForCompetitor(competitor));
      } catch (err) {
        logger.error("Competitor research failed", {
          competitor: competitor.name,
          error: toSanitizedMessage(err),
        });
      }
    }

    await finishJobRun(deps.prisma, jobRun.id, { results });
    logger.info("Complete");
    return results;
  } catch (err) {
    await failJobRun(deps.prisma, jobRun.id, err);
    logger.error("Research job failed", { error: toSanitizedMessage(err) });
    throw err;
  }
}

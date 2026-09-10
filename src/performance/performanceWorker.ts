import type { PrismaClient } from "@prisma/client";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { failJobRun, finishJobRun, startJobRun } from "../lib/jobRun.js";
import type { MetaClient } from "../meta/metaClient.js";
import { aggregatePerformance } from "../sheets/sheetsSync.js";
import { computeVerdict, type VerdictThresholds } from "./verdict.js";

const logger = createLogger("performance");

export interface PerformanceWorkerDeps {
  prisma: PrismaClient;
  metaClient: MetaClient;
  thresholds: VerdictThresholds;
}

const ACTIVE_TRACKING_STATUSES = ["SCHEDULED", "LIVE"];

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface PerformanceRunSummary {
  tracked: number;
  updated: number;
  errors: number;
}

/**
 * For every ad that has been published to Meta and isn't in a terminal
 * state, pulls current insights, appends a snapshot for today (without
 * touching prior days' snapshots), and re-evaluates the winner/loser
 * verdict once enough data has accumulated.
 */
export async function runPerformanceSync(deps: PerformanceWorkerDeps): Promise<PerformanceRunSummary> {
  const jobRun = await startJobRun(deps.prisma, "performance");
  const summary: PerformanceRunSummary = { tracked: 0, updated: 0, errors: 0 };

  try {
    const candidates = await deps.prisma.testCreative.findMany({
      where: {
        metaAdId: { not: null },
        status: { in: ACTIVE_TRACKING_STATUSES },
      },
      include: { performanceSnapshots: true },
    });
    summary.tracked = candidates.length;
    logger.info(`Tracking performance for ${candidates.length} live ads`);

    for (const tc of candidates) {
      try {
        const effectiveStatus = await deps.metaClient.getAdEffectiveStatus(tc.metaAdId!);
        const nextStatus = effectiveStatus === "ACTIVE" ? "LIVE" : tc.status;

        const insights = await deps.metaClient.getAdInsights(tc.metaAdId!);
        if (insights) {
          const today = startOfUtcDay();
          await deps.prisma.performanceSnapshot.upsert({
            where: { testCreativeId_date: { testCreativeId: tc.id, date: today } },
            create: {
              testCreativeId: tc.id,
              date: today,
              spend: insights.spend,
              impressions: insights.impressions,
              clicks: insights.clicks,
              ctr: insights.ctr,
              cpc: insights.cpc,
              cpm: insights.cpm,
              conversions: insights.conversions,
              conversionValue: insights.conversionValue,
              cpa: insights.conversions > 0 ? insights.spend / insights.conversions : null,
              roas: insights.spend > 0 ? insights.conversionValue / insights.spend : null,
              rawMetaData: JSON.stringify(insights.raw),
            },
            update: {
              spend: insights.spend,
              impressions: insights.impressions,
              clicks: insights.clicks,
              ctr: insights.ctr,
              cpc: insights.cpc,
              cpm: insights.cpm,
              conversions: insights.conversions,
              conversionValue: insights.conversionValue,
              cpa: insights.conversions > 0 ? insights.spend / insights.conversions : null,
              roas: insights.spend > 0 ? insights.conversionValue / insights.spend : null,
              rawMetaData: JSON.stringify(insights.raw),
            },
          });
        }

        const allSnapshots = await deps.prisma.performanceSnapshot.findMany({
          where: { testCreativeId: tc.id },
        });
        const cumulative = aggregatePerformance(allSnapshots);
        const verdict = computeVerdict(cumulative, deps.thresholds);
        const finalStatus = verdict === "INSUFFICIENT_DATA" ? nextStatus : verdict;

        await deps.prisma.testCreative.update({
          where: { id: tc.id },
          data: { status: finalStatus, metaStatus: effectiveStatus, verdict },
        });
        summary.updated += 1;
      } catch (err) {
        summary.errors += 1;
        logger.error("Failed to sync performance for creative", {
          id: tc.id,
          error: toSanitizedMessage(err),
        });
      }
    }

    await finishJobRun(deps.prisma, jobRun.id, summary as unknown as Record<string, unknown>);
    return summary;
  } catch (err) {
    await failJobRun(deps.prisma, jobRun.id, err);
    logger.error("Performance sync job failed", { error: toSanitizedMessage(err) });
    throw err;
  }
}

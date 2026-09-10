import cron from "node-cron";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { env } from "../config/env.js";
import { buildContainer } from "../container.js";
import { runResearch } from "../research/researchWorker.js";
import { runApprovalCheck } from "../approval/approvalWorker.js";
import { runPublishWorker } from "../meta/publishWorker.js";
import { runPerformanceSync } from "../performance/performanceWorker.js";
import { syncSheet } from "../sheets/syncWorker.js";

const logger = createLogger("scheduler");

function guarded(name: string, fn: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`Scheduled job "${name}" failed`, { error: toSanitizedMessage(err) });
    }
  };
}

/**
 * Starts the four scheduled jobs required by the pipeline. Schedules are
 * configurable via RESEARCH_CRON / APPROVAL_CRON / PUBLISH_CRON /
 * PERFORMANCE_CRON so no external automation platform is needed.
 */
export function startScheduler(): void {
  const container = buildContainer();

  logger.info("Starting scheduler", {
    researchCron: env.RESEARCH_CRON,
    approvalCron: env.APPROVAL_CRON,
    publishCron: env.PUBLISH_CRON,
    performanceCron: env.PERFORMANCE_CRON,
    dryRun: env.DRY_RUN,
  });

  cron.schedule(
    env.RESEARCH_CRON,
    guarded("research", async () => {
      await runResearch(container.researchDeps);
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    }),
  );

  if (container.sheets) {
    cron.schedule(
      env.APPROVAL_CRON,
      guarded("approval", async () => {
        await runApprovalCheck({ ...container.approvalDeps, sheets: container.sheets! });
      }),
    );
  } else {
    logger.warn("Google Sheets not configured - approval polling job disabled");
  }

  cron.schedule(
    env.PUBLISH_CRON,
    guarded("publish", async () => {
      await runPublishWorker(container.publisherDeps);
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    }),
  );

  cron.schedule(
    env.PERFORMANCE_CRON,
    guarded("performance", async () => {
      await runPerformanceSync(container.performanceDeps);
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    }),
  );
}

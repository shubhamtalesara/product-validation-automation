import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { failJobRun, finishJobRun, startJobRun } from "../lib/jobRun.js";
import { publishTestCreative, type PublisherDeps } from "./publisher.js";

const logger = createLogger("publish");

export interface PublishRunSummary {
  found: number;
  published: number;
  errors: number;
}

/**
 * Every tick: find approved creatives whose launch time has arrived and
 * that have not yet been published, and publish them. Never selects a row
 * that already has a metaAdId - that is the idempotency guarantee.
 */
export async function runPublishWorker(deps: PublisherDeps): Promise<PublishRunSummary> {
  const jobRun = await startJobRun(deps.prisma, "publish");
  const summary: PublishRunSummary = { found: 0, published: 0, errors: 0 };

  try {
    const due = await deps.prisma.testCreative.findMany({
      where: {
        status: "APPROVED",
        metaAdId: null,
        launchAt: { lte: new Date() },
      },
    });
    summary.found = due.length;
    logger.info(`Found ${due.length} approved creatives`);

    for (const tc of due) {
      logger.info(`Validating creative ${tc.id}`);
      const outcome = await publishTestCreative(deps, tc.id);
      if (outcome === "published" || outcome === "dry_run") summary.published += 1;
      if (outcome === "error") summary.errors += 1;
    }

    await finishJobRun(deps.prisma, jobRun.id, summary as unknown as Record<string, unknown>);
    return summary;
  } catch (err) {
    await failJobRun(deps.prisma, jobRun.id, err);
    logger.error("Publish job failed", { error: toSanitizedMessage(err) });
    throw err;
  }
}

/** Republishes a single row on demand (used by the `ads:publish --id=` CLI command). */
export async function publishOne(deps: PublisherDeps, testCreativeId: string): Promise<void> {
  const jobRun = await startJobRun(deps.prisma, "publish");
  try {
    const outcome = await publishTestCreative(deps, testCreativeId);
    await finishJobRun(deps.prisma, jobRun.id, { testCreativeId, outcome });
  } catch (err) {
    await failJobRun(deps.prisma, jobRun.id, err);
    throw err;
  }
}

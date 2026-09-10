#!/usr/bin/env node
import { Command } from "commander";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { buildContainer } from "../container.js";
import { disconnectPrisma } from "../db/client.js";
import { runResearch } from "../research/researchWorker.js";
import { syncSheet } from "../sheets/syncWorker.js";
import { runApprovalCheck } from "../approval/approvalWorker.js";
import { runPublishWorker, publishOne } from "../meta/publishWorker.js";
import { runPerformanceSync } from "../performance/performanceWorker.js";
import { CompetitorRepository } from "../competitors/competitorRepository.js";

const logger = createLogger("cli");
const program = new Command();

program
  .name("product-validation-automation")
  .description("Automated competitor-ad research and product-validation pipeline");

function requireSheets(container: ReturnType<typeof buildContainer>) {
  if (!container.sheets) {
    logger.error(
      "Google Sheets is not configured. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN and GOOGLE_SHEET_ID.",
    );
    process.exitCode = 1;
    return undefined;
  }
  return container.sheets;
}

async function withContainer(fn: (container: ReturnType<typeof buildContainer>) => Promise<void>) {
  const container = buildContainer();
  try {
    await fn(container);
  } catch (err) {
    logger.error("Command failed", { error: toSanitizedMessage(err) });
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

program
  .command("research:run")
  .description("Run the research pipeline for all active competitors (or one, via --competitor)")
  .option("--competitor <id>", "Only run research for this competitor ID")
  .action(async (opts: { competitor?: string }) => {
    await withContainer(async (container) => {
      const results = await runResearch(container.researchDeps, { competitorId: opts.competitor });
      logger.info("Research run complete", { results });
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    });
  });

program
  .command("research:top")
  .description("List the current top-scored CompetitorAd records")
  .option("--competitor <id>", "Filter to a single competitor")
  .option("--limit <n>", "Number of rows to show", "25")
  .action(async (opts: { competitor?: string; limit: string }) => {
    await withContainer(async (container) => {
      const ads = await container.prisma.competitorAd.findMany({
        where: opts.competitor ? { competitorId: opts.competitor } : undefined,
        include: { competitor: true, testCreative: true },
        orderBy: { validationScore: "desc" },
        take: Number(opts.limit),
      });
      for (const ad of ads) {
        logger.info(
          `${ad.competitor.name} | score=${ad.validationScore?.toFixed(3)} | days=${ad.daysRunning} | reach=${ad.reach} | status=${ad.testCreative?.status} | ${ad.headline ?? ""}`,
        );
      }
    });
  });

program
  .command("sheets:sync")
  .description("Sync all research + test creative records to Google Sheets")
  .action(async () => {
    await withContainer(async (container) => {
      const sheets = requireSheets(container);
      if (!sheets) return;
      await syncSheet(container.prisma, sheets);
    });
  });

program
  .command("approval:check")
  .description("Poll the Google Sheet for APPROVED/REJECTED rows and validate them")
  .action(async () => {
    await withContainer(async (container) => {
      const sheets = requireSheets(container);
      if (!sheets) return;
      const summary = await runApprovalCheck({ ...container.approvalDeps, sheets });
      logger.info("Approval check complete", summary as unknown as Record<string, unknown>);
    });
  });

program
  .command("ads:publish")
  .description("Publish approved+due creatives to Meta (or one, via --id)")
  .option("--id <testCreativeId>", "Publish a single TestCreative by ID, regardless of launch time")
  .action(async (opts: { id?: string }) => {
    await withContainer(async (container) => {
      if (opts.id) {
        await publishOne(container.publisherDeps, opts.id);
      } else {
        const summary = await runPublishWorker(container.publisherDeps);
        logger.info("Publish run complete", summary as unknown as Record<string, unknown>);
      }
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    });
  });

program
  .command("performance:sync")
  .description("Pull Meta performance for all LIVE ads and store snapshots")
  .action(async () => {
    await withContainer(async (container) => {
      const summary = await runPerformanceSync(container.performanceDeps);
      logger.info("Performance sync complete", summary as unknown as Record<string, unknown>);
      if (container.sheets) await syncSheet(container.prisma, container.sheets);
    });
  });

program
  .command("competitors:add")
  .description("Add a new competitor to track (no code changes required)")
  .requiredOption("--name <name>", "Competitor display name")
  .requiredOption("--advertiser-id <advertiserId>", "TrendTrack advertiser ID")
  .option("--brandtracker-id <id>", "TrendTrack brandtracker ID")
  .option("--category <category>", "Product/category")
  .option("--notes <notes>", "Free-form notes")
  .action(async (opts) => {
    await withContainer(async (container) => {
      const repo = new CompetitorRepository(container.prisma);
      const competitor = await repo.create({
        name: opts.name,
        advertiserId: opts.advertiserId,
        brandtrackerId: opts.brandtrackerId,
        category: opts.category,
        notes: opts.notes,
      });
      logger.info("Competitor created", { id: competitor.id, name: competitor.name });
    });
  });

program
  .command("competitors:list")
  .description("List all configured competitors")
  .action(async () => {
    await withContainer(async (container) => {
      const repo = new CompetitorRepository(container.prisma);
      const competitors = await repo.listAll();
      for (const c of competitors) {
        logger.info(`${c.id} | ${c.name} | advertiserId=${c.advertiserId} | active=${c.active}`);
      }
    });
  });

program.parseAsync(process.argv);

import type { PrismaClient } from "@prisma/client";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import type { MetaClient } from "./metaClient.js";
import { inferMediaKind, resolveCreativeBytes } from "./assetResolver.js";

const logger = createLogger("publish");

export interface PublisherDeps {
  prisma: PrismaClient;
  metaClient: MetaClient;
  pageId: string;
  instagramActorId?: string;
  adSetId: string;
  campaignId: string;
  urlTagsTemplate?: string;
  dryRun: boolean;
}

export type PublishOutcome =
  | "already_published"
  | "in_progress"
  | "dry_run"
  | "published"
  | "error";

async function markError(prisma: PrismaClient, id: string, reason: string): Promise<void> {
  await prisma.testCreative.update({
    where: { id },
    data: { status: "ERROR", errorReason: reason, publishLock: "FAILED" },
  });
  logger.error("Marked test creative as ERROR", { id, reason });
}

/**
 * Publishes a single approved TestCreative to Meta. Idempotent: if
 * `metaAdId` is already set, this is a no-op regardless of how many times
 * the publish worker's cron tick invokes it.
 */
export async function publishTestCreative(
  deps: PublisherDeps,
  testCreativeId: string,
): Promise<PublishOutcome> {
  const tc = await deps.prisma.testCreative.findUniqueOrThrow({
    where: { id: testCreativeId },
    include: { competitorAd: { include: { competitor: true } } },
  });

  if (tc.metaAdId) {
    logger.info("Already published, skipping", { id: tc.id, metaAdId: tc.metaAdId });
    return "already_published";
  }
  if (tc.publishLock === "PUBLISHING") {
    logger.warn("Publish already in progress for this row, skipping this tick", { id: tc.id });
    return "in_progress";
  }

  const creativeSource = tc.creativeStorageUrl || tc.creativeUrl;
  if (!creativeSource || !tc.primaryText || !tc.headline || !tc.cta || !tc.landingPageUrl) {
    await markError(deps.prisma, tc.id, "Missing required ad fields at publish time");
    return "error";
  }

  const mediaKind = inferMediaKind(creativeSource);
  const adName = `${tc.competitorAd.competitor.name} | ${tc.headline}`.slice(0, 100);

  if (deps.dryRun) {
    logger.info(
      [
        "",
        "DRY RUN",
        "",
        `Competitor: ${tc.competitorAd.competitor.name}`,
        `TrendTrack Ad: ${tc.competitorAd.trendtrackAdId}`,
        "",
        `Our Creative: ${creativeSource}`,
        `Campaign: ${deps.campaignId}`,
        `Ad Set: ${deps.adSetId}`,
        `Launch: ${tc.launchDate} ${tc.launchTime ?? ""} ${tc.timezone}`.trim(),
        "",
        "Would create:",
        "  Meta Creative",
        "  Meta Ad",
        "",
        "No live Meta objects created.",
        "",
      ].join("\n"),
    );
    return "dry_run";
  }

  await deps.prisma.testCreative.update({
    where: { id: tc.id },
    data: { publishLock: "PUBLISHING" },
  });

  try {
    let metaCreativeId = tc.metaCreativeId;
    if (!metaCreativeId) {
      logger.info("Uploading creative to Meta", { id: tc.id, mediaKind });
      const bytes = await resolveCreativeBytes(creativeSource);
      const filename = `${tc.id}.${mediaKind === "video" ? "mp4" : "jpg"}`;

      const imageHash =
        mediaKind === "image" ? await deps.metaClient.uploadImage(bytes, filename) : undefined;
      const videoId =
        mediaKind === "video" ? await deps.metaClient.uploadVideo(bytes, filename) : undefined;

      metaCreativeId = await deps.metaClient.createAdCreative({
        name: adName,
        pageId: deps.pageId,
        instagramActorId: deps.instagramActorId,
        mediaKind,
        imageHash,
        videoId,
        thumbnailUrl: tc.competitorAd.thumbnailUrl ?? undefined,
        primaryText: tc.primaryText,
        headline: tc.headline,
        landingPageUrl: tc.landingPageUrl,
        ctaType: tc.cta,
        urlTags: deps.urlTagsTemplate,
      });
      await deps.prisma.testCreative.update({
        where: { id: tc.id },
        data: { metaCreativeId },
      });
      logger.info(`Created Meta creative ${metaCreativeId}`, { id: tc.id });
    }

    const metaAdId = await deps.metaClient.createAd({
      name: adName,
      adSetId: deps.adSetId,
      creativeId: metaCreativeId,
      status: "ACTIVE",
    });
    logger.info(`Created Meta ad ${metaAdId}`, { id: tc.id });

    await deps.prisma.testCreative.update({
      where: { id: tc.id },
      data: {
        metaAdId,
        metaAdSetId: deps.adSetId,
        metaCampaignId: deps.campaignId,
        metaStatus: "ACTIVE",
        status: "SCHEDULED",
        publishLock: "PUBLISHED",
        errorReason: null,
      },
    });
    logger.info(`Scheduled for ${tc.launchDate} ${tc.launchTime ?? ""} ${tc.timezone}`.trim(), {
      id: tc.id,
    });
    return "published";
  } catch (err) {
    await deps.prisma.testCreative.update({
      where: { id: tc.id },
      data: {
        status: "ERROR",
        errorReason: toSanitizedMessage(err),
        publishLock: "FAILED",
      },
    });
    logger.error("Publish failed", { id: tc.id, error: toSanitizedMessage(err) });
    return "error";
  }
}

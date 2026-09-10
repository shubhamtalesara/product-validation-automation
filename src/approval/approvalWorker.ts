import type { PrismaClient } from "@prisma/client";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { failJobRun, finishJobRun, startJobRun } from "../lib/jobRun.js";
import { parseHumanRow } from "../sheets/sheetsSync.js";
import type { SheetsClient } from "../sheets/sheetsClient.js";
import { validateApprovalCandidate, type MetaAccountConfig } from "./validation.js";
import { resolveLaunchAt } from "../scheduling/launchTime.js";

const logger = createLogger("approval");

const PRE_APPROVAL_STATUSES = new Set(["RESEARCHED", "SELECTED", "IN_PRODUCTION", "READY"]);
const POST_APPROVAL_STATUSES = new Set(["APPROVED", "SCHEDULED", "LIVE", "WINNER", "LOSER"]);

export interface ApprovalWorkerDeps {
  prisma: PrismaClient;
  sheets: SheetsClient;
  meta: MetaAccountConfig;
}

export interface ApprovalRunSummary {
  scanned: number;
  approved: number;
  blocked: number;
  rejected: number;
  statusSynced: number;
}

export async function runApprovalCheck(deps: ApprovalWorkerDeps): Promise<ApprovalRunSummary> {
  const jobRun = await startJobRun(deps.prisma, "approval");
  const summary: ApprovalRunSummary = {
    scanned: 0,
    approved: 0,
    blocked: 0,
    rejected: 0,
    statusSynced: 0,
  };

  try {
    logger.info("Checking Google Sheet for status changes");
    const rows = await deps.sheets.getAllRows();

    for (let i = 1; i < rows.length; i++) {
      const parsed = parseHumanRow(rows[i]);
      if (!parsed.researchId) continue;
      summary.scanned += 1;

      const testCreative = await deps.prisma.testCreative.findUnique({
        where: { competitorAdId: parsed.researchId },
      });
      if (!testCreative) {
        logger.warn("Sheet row has no matching TestCreative, skipping", {
          researchId: parsed.researchId,
        });
        continue;
      }

      // Once a Meta ad exists, the row is immutable from the sheet's perspective
      // (idempotency: never let a later poll re-open or re-publish a live ad).
      if (testCreative.metaAdId) continue;

      if (parsed.status === "REJECTED" && testCreative.status !== "REJECTED") {
        await deps.prisma.testCreative.update({
          where: { id: testCreative.id },
          data: { status: "REJECTED", errorReason: null },
        });
        summary.rejected += 1;
        continue;
      }

      // Pull human-edited production fields into the DB (source of truth).
      await deps.prisma.testCreative.update({
        where: { id: testCreative.id },
        data: {
          creativeUrl: parsed.ourCreativeUrl || testCreative.creativeUrl,
          primaryText: parsed.ourPrimaryText || testCreative.primaryText,
          headline: parsed.ourHeadline || testCreative.headline,
          cta: parsed.ourCta || testCreative.cta,
          landingPageUrl: parsed.ourLandingPageUrl || testCreative.landingPageUrl,
          launchDate: parsed.launchDate || testCreative.launchDate,
          launchTime: parsed.launchTime || testCreative.launchTime,
          timezone: parsed.timezone || testCreative.timezone,
        },
      });

      if (parsed.status === "APPROVED" && !POST_APPROVAL_STATUSES.has(testCreative.status)) {
        logger.info("Validating approved row", { researchId: parsed.researchId });
        const candidate = {
          ourCreativeStorageUrl: testCreative.creativeStorageUrl,
          ourCreativeUrl: parsed.ourCreativeUrl || testCreative.creativeUrl,
          ourPrimaryText: parsed.ourPrimaryText || testCreative.primaryText,
          ourHeadline: parsed.ourHeadline || testCreative.headline,
          ourCta: parsed.ourCta || testCreative.cta,
          ourLandingPageUrl: parsed.ourLandingPageUrl || testCreative.landingPageUrl,
          launchDate: parsed.launchDate || testCreative.launchDate,
          launchTime: parsed.launchTime || testCreative.launchTime,
          timezone: parsed.timezone || testCreative.timezone,
        };
        const result = validateApprovalCandidate(candidate, deps.meta);

        if (result.ok) {
          const launchAt = resolveLaunchAt(
            candidate.launchDate!,
            candidate.launchTime ?? "",
            candidate.timezone!,
          );
          await deps.prisma.testCreative.update({
            where: { id: testCreative.id },
            data: { status: "APPROVED", errorReason: null, launchAt },
          });
          summary.approved += 1;
          logger.info("Row approved and validated", { researchId: parsed.researchId });
        } else {
          await deps.prisma.testCreative.update({
            where: { id: testCreative.id },
            data: { status: "BLOCKED", errorReason: result.reason },
          });
          summary.blocked += 1;
          logger.warn("Row blocked", { researchId: parsed.researchId, reason: result.reason });
        }
        continue;
      }

      if (
        PRE_APPROVAL_STATUSES.has(parsed.status) &&
        parsed.status !== testCreative.status &&
        PRE_APPROVAL_STATUSES.has(testCreative.status)
      ) {
        await deps.prisma.testCreative.update({
          where: { id: testCreative.id },
          data: { status: parsed.status },
        });
        summary.statusSynced += 1;
      }
    }

    await finishJobRun(deps.prisma, jobRun.id, summary as unknown as Record<string, unknown>);
    logger.info("Approval check complete", summary as unknown as Record<string, unknown>);
    return summary;
  } catch (err) {
    await failJobRun(deps.prisma, jobRun.id, err);
    logger.error("Approval job failed", { error: toSanitizedMessage(err) });
    throw err;
  }
}

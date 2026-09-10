import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetTestDatabase } from "../testUtils/prismaTestClient.js";
import { runApprovalCheck } from "./approvalWorker.js";
import { SHEET_COLUMNS, COLUMN_INDEX } from "../sheets/columns.js";
import type { SheetsClient } from "../sheets/sheetsClient.js";

function rowFor(researchId: string, overrides: Record<string, string> = {}): string[] {
  const row = new Array(SHEET_COLUMNS.length).fill("");
  row[COLUMN_INDEX["Research ID"]] = researchId;
  for (const [col, value] of Object.entries(overrides)) {
    row[COLUMN_INDEX[col as keyof typeof COLUMN_INDEX]] = value;
  }
  return row;
}

function fakeSheets(rows: string[][]): SheetsClient {
  return { async getAllRows() { return rows; } } as unknown as SheetsClient;
}

const fullMeta = {
  accessToken: "token",
  adAccountId: "act_1",
  pageId: "page_1",
  campaignId: "camp_1",
  adSetId: "set_1",
};

describe("runApprovalCheck", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seed(status = "READY") {
    const competitor = await prisma.competitor.create({ data: { name: "Acme", advertiserId: "a1" } });
    const ad = await prisma.competitorAd.create({
      data: { trendtrackAdId: "tt1", competitorId: competitor.id },
    });
    const tc = await prisma.testCreative.create({
      data: { competitorAdId: ad.id, status },
    });
    return { competitor, ad, tc };
  }

  it("approves a fully-specified row and resolves launchAt", async () => {
    const { ad } = await seed("READY");
    const rows = [
      [...SHEET_COLUMNS],
      rowFor(ad.id, {
        Status: "APPROVED",
        "Our Creative URL": "https://drive.google.com/x",
        "Our Primary Text": "copy",
        "Our Headline": "headline",
        "Our CTA": "SHOP_NOW",
        "Our Landing Page": "https://ours.com/lp",
        "Launch Date": "2026-09-15",
        "Launch Time": "10:00",
        Timezone: "America/New_York",
      }),
    ];

    const summary = await runApprovalCheck({ prisma, sheets: fakeSheets(rows), meta: fullMeta });
    expect(summary.approved).toBe(1);

    const tc = await prisma.testCreative.findUniqueOrThrow({ where: { competitorAdId: ad.id } });
    expect(tc.status).toBe("APPROVED");
    expect(tc.launchAt).not.toBeNull();
    expect(tc.errorReason).toBeNull();
  });

  it("blocks a row missing the landing page with a specific reason", async () => {
    const { ad } = await seed("READY");
    const rows = [
      [...SHEET_COLUMNS],
      rowFor(ad.id, {
        Status: "APPROVED",
        "Our Creative URL": "https://drive.google.com/x",
        "Our Primary Text": "copy",
        "Our Headline": "headline",
        "Our CTA": "SHOP_NOW",
        "Launch Date": "2026-09-15",
        Timezone: "America/New_York",
      }),
    ];

    const summary = await runApprovalCheck({ prisma, sheets: fakeSheets(rows), meta: fullMeta });
    expect(summary.blocked).toBe(1);

    const tc = await prisma.testCreative.findUniqueOrThrow({ where: { competitorAdId: ad.id } });
    expect(tc.status).toBe("BLOCKED");
    expect(tc.errorReason).toMatch(/landing page/i);
  });

  it("marks a row REJECTED when the human sets that status", async () => {
    const { ad } = await seed("READY");
    const rows = [[...SHEET_COLUMNS], rowFor(ad.id, { Status: "REJECTED" })];

    const summary = await runApprovalCheck({ prisma, sheets: fakeSheets(rows), meta: fullMeta });
    expect(summary.rejected).toBe(1);
    const tc = await prisma.testCreative.findUniqueOrThrow({ where: { competitorAdId: ad.id } });
    expect(tc.status).toBe("REJECTED");
  });

  it("never re-processes a row that already has a Meta ad (idempotency)", async () => {
    const { ad, tc } = await seed("SCHEDULED");
    await prisma.testCreative.update({ where: { id: tc.id }, data: { metaAdId: "existing-ad" } });

    const rows = [
      [...SHEET_COLUMNS],
      rowFor(ad.id, {
        Status: "APPROVED",
        "Our Creative URL": "https://drive.google.com/x",
        "Our Primary Text": "copy",
        "Our Headline": "headline",
        "Our CTA": "SHOP_NOW",
        "Our Landing Page": "https://ours.com/lp",
        "Launch Date": "2026-09-15",
        Timezone: "America/New_York",
      }),
    ];

    const summary = await runApprovalCheck({ prisma, sheets: fakeSheets(rows), meta: fullMeta });
    expect(summary.approved).toBe(0);
    expect(summary.blocked).toBe(0);

    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.status).toBe("SCHEDULED");
    expect(updated.metaAdId).toBe("existing-ad");
  });

  it("syncs pre-approval editorial status changes made directly in the sheet", async () => {
    const { ad } = await seed("SELECTED");
    const rows = [[...SHEET_COLUMNS], rowFor(ad.id, { Status: "IN_PRODUCTION" })];

    const summary = await runApprovalCheck({ prisma, sheets: fakeSheets(rows), meta: fullMeta });
    expect(summary.statusSynced).toBe(1);
    const tc = await prisma.testCreative.findUniqueOrThrow({ where: { competitorAdId: ad.id } });
    expect(tc.status).toBe("IN_PRODUCTION");
  });
});

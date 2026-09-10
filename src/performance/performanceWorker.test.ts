import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestPrismaClient, resetTestDatabase } from "../testUtils/prismaTestClient.js";
import { runPerformanceSync } from "./performanceWorker.js";
import type { MetaClient } from "../meta/metaClient.js";

const thresholds = { minSpend: 50, minImpressions: 1000, targetCpa: 30, targetRoas: 1.5, minCtr: 0.01 };

function fakeMetaClient(insights: Record<string, unknown> | null, effectiveStatus = "ACTIVE"): MetaClient {
  return {
    getAdEffectiveStatus: vi.fn().mockResolvedValue(effectiveStatus),
    getAdInsights: vi.fn().mockResolvedValue(insights),
  } as unknown as MetaClient;
}

describe("runPerformanceSync", () => {
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

  async function seedLiveRow(status = "SCHEDULED") {
    const competitor = await prisma.competitor.create({ data: { name: "Acme", advertiserId: "a1" } });
    const ad = await prisma.competitorAd.create({ data: { trendtrackAdId: "tt1", competitorId: competitor.id } });
    const tc = await prisma.testCreative.create({
      data: { competitorAdId: ad.id, status, metaAdId: "ad_1" },
    });
    return tc;
  }

  it("stores a snapshot and moves SCHEDULED -> LIVE once Meta reports ACTIVE", async () => {
    const tc = await seedLiveRow("SCHEDULED");
    const metaClient = fakeMetaClient({
      spend: 20,
      impressions: 500,
      clicks: 5,
      ctr: 0.01,
      cpc: 4,
      cpm: 40,
      conversions: 0,
      conversionValue: 0,
      raw: {},
    });

    const summary = await runPerformanceSync({ prisma, metaClient, thresholds });
    expect(summary.tracked).toBe(1);
    expect(summary.updated).toBe(1);

    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.status).toBe("LIVE"); // insufficient data keeps LIVE status, but transitions from SCHEDULED
    expect(updated.verdict).toBe("INSUFFICIENT_DATA");

    const snapshots = await prisma.performanceSnapshot.findMany({ where: { testCreativeId: tc.id } });
    expect(snapshots).toHaveLength(1);
  });

  it("upserts today's snapshot instead of duplicating it on a second run the same day", async () => {
    const tc = await seedLiveRow("LIVE");
    const metaClient = fakeMetaClient({
      spend: 20,
      impressions: 500,
      clicks: 5,
      ctr: 0.01,
      cpc: 4,
      cpm: 40,
      conversions: 0,
      conversionValue: 0,
      raw: {},
    });

    await runPerformanceSync({ prisma, metaClient, thresholds });
    const secondMetaClient = fakeMetaClient({
      spend: 40,
      impressions: 900,
      clicks: 9,
      ctr: 0.01,
      cpc: 4,
      cpm: 40,
      conversions: 0,
      conversionValue: 0,
      raw: {},
    });
    await runPerformanceSync({ prisma, metaClient: secondMetaClient, thresholds });

    const snapshots = await prisma.performanceSnapshot.findMany({ where: { testCreativeId: tc.id } });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].spend).toBe(40);
  });

  it("never overwrites a prior day's snapshot", async () => {
    const tc = await seedLiveRow("LIVE");
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    await prisma.performanceSnapshot.create({
      data: { testCreativeId: tc.id, date: yesterday, spend: 30, impressions: 800, clicks: 10 },
    });

    const metaClient = fakeMetaClient({
      spend: 25,
      impressions: 600,
      clicks: 6,
      ctr: 0.01,
      cpc: 4,
      cpm: 40,
      conversions: 0,
      conversionValue: 0,
      raw: {},
    });
    await runPerformanceSync({ prisma, metaClient, thresholds });

    const snapshots = await prisma.performanceSnapshot.findMany({
      where: { testCreativeId: tc.id },
      orderBy: { date: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].spend).toBe(30); // yesterday untouched
    expect(snapshots[1].spend).toBe(25); // today's new snapshot
  });

  it("marks a creative WINNER once enough data clears the configured thresholds", async () => {
    const tc = await seedLiveRow("LIVE");
    const metaClient = fakeMetaClient({
      spend: 100,
      impressions: 10000,
      clicks: 200,
      ctr: 0.02,
      cpc: 0.5,
      cpm: 10,
      conversions: 5,
      conversionValue: 300,
      raw: {},
    });

    await runPerformanceSync({ prisma, metaClient, thresholds });
    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.verdict).toBe("WINNER");
    expect(updated.status).toBe("WINNER");
  });

  it("skips ads that are not yet published or already in a terminal state", async () => {
    await prisma.competitor.create({ data: { name: "Acme", advertiserId: "a1" } });
    const summary = await runPerformanceSync({ prisma, metaClient: fakeMetaClient(null), thresholds });
    expect(summary.tracked).toBe(0);
  });
});

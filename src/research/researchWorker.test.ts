import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetTestDatabase } from "../testUtils/prismaTestClient.js";
import { runResearch } from "./researchWorker.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import type { StorageProvider } from "../storage/types.js";

function fakeTrendtrackClient(): TrendtrackClient {
  const summaries = [
    // Two summaries sharing a collationId -> should collapse into ONE concept.
    { id: "ad-1", collationId: "col-1", daysRunning: 40, reach: 10000 },
    { id: "ad-2", collationId: "col-1", daysRunning: 40, reach: 50000 },
    // A standalone concept.
    { id: "ad-3", collationId: null, daysRunning: 5, reach: 2000 },
  ];
  const details: Record<string, unknown> = {
    "ad-2": {
      id: "ad-2",
      collationId: "col-1",
      status: "active",
      daysRunning: 40,
      media: { mediaType: "video", url: "https://cdn.example.com/ad2.mp4" },
      content: { primaryText: "Copy", headline: "Headline", landingPageUrl: "https://x.com" },
      metrics: { reach: 50000, reachDelta7d: 1000 },
      rank: 1,
    },
    "ad-3": {
      id: "ad-3",
      collationId: null,
      status: "active",
      daysRunning: 5,
      media: { mediaType: "image", url: "https://cdn.example.com/ad3.jpg" },
      content: { primaryText: "Copy 3", headline: "Headline 3", landingPageUrl: "https://y.com" },
      metrics: { reach: 2000, reachDelta7d: 100 },
      rank: 5,
    },
  };

  return {
    async *paginateAdvertiserAds() {
      for (const s of summaries) yield s as never;
    },
    async getAdDetail(adId: string) {
      return details[adId] as never;
    },
    async getAdMediaUrl(adId: string) {
      return {
        mediaType: adId === "ad-2" ? "video" : "image",
        url: `https://cdn.example.com/${adId}.bin`,
        mediaUrl: `https://cdn.example.com/${adId}.bin`,
        filename: `${adId}.bin`,
      } as never;
    },
  } as unknown as TrendtrackClient;
}

function fakeStorageProvider(): StorageProvider {
  const store = new Map<string, Buffer>();
  return {
    async store(key, data) {
      store.set(key, data);
      return { storageUrl: `memory://${key}`, hash: "hash", bytes: data.byteLength };
    },
    async exists(key) {
      return store.has(key);
    },
    resolveUrl(key) {
      return `memory://${key}`;
    },
  };
}

const originalFetch = global.fetch;

describe("runResearch", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "video/mp4" }),
      arrayBuffer: async () => new TextEncoder().encode("bytes").buffer,
    })) as unknown as typeof fetch;
  });

  afterEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  });

  it("dedupes, scores, selects top N, downloads, and persists CompetitorAd + TestCreative rows", async () => {
    const competitor = await prisma.competitor.create({
      data: { name: "Acme", advertiserId: "adv-1" },
    });

    const results = await runResearch(
      {
        prisma,
        trendtrack: fakeTrendtrackClient(),
        storage: fakeStorageProvider(),
        topAdCount: 25,
        adsPerCompetitorFetch: 200,
        scoringWeights: { longevity: 0.4, reach: 0.3, growth: 0.2, duplication: 0.1 },
      },
      { competitorId: competitor.id },
    );

    expect(results).toHaveLength(1);
    expect(results[0].fetched).toBe(3);
    expect(results[0].deduped).toBe(2); // ad-1/ad-2 collapse via collationId
    expect(results[0].selected).toBe(2);
    expect(results[0].downloaded).toBe(2);

    const ads = await prisma.competitorAd.findMany({ include: { testCreative: true } });
    expect(ads).toHaveLength(2);

    const collapsed = ads.find((a) => a.collationId === "col-1")!;
    expect(collapsed.duplicateCount).toBe(2);
    expect(collapsed.headline).toBe("Headline");
    expect(collapsed.storageUrl).toContain("memory://");
    expect(collapsed.testCreative?.status).toBe("RESEARCHED");

    const jobRuns = await prisma.jobRun.findMany({ where: { jobType: "research" } });
    expect(jobRuns).toHaveLength(1);
    expect(jobRuns[0].status).toBe("SUCCESS");
  });

  it("only selects the configured TOP_AD_COUNT", async () => {
    const competitor = await prisma.competitor.create({
      data: { name: "Acme2", advertiserId: "adv-2" },
    });

    const results = await runResearch(
      {
        prisma,
        trendtrack: fakeTrendtrackClient(),
        storage: fakeStorageProvider(),
        topAdCount: 1,
        adsPerCompetitorFetch: 200,
        scoringWeights: { longevity: 0.4, reach: 0.3, growth: 0.2, duplication: 0.1 },
      },
      { competitorId: competitor.id },
    );

    expect(results[0].selected).toBe(1);
    const ads = await prisma.competitorAd.findMany();
    expect(ads).toHaveLength(1);
  });
});

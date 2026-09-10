import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestPrismaClient, resetTestDatabase } from "../testUtils/prismaTestClient.js";
import { publishTestCreative, type PublisherDeps } from "./publisher.js";
import type { MetaClient } from "./metaClient.js";

function fakeMetaClient(overrides: Partial<MetaClient> = {}): MetaClient {
  return {
    uploadImage: vi.fn().mockResolvedValue("hash_1"),
    uploadVideo: vi.fn().mockResolvedValue("vid_1"),
    createAdCreative: vi.fn().mockResolvedValue("creative_1"),
    createAd: vi.fn().mockResolvedValue("ad_1"),
    getAdEffectiveStatus: vi.fn().mockResolvedValue("ACTIVE"),
    getAdInsights: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as MetaClient;
}

const originalFetch = global.fetch;

describe("publishTestCreative", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("image-bytes").buffer,
    })) as unknown as typeof fetch;
  });

  afterEach(async () => {
    await resetTestDatabase(prisma);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  });

  async function seedApprovedRow() {
    const competitor = await prisma.competitor.create({ data: { name: "Acme", advertiserId: "a1" } });
    const ad = await prisma.competitorAd.create({
      data: { trendtrackAdId: "tt1", competitorId: competitor.id, thumbnailUrl: "https://x.com/thumb.jpg" },
    });
    const tc = await prisma.testCreative.create({
      data: {
        competitorAdId: ad.id,
        status: "APPROVED",
        creativeUrl: "https://cdn.example.com/our-ad.jpg",
        primaryText: "Our copy",
        headline: "Our headline",
        cta: "SHOP_NOW",
        landingPageUrl: "https://ours.com/lp",
        launchDate: "2026-09-15",
        launchTime: "10:00",
        timezone: "America/New_York",
        launchAt: new Date("2026-09-15T14:00:00.000Z"),
      },
    });
    return { competitor, ad, tc };
  }

  function deps(overrides: Partial<PublisherDeps> = {}): PublisherDeps {
    return {
      prisma,
      metaClient: fakeMetaClient(),
      pageId: "page1",
      adSetId: "set1",
      campaignId: "camp1",
      dryRun: false,
      ...overrides,
    };
  }

  it("dry run logs the plan and creates no Meta objects", async () => {
    const { tc } = await seedApprovedRow();
    const metaClient = fakeMetaClient();
    const outcome = await publishTestCreative(deps({ dryRun: true, metaClient }), tc.id);

    expect(outcome).toBe("dry_run");
    expect(metaClient.uploadImage).not.toHaveBeenCalled();
    expect(metaClient.createAd).not.toHaveBeenCalled();

    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.metaAdId).toBeNull();
    expect(updated.status).toBe("APPROVED");
  });

  it("publishes successfully: uploads creative, creates ad creative + ad, stores Meta IDs", async () => {
    const { tc } = await seedApprovedRow();
    const metaClient = fakeMetaClient();
    const outcome = await publishTestCreative(deps({ metaClient }), tc.id);

    expect(outcome).toBe("published");
    expect(metaClient.uploadImage).toHaveBeenCalledTimes(1);
    expect(metaClient.createAdCreative).toHaveBeenCalledTimes(1);
    expect(metaClient.createAd).toHaveBeenCalledTimes(1);

    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.metaAdId).toBe("ad_1");
    expect(updated.metaCreativeId).toBe("creative_1");
    expect(updated.status).toBe("SCHEDULED");
    expect(updated.publishLock).toBe("PUBLISHED");
  });

  it("never creates a duplicate Meta ad on a second call (idempotency)", async () => {
    const { tc } = await seedApprovedRow();
    const metaClient = fakeMetaClient();
    await publishTestCreative(deps({ metaClient }), tc.id);
    const secondOutcome = await publishTestCreative(deps({ metaClient }), tc.id);

    expect(secondOutcome).toBe("already_published");
    expect(metaClient.createAd).toHaveBeenCalledTimes(1);
    expect(metaClient.createAdCreative).toHaveBeenCalledTimes(1);
  });

  it("does not re-upload the creative if metaCreativeId already exists but metaAdId does not (crash recovery)", async () => {
    const { tc } = await seedApprovedRow();
    await prisma.testCreative.update({ where: { id: tc.id }, data: { metaCreativeId: "creative_existing" } });
    const metaClient = fakeMetaClient();

    const outcome = await publishTestCreative(deps({ metaClient }), tc.id);

    expect(outcome).toBe("published");
    expect(metaClient.uploadImage).not.toHaveBeenCalled();
    expect(metaClient.createAdCreative).not.toHaveBeenCalled();
    expect(metaClient.createAd).toHaveBeenCalledWith(
      expect.objectContaining({ creativeId: "creative_existing" }),
    );
  });

  it("marks the row ERROR with a sanitized reason when Meta API call fails", async () => {
    const { tc } = await seedApprovedRow();
    const metaClient = fakeMetaClient({
      createAdCreative: vi.fn().mockRejectedValue(new Error("access_token=SECRET123 invalid")),
    });

    const outcome = await publishTestCreative(deps({ metaClient }), tc.id);
    expect(outcome).toBe("error");

    const updated = await prisma.testCreative.findUniqueOrThrow({ where: { id: tc.id } });
    expect(updated.status).toBe("ERROR");
    expect(updated.errorReason).not.toContain("SECRET123");
    expect(updated.publishLock).toBe("FAILED");
    expect(updated.metaAdId).toBeNull();
  });

  it("blocks publishing when required fields are missing at publish time", async () => {
    const { tc } = await seedApprovedRow();
    await prisma.testCreative.update({ where: { id: tc.id }, data: { landingPageUrl: null } });
    const metaClient = fakeMetaClient();

    const outcome = await publishTestCreative(deps({ metaClient }), tc.id);
    expect(outcome).toBe("error");
    expect(metaClient.createAd).not.toHaveBeenCalled();
  });
});

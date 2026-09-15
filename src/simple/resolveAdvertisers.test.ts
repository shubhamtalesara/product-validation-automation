import { describe, expect, it, vi } from "vitest";
import { resolveCompetitorSources } from "./resolveAdvertisers.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import type { TrendtrackLookupResult, TrendtrackShopAdvertiser } from "../trendtrack/types.js";
import type { SimpleCompetitor } from "./config.js";

function fakeClient(overrides: {
  lookup?: (q: string, opts?: { type?: string }) => Promise<TrendtrackLookupResult[]>;
  getShopAdvertisers?: (shopId: string) => Promise<TrendtrackShopAdvertiser[]>;
}): TrendtrackClient {
  return {
    lookup: overrides.lookup ?? (async () => []),
    getShopAdvertisers: overrides.getShopAdvertisers ?? (async () => []),
  } as unknown as TrendtrackClient;
}

const competitor: SimpleCompetitor = { name: "Acme", landingPage: "https://acme.com/products" };

describe("resolveCompetitorSources", () => {
  it("uses the manual override for Meta without an extra lookup call for it, but still looks up shopIds for TikTok", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const client = fakeClient({ lookup });
    const result = await resolveCompetitorSources(client, {
      ...competitor,
      advertiserId: "manual-id-123",
    });
    expect(result).toEqual({ advertiserIds: ["manual-id-123"], source: "override", shopIds: ["shop-1"] });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("makes a single lookup call and derives both Meta advertiserIds and TikTok shopIds from it", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const getShopAdvertisers = vi.fn(async () => [
      { id: "adv-1", facebookPageId: "111", isPrimary: true },
      { id: "adv-2", facebookPageId: "222", isPrimary: false },
    ]);
    const client = fakeClient({ lookup, getShopAdvertisers });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result.source).toBe("lookup");
    expect(result.advertiserIds.sort()).toEqual(["111", "222"]);
    expect(result.shopIds).toEqual(["shop-1"]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("acme.com", { type: "auto", limit: 10 });
    expect(getShopAdvertisers).toHaveBeenCalledWith("shop-1");
  });

  it("pools every linked advertiser even when a shop has many of them", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const many = Array.from({ length: 34 }, (_, i) => ({
      id: `adv-${i}`,
      facebookPageId: `${1000 + i}`,
    }));
    const getShopAdvertisers = vi.fn(async () => many);
    const client = fakeClient({ lookup, getShopAdvertisers });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result.advertiserIds).toHaveLength(34);
    expect(result.source).toBe("lookup");
  });

  it("uses a direct advertiser match when the domain isn't an indexed shop, and returns no shopIds", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "advertiser",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        advertiser: { id: "999", facebookPageId: "999", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const client = fakeClient({ lookup });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result).toEqual({ advertiserIds: ["999"], source: "lookup", shopIds: [] });
  });

  it("tries every shop candidate in order, not just the first, until one has advertisers", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "fuzzy",
        matchField: "name",
        score: 0.7,
        shop: { id: "shop-empty", domain: "acme-fuzzy-match.com", name: "Acme Fuzzy" },
      },
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-real", domain: "acme.com", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const getShopAdvertisers = vi.fn(async (shopId: string) =>
      shopId === "shop-real" ? [{ id: "adv-1", facebookPageId: "111" }] : [],
    );
    const client = fakeClient({ lookup, getShopAdvertisers });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result.advertiserIds).toEqual(["111"]);
    expect(result.source).toBe("lookup");
    expect(result.shopIds).toEqual(["shop-empty", "shop-real"]);
    expect(getShopAdvertisers).toHaveBeenCalledWith("shop-empty");
    expect(getShopAdvertisers).toHaveBeenCalledWith("shop-real");
  });

  it("falls back to a direct advertiser match when the matched shop has no linked advertisers", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
      },
      {
        type: "advertiser",
        matchType: "fuzzy",
        matchField: "name",
        score: 0.8,
        advertiser: { id: "999", facebookPageId: "999", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const getShopAdvertisers = vi.fn(async () => []);
    const client = fakeClient({ lookup, getShopAdvertisers });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result.advertiserIds).toEqual(["999"]);
    expect(result.source).toBe("lookup");
  });

  it("falls back to a domain guess when lookup finds nothing usable, but still returns any shopIds found", async () => {
    const client = fakeClient({ lookup: async () => [] });
    const result = await resolveCompetitorSources(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess", shopIds: [] });
  });

  it("falls back to a domain guess with no shopIds when lookup throws", async () => {
    const client = fakeClient({
      lookup: async () => {
        throw new Error("network error");
      },
    });
    const result = await resolveCompetitorSources(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess", shopIds: [] });
  });

  it("returns any shopIds found even when no shop candidate has linked Meta advertisers", async () => {
    const lookup = vi.fn(async () => [
      {
        type: "shop",
        matchType: "exact",
        matchField: "domain",
        score: 1,
        shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
      },
    ] as TrendtrackLookupResult[]);
    const client = fakeClient({ lookup, getShopAdvertisers: async () => [] });

    const result = await resolveCompetitorSources(client, competitor);
    expect(result.source).toBe("domain-guess");
    expect(result.shopIds).toEqual(["shop-1"]);
  });
});

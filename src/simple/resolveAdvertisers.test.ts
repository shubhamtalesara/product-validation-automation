import { describe, expect, it, vi } from "vitest";
import { resolveAdvertiserIds, resolveShopIds } from "./resolveAdvertisers.js";
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

describe("resolveAdvertiserIds", () => {
  it("uses the manual override without calling lookup", async () => {
    const lookup = vi.fn();
    const client = fakeClient({ lookup });
    const result = await resolveAdvertiserIds(client, {
      ...competitor,
      advertiserId: "manual-id-123",
    });
    expect(result).toEqual({ advertiserIds: ["manual-id-123"], source: "override" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("makes a single auto lookup call, then pools every advertiser linked to the matched shop", async () => {
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

    const result = await resolveAdvertiserIds(client, competitor);
    expect(result.source).toBe("lookup");
    expect(result.advertiserIds.sort()).toEqual(["111", "222"]);
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

    const result = await resolveAdvertiserIds(client, competitor);
    expect(result.advertiserIds).toHaveLength(34);
    expect(result.source).toBe("lookup");
  });

  it("uses a direct advertiser match when the domain isn't an indexed shop", async () => {
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

    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["999"], source: "lookup" });
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

    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["111"], source: "lookup" });
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

    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["999"], source: "lookup" });
  });

  it("falls back to a domain guess when lookup finds nothing usable", async () => {
    const client = fakeClient({ lookup: async () => [] });
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess" });
  });

  it("falls back to a domain guess when lookup throws", async () => {
    const client = fakeClient({
      lookup: async () => {
        throw new Error("network error");
      },
    });
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess" });
  });
});

describe("resolveShopIds", () => {
  it("returns every distinct shop id found by lookup", async () => {
    const lookup = vi.fn(async () => [
      { type: "shop", matchType: "exact", matchField: "domain", score: 1, shop: { id: "shop-1", domain: "acme.com" } },
      { type: "shop", matchType: "fuzzy", matchField: "name", score: 0.7, shop: { id: "shop-2", domain: "acme.com" } },
    ] as TrendtrackLookupResult[]);
    const client = fakeClient({ lookup });

    const result = await resolveShopIds(client, competitor);
    expect(result).toEqual(["shop-1", "shop-2"]);
    expect(lookup).toHaveBeenCalledWith("acme.com", { type: "auto", limit: 10 });
  });

  it("returns an empty list when lookup finds no shop", async () => {
    const client = fakeClient({ lookup: async () => [] });
    const result = await resolveShopIds(client, competitor);
    expect(result).toEqual([]);
  });

  it("returns an empty list when lookup throws, instead of propagating the error", async () => {
    const client = fakeClient({
      lookup: async () => {
        throw new Error("network error");
      },
    });
    const result = await resolveShopIds(client, competitor);
    expect(result).toEqual([]);
  });
});

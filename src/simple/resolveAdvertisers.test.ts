import { describe, expect, it, vi } from "vitest";
import { resolveAdvertiserIds } from "./resolveAdvertisers.js";
import type { TrendtrackClient } from "../trendtrack/client.js";
import type { SimpleCompetitor } from "./config.js";

function fakeClient(lookupImpl: (q: string) => Promise<Record<string, unknown>>): TrendtrackClient {
  return { lookup: lookupImpl } as unknown as TrendtrackClient;
}

const competitor: SimpleCompetitor = { name: "Acme", landingPage: "https://acme.com/products" };

describe("resolveAdvertiserIds", () => {
  it("uses the manual override without calling lookup", async () => {
    const lookup = vi.fn();
    const client = fakeClient(lookup);
    const result = await resolveAdvertiserIds(client, {
      ...competitor,
      advertiserId: "manual-id-123",
    });
    expect(result).toEqual({ advertiserIds: ["manual-id-123"], source: "override" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("extracts a single advertiser id from a nested advertiser record", async () => {
    const client = fakeClient(async () => ({
      advertiser: { id: "999", facebookPageId: "999", name: "Acme", liveAdsCount: 12 },
    }));
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result.source).toBe("lookup");
    expect(result.advertiserIds).toEqual(["999"]);
  });

  it("extracts multiple advertiser ids when a brand has more than one page", async () => {
    const client = fakeClient(async () => ({
      advertisers: [
        { id: "111", facebookPageId: "111", liveAdsCount: 5 },
        { id: "222", facebookPageId: "222", liveAdsCount: 3 },
      ],
    }));
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result.source).toBe("lookup");
    expect(result.advertiserIds.sort()).toEqual(["111", "222"]);
  });

  it("extracts an id from a key that looks like an advertiser id even without a nested object", async () => {
    const client = fakeClient(async () => ({ advertiserId: "555" }));
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result.advertiserIds).toEqual(["555"]);
  });

  it("falls back to a domain guess when lookup returns nothing usable", async () => {
    const client = fakeClient(async () => ({ status: "no_match" }));
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess" });
  });

  it("falls back to a domain guess when lookup throws", async () => {
    const client = fakeClient(async () => {
      throw new Error("network error");
    });
    const result = await resolveAdvertiserIds(client, competitor);
    expect(result).toEqual({ advertiserIds: ["acme.com"], source: "domain-guess" });
  });
});

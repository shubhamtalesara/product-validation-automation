import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrendtrackClient } from "./client.js";
import { PermanentError, RetryableError } from "../lib/errors.js";

function mockFetchOnce(status: number, body: unknown, ok = status < 400) {
  return {
    ok,
    status,
    statusText: "status",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("TrendtrackClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists advertiser ads with query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { data: [{ id: "ad1" }], total: 1, hasMore: false }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const result = await client.listAdvertiserAds("adv1", { status: "active", limit: 10 });

    expect(result.data).toHaveLength(1);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v1/advertisers/adv1/ads");
    expect(calledUrl.searchParams.get("status")).toBe("active");
    expect(calledUrl.searchParams.get("limit")).toBe("10");
  });

  it("paginates through multiple pages until hasMore is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockFetchOnce(200, { data: [{ id: "a" }, { id: "b" }], hasMore: true }),
      )
      .mockResolvedValueOnce(mockFetchOnce(200, { data: [{ id: "c" }], hasMore: false }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const ids: string[] = [];
    for await (const ad of client.paginateAdvertiserAds("adv1", { limit: 2 }, 10)) {
      ids.push(ad.id);
    }

    expect(ids).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops pagination at maxRecords", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchOnce(200, { data: [{ id: "a" }, { id: "b" }], hasMore: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const ids: string[] = [];
    for await (const ad of client.paginateAdvertiserAds("adv1", { limit: 2 }, 3)) {
      ids.push(ad.id);
    }
    expect(ids).toHaveLength(3);
  });

  it("fetches ad detail and unwraps the { requestId, data } envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { requestId: "req1", data: { id: "ad1", daysRunning: 5 } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const detail = await client.getAdDetail("ad1");
    expect(detail.daysRunning).toBe(5);
    expect(detail.id).toBe("ad1");
  });

  it("fetches media url and unwraps the { requestId, data } envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, {
        requestId: "req1",
        data: { mediaType: "video", url: "u", mediaUrl: "u" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const media = await client.getAdMediaUrl("ad1");
    expect(media.mediaType).toBe("video");
  });

  it("resolves lookup results and passes through type/limit query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, {
        requestId: "req-lookup",
        data: [
          {
            type: "shop",
            matchType: "exact",
            matchField: "domain",
            score: 1,
            shop: { id: "shop-1", domain: "acme.com", name: "Acme" },
          },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const results = await client.lookup("acme.com", { type: "shop", limit: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].shop?.id).toBe("shop-1");
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("q")).toBe("acme.com");
    expect(calledUrl.searchParams.get("type")).toBe("shop");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });

  it("fetches shop advertisers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, {
        requestId: "req-adv",
        data: [
          { id: "adv-1", facebookPageId: "111", isPrimary: true },
          { id: "adv-2", facebookPageId: "222", isPrimary: false },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const advertisers = await client.getShopAdvertisers("shop-1");

    expect(advertisers).toHaveLength(2);
    expect(advertisers.map((a) => a.facebookPageId)).toEqual(["111", "222"]);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v1/shops/shop-1/advertisers");
  });

  it("creates an ad share link via POST and unwraps the envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, {
        requestId: "req-share",
        data: { adId: "ad1", id: "share-1", shareUrl: "https://trendtrack.io/share/ad1" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    const share = await client.createAdShare("ad1");

    expect(share.shareUrl).toBe("https://trendtrack.io/share/ad1");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v1/ads/ad1/share");
  });

  it("throws PermanentError on 4xx without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(404, { message: "not found" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    await expect(client.getAdDetail("missing")).rejects.toBeInstanceOf(PermanentError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and eventually throws RetryableError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(503, { message: "down" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TrendtrackClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    await expect(client.getAdDetail("ad1")).rejects.toBeInstanceOf(RetryableError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  }, 20000);
});

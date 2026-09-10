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

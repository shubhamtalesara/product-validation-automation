import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaClient } from "./metaClient.js";
import { PermanentError, RetryableError } from "../lib/errors.js";

function jsonResponse(status: number, body: unknown, ok = status < 400): Response {
  return {
    ok,
    status,
    statusText: "status",
    json: async () => body,
  } as Response;
}

function newClient() {
  return new MetaClient({ accessToken: "tok", adAccountId: "123", apiVersion: "v21.0" });
}

describe("MetaClient", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("prefixes the ad account id with act_ when missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { effective_status: "ACTIVE" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await newClient().getAdEffectiveStatus("ad1");
    expect(fetchMock.mock.calls[0][0]).toContain("/ad1?");
  });

  it("uploadImage extracts the returned hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { images: { "file.jpg": { hash: "abc123", url: "http://x" } } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const hash = await newClient().uploadImage(Buffer.from("bytes"), "file.jpg");
    expect(hash).toBe("abc123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/act_123/adimages");
    expect(init.method).toBe("POST");
  });

  it("uploadVideo extracts the returned video id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "vid_1" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const id = await newClient().uploadVideo(Buffer.from("bytes"), "file.mp4");
    expect(id).toBe("vid_1");
  });

  it("createAdCreative builds link_data object_story_spec for image ads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "creative_1" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const id = await newClient().createAdCreative({
      name: "Test Ad",
      pageId: "page1",
      mediaKind: "image",
      imageHash: "hash1",
      primaryText: "copy",
      headline: "headline",
      landingPageUrl: "https://x.com",
      ctaType: "SHOP_NOW",
    });

    expect(id).toBe("creative_1");
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    const spec = JSON.parse(body.get("object_story_spec")!);
    expect(spec.link_data.image_hash).toBe("hash1");
    expect(spec.link_data.call_to_action.type).toBe("SHOP_NOW");
    expect(spec.link_data.call_to_action.value.link).toBe("https://x.com");
  });

  it("createAdCreative builds video_data object_story_spec for video ads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "creative_2" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await newClient().createAdCreative({
      name: "Test Ad",
      pageId: "page1",
      mediaKind: "video",
      videoId: "vid_1",
      primaryText: "copy",
      headline: "headline",
      landingPageUrl: "https://x.com",
      ctaType: "SHOP_NOW",
    });

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    const spec = JSON.parse(body.get("object_story_spec")!);
    expect(spec.video_data.video_id).toBe("vid_1");
  });

  it("createAd sends adset_id, creative reference, and status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "ad_1" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const id = await newClient().createAd({
      name: "Test Ad",
      adSetId: "set_1",
      creativeId: "creative_1",
      status: "ACTIVE",
    });

    expect(id).toBe("ad_1");
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("adset_id")).toBe("set_1");
    expect(JSON.parse(body.get("creative")!)).toEqual({ creative_id: "creative_1" });
    expect(body.get("status")).toBe("ACTIVE");
  });

  it("parses insights including purchase conversions and value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            spend: "10.5",
            impressions: "1000",
            clicks: "20",
            ctr: "0.02",
            cpc: "0.5",
            cpm: "10.5",
            actions: [{ action_type: "purchase", value: "3" }],
            action_values: [{ action_type: "purchase", value: "150" }],
            date_start: "2026-09-01",
            date_stop: "2026-09-01",
          },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const insights = await newClient().getAdInsights("ad_1");
    expect(insights?.spend).toBe(10.5);
    expect(insights?.conversions).toBe(3);
    expect(insights?.conversionValue).toBe(150);
  });

  it("returns null insights when Meta has no data yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await newClient().getAdInsights("ad_1")).toBeNull();
  });

  it("classifies a 400 validation error as permanent (no retry)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: { message: "Invalid parameter", code: 100 } }, false));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(newClient().getAdEffectiveStatus("bad")).rejects.toBeInstanceOf(PermanentError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies a 500 error as retryable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: { message: "Server error" } }, false));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(newClient().getAdEffectiveStatus("ad1")).rejects.toBeInstanceOf(RetryableError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  }, 20000);
});

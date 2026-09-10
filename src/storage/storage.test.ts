import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageProvider } from "./localStorageProvider.js";
import { buildCompetitorAssetKey, extensionForMediaType } from "./types.js";
import { downloadAndStoreMedia } from "./downloadMedia.js";

describe("buildCompetitorAssetKey / extensionForMediaType", () => {
  it("builds deterministic keys", () => {
    expect(buildCompetitorAssetKey("comp1", "ad1", "mp4")).toBe("competitor/comp1/ad1.mp4");
  });

  it("infers extension from media type when no filename given", () => {
    expect(extensionForMediaType("video")).toBe("mp4");
    expect(extensionForMediaType("image")).toBe("jpg");
  });

  it("prefers filename extension when present", () => {
    expect(extensionForMediaType("video", "clip.mov")).toBe("mov");
  });
});

describe("LocalStorageProvider", () => {
  let dir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "storage-test-"));
    provider = new LocalStorageProvider(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores and reports existence deterministically", async () => {
    const key = "competitor/c1/ad1.mp4";
    expect(await provider.exists(key)).toBe(false);
    const result = await provider.store(key, Buffer.from("hello world"));
    expect(result.storageUrl).toContain(key);
    expect(result.bytes).toBe(11);
    expect(await provider.exists(key)).toBe(true);
  });
});

describe("downloadAndStoreMedia", () => {
  let dir: string;
  let provider: LocalStorageProvider;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "storage-test-"));
    provider = new LocalStorageProvider(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("downloads media once and skips a second call for the same ad", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "video/mp4" }),
      arrayBuffer: async () => new TextEncoder().encode("video-bytes").buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const params = {
      competitorId: "comp1",
      trendtrackAdId: "ad1",
      mediaUrl: "https://cdn.example.com/video.mp4",
      mediaType: "video",
    };

    const first = await downloadAndStoreMedia(provider, params);
    expect(first.skipped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await downloadAndStoreMedia(provider, params);
    expect(second.skipped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not called again
  });
});

import { describe, expect, it } from "vitest";
import { computeFingerprint, dedupeCreatives, type DedupCandidate } from "./dedupe.js";

function candidate(overrides: Partial<DedupCandidate> & { id: string }): DedupCandidate {
  return {
    advertiserId: "adv1",
    collationId: null,
    mediaUrl: null,
    headline: null,
    primaryText: null,
    mediaHash: null,
    reach: 0,
    daysRunning: 0,
    ...overrides,
  };
}

describe("dedupeCreatives", () => {
  it("groups ads that share the same collationId", () => {
    const ads = [
      candidate({ id: "a1", collationId: "col-1", reach: 100 }),
      candidate({ id: "a2", collationId: "col-1", reach: 500 }),
      candidate({ id: "a3", collationId: "col-1", reach: 200 }),
    ];
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicateCount).toBe(3);
    expect(groups[0].representative.id).toBe("a2"); // highest reach
  });

  it("does not collapse a single creative appearing as 8 Meta ads into 8 slots", () => {
    const ads = Array.from({ length: 8 }, (_, i) =>
      candidate({ id: `ad-${i}`, collationId: "shared", reach: i * 10 }),
    );
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicateCount).toBe(8);
  });

  it("falls back to media/copy fingerprint when collationId is missing", () => {
    const ads = [
      candidate({
        id: "b1",
        mediaUrl: "https://cdn.example.com/video.mp4?token=abc",
        headline: "Save 20% Today!",
        primaryText: "Limited time offer on our best seller.",
      }),
      candidate({
        id: "b2",
        mediaUrl: "https://cdn.example.com/video.mp4?token=xyz",
        headline: "save 20% today",
        primaryText: "limited time offer on our best seller",
      }),
    ];
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicateCount).toBe(2);
  });

  it("does not collapse genuinely different creative variants", () => {
    const ads = [
      candidate({
        id: "c1",
        mediaUrl: "https://cdn.example.com/video-a.mp4",
        headline: "Headline A",
        primaryText: "Copy A",
      }),
      candidate({
        id: "c2",
        mediaUrl: "https://cdn.example.com/video-b.mp4",
        headline: "Headline B",
        primaryText: "Copy B",
      }),
    ];
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(2);
  });

  it("uses mediaHash fingerprint when available and no collationId", () => {
    const ads = [
      candidate({ id: "d1", mediaHash: "hash123", mediaUrl: "https://a.com/1.mp4" }),
      candidate({ id: "d2", mediaHash: "hash123", mediaUrl: "https://b.com/2.mp4" }),
    ];
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(1);
  });

  it("computeFingerprint is stable and deterministic", () => {
    const a = candidate({ id: "e1", collationId: "x" });
    const b = candidate({ id: "e2", collationId: "x" });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("scopes fallback fingerprint per advertiser", () => {
    const ads = [
      candidate({ id: "f1", advertiserId: "advA", mediaUrl: "https://a.com/1.mp4", headline: "H" }),
      candidate({ id: "f2", advertiserId: "advB", mediaUrl: "https://a.com/1.mp4", headline: "H" }),
    ];
    const groups = dedupeCreatives(ads);
    expect(groups).toHaveLength(2);
  });
});

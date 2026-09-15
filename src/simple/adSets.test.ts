import { describe, expect, it } from "vitest";
import { clubIntoAdSets } from "./adSets.js";

interface FakeAd {
  id: string;
  mediaType: string;
  platform?: string;
}

function ad(id: string, mediaType: string, platform?: string): FakeAd {
  return { id, mediaType, ...(platform ? { platform } : {}) };
}

describe("clubIntoAdSets", () => {
  it("never mixes videos and statics within one set", () => {
    const ads = [ad("v1", "video"), ad("s1", "image"), ad("v2", "video"), ad("s2", "image")];
    const groups = clubIntoAdSets(ads);
    for (const group of groups) {
      const types = new Set(group.ads.map((a) => a.mediaType));
      expect(types.size).toBe(1);
    }
  });

  it("caps each set at maxPerSet ads", () => {
    const ads = Array.from({ length: 12 }, (_, i) => ad(`v${i}`, "video"));
    const groups = clubIntoAdSets(ads, 5);
    expect(groups.map((g) => g.ads.length)).toEqual([5, 5, 2]);
  });

  it("gives a leftover handful its own set instead of merging formats", () => {
    const ads = [ad("v1", "video"), ad("s1", "image"), ad("s2", "image")];
    const groups = clubIntoAdSets(ads, 5);
    expect(groups).toHaveLength(2);
    expect(groups[0].ads).toEqual([ad("v1", "video")]);
    expect(groups[1].ads).toEqual([ad("s1", "image"), ad("s2", "image")]);
  });

  it("treats carousel/unknown media types as static, not video", () => {
    const ads = [ad("c1", "carousel"), ad("u1", "")];
    const groups = clubIntoAdSets(ads, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toContain("Static");
  });

  it("returns no groups for an empty input", () => {
    expect(clubIntoAdSets([])).toEqual([]);
  });

  it("labels sets sequentially across both formats", () => {
    const ads = Array.from({ length: 6 }, (_, i) => ad(`v${i}`, "video")).concat(
      Array.from({ length: 6 }, (_, i) => ad(`s${i}`, "image")),
    );
    const groups = clubIntoAdSets(ads, 5);
    expect(groups.map((g) => g.label)).toEqual([
      "Ad Set 1 (Video)",
      "Ad Set 2 (Video)",
      "Ad Set 3 (Static)",
      "Ad Set 4 (Static)",
    ]);
  });

  it("never mixes platforms within one set, even when both are videos", () => {
    const ads = [
      ad("m1", "video", "Meta"),
      ad("t1", "video", "TikTok"),
      ad("m2", "video", "Meta"),
      ad("t2", "video", "TikTok"),
    ];
    const groups = clubIntoAdSets(ads);
    for (const group of groups) {
      const platforms = new Set(group.ads.map((a) => a.platform));
      expect(platforms.size).toBe(1);
    }
  });

  it("labels platform-tagged sets with the platform name, Meta before TikTok", () => {
    const ads = [ad("t1", "video", "TikTok"), ad("m1", "video", "Meta")];
    const groups = clubIntoAdSets(ads);
    expect(groups.map((g) => g.label)).toEqual(["Ad Set 1 (Meta Video)", "Ad Set 2 (TikTok Video)"]);
  });

  it("keeps the untagged label format when no ad carries a platform", () => {
    const ads = [ad("v1", "video"), ad("s1", "image")];
    const groups = clubIntoAdSets(ads);
    expect(groups.map((g) => g.label)).toEqual(["Ad Set 1 (Video)", "Ad Set 2 (Static)"]);
  });
});

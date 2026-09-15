const MAX_ADS_PER_SET = 5;

export interface AdSetGroup<T> {
  label: string;
  ads: T[];
}

/** Fixed display order for known platforms; anything else (or no platform) sorts after these. */
const PLATFORM_ORDER = ["Meta", "TikTok"];

/**
 * Clubs the selected creatives into ready-to-launch ad sets: at most
 * `maxPerSet` ads per set, videos are never mixed with statics in the same
 * set (ad sets test cleanest when every creative in them shares a format),
 * and - now that ads can come from more than one ad platform - a set never
 * mixes platforms either, since a Meta ad and a TikTok ad can't actually be
 * launched into the same ad set regardless of format. Any leftover handful
 * that doesn't fill a full set still becomes its own (smaller) set rather
 * than being merged across formats or platforms.
 */
export function clubIntoAdSets<T extends { mediaType?: string; platform?: string }>(
  ads: T[],
  maxPerSet: number = MAX_ADS_PER_SET,
): AdSetGroup<T>[] {
  const platforms = [...new Set(ads.map((ad) => ad.platform ?? ""))].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a);
    const bi = PLATFORM_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const groups: AdSetGroup<T>[] = [];
  let setNumber = 1;
  for (const platform of platforms) {
    const platformAds = ads.filter((ad) => (ad.platform ?? "") === platform);
    const videos = platformAds.filter((ad) => ad.mediaType === "video");
    const statics = platformAds.filter((ad) => ad.mediaType !== "video");

    for (const [format, list] of [
      ["Video", videos],
      ["Static", statics],
    ] as const) {
      for (let i = 0; i < list.length; i += maxPerSet) {
        const label = platform ? `Ad Set ${setNumber} (${platform} ${format})` : `Ad Set ${setNumber} (${format})`;
        groups.push({ label, ads: list.slice(i, i + maxPerSet) });
        setNumber += 1;
      }
    }
  }
  return groups;
}

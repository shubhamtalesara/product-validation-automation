const MAX_ADS_PER_SET = 5;

export interface AdSetGroup<T> {
  label: string;
  ads: T[];
}

/**
 * Clubs the selected creatives into ready-to-launch Facebook ad sets: at
 * most `maxPerSet` ads per set, and videos are never mixed with statics in
 * the same set (Meta ad sets test cleanest when every creative in them
 * shares a format). Any leftover handful that doesn't fill a full set - say
 * 2 statics after all the 5-packs are full - still becomes its own
 * (smaller) set rather than being merged across formats.
 */
export function clubIntoAdSets<T extends { mediaType?: string }>(
  ads: T[],
  maxPerSet: number = MAX_ADS_PER_SET,
): AdSetGroup<T>[] {
  const videos = ads.filter((ad) => ad.mediaType === "video");
  const statics = ads.filter((ad) => ad.mediaType !== "video");

  const groups: AdSetGroup<T>[] = [];
  let setNumber = 1;
  for (const [format, list] of [
    ["Video", videos],
    ["Static", statics],
  ] as const) {
    for (let i = 0; i < list.length; i += maxPerSet) {
      groups.push({
        label: `Ad Set ${setNumber} (${format})`,
        ads: list.slice(i, i + maxPerSet),
      });
      setNumber += 1;
    }
  }
  return groups;
}

const MAX_ADS_PER_SET = 5;

export interface AdSetGroup<T> {
  label: string;
  ads: T[];
}

/** Fixed display order for known platforms; anything else (or no platform) sorts after these. */
const PLATFORM_ORDER = ["Meta", "TikTok"];

/** Distinct, non-empty values in `preferredOrder` first (in that order), then everything else alphabetically. Empty string always sorts first (so a set of all-untagged ads keeps its old, dimension-free label). */
function distinctSorted(values: string[], preferredOrder: string[] = []): string[] {
  const unique = [...new Set(values)];
  return unique.sort((a, b) => {
    if (a === "" || b === "") return a === b ? 0 : a === "" ? -1 : 1;
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * Clubs the selected creatives into ready-to-launch ad sets, splitting by
 * platform, angle, offer, and media format (in that order) - at most
 * `maxPerSet` ads per set, and a set never mixes any of those four
 * dimensions (a Meta ad and a TikTok ad can't launch into the same ad set
 * regardless of format; an Erectile Dysfunction ad and a Nerve Pain ad
 * shouldn't test together even if both are Meta videos). Any leftover
 * handful that doesn't fill a full set still becomes its own (smaller) set
 * rather than being merged across dimensions.
 *
 * Angle/offer are opt-in (see textClassifier.ts / competitors.simple.json)
 * - when an ad's `angle`/`offer` is "" (not configured), that dimension is
 * omitted from its label entirely, so ad sets look exactly like they did
 * before this feature existed until you actually configure angles/offers.
 */
export function clubIntoAdSets<T extends { mediaType?: string; platform?: string; angle?: string; offer?: string }>(
  ads: T[],
  maxPerSet: number = MAX_ADS_PER_SET,
): AdSetGroup<T>[] {
  const groups: AdSetGroup<T>[] = [];
  let setNumber = 1;

  const platforms = distinctSorted(ads.map((ad) => ad.platform ?? ""), PLATFORM_ORDER);
  for (const platform of platforms) {
    const platformAds = ads.filter((ad) => (ad.platform ?? "") === platform);

    const angles = distinctSorted(platformAds.map((ad) => ad.angle ?? ""));
    for (const angle of angles) {
      const angleAds = platformAds.filter((ad) => (ad.angle ?? "") === angle);

      const offers = distinctSorted(angleAds.map((ad) => ad.offer ?? ""));
      for (const offer of offers) {
        const offerAds = angleAds.filter((ad) => (ad.offer ?? "") === offer);

        const videos = offerAds.filter((ad) => ad.mediaType === "video");
        const statics = offerAds.filter((ad) => ad.mediaType !== "video");

        for (const [format, list] of [
          ["Video", videos],
          ["Static", statics],
        ] as const) {
          for (let i = 0; i < list.length; i += maxPerSet) {
            const labelParts = [platform, angle, offer, format].filter(Boolean);
            const label = `Ad Set ${setNumber} (${labelParts.join(" / ")})`;
            groups.push({ label, ads: list.slice(i, i + maxPerSet) });
            setNumber += 1;
          }
        }
      }
    }
  }
  return groups;
}

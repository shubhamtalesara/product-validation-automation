export interface StoredAsset {
  storageUrl: string;
  hash: string;
  bytes: number;
}

export interface StorageProvider {
  /**
   * Persists a downloaded asset at a deterministic key (e.g.
   * `competitor/{competitorId}/{trendtrackAdId}.mp4`) and returns where it
   * ended up plus a content hash for deduplication.
   */
  store(key: string, data: Buffer, contentType?: string): Promise<StoredAsset>;

  /** True if an asset already exists at this key, so callers can skip re-downloading. */
  exists(key: string): Promise<boolean>;

  /** Public/resolvable URL (or local path) for a previously stored key. */
  resolveUrl(key: string): string;
}

export function buildCompetitorAssetKey(
  competitorId: string,
  trendtrackAdId: string,
  extension: string,
): string {
  const cleanExt = extension.replace(/^\./, "");
  return `competitor/${competitorId}/${trendtrackAdId}.${cleanExt}`;
}

export function extensionForMediaType(mediaType: string | undefined, filename?: string): string {
  if (filename && filename.includes(".")) {
    return filename.split(".").pop() as string;
  }
  switch ((mediaType ?? "").toLowerCase()) {
    case "video":
      return "mp4";
    case "image":
      return "jpg";
    case "carousel":
      return "json";
    default:
      return "bin";
  }
}

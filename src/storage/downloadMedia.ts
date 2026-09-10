import { createLogger } from "../lib/logger.js";
import { RetryableError, toSanitizedMessage } from "../lib/errors.js";
import { buildCompetitorAssetKey, extensionForMediaType, type StorageProvider } from "./types.js";

const logger = createLogger("storage");

export interface DownloadMediaParams {
  competitorId: string;
  trendtrackAdId: string;
  mediaUrl: string;
  mediaType?: string;
  filename?: string;
}

/**
 * Downloads a competitor creative asset and persists it under a deterministic
 * key. Skips the network fetch entirely if the asset already exists in
 * storage, so re-running research never re-downloads the same media.
 */
export async function downloadAndStoreMedia(
  storage: StorageProvider,
  params: DownloadMediaParams,
): Promise<{ storageUrl: string; hash: string; skipped: boolean }> {
  const extension = extensionForMediaType(params.mediaType, params.filename);
  const key = buildCompetitorAssetKey(params.competitorId, params.trendtrackAdId, extension);

  if (await storage.exists(key)) {
    logger.debug("Asset already stored, skipping download", { key });
    return { storageUrl: storage.resolveUrl(key), hash: "", skipped: true };
  }

  let response: Response;
  try {
    response = await fetch(params.mediaUrl);
  } catch (err) {
    throw new RetryableError(`Failed to download media: ${toSanitizedMessage(err)}`);
  }
  if (!response.ok) {
    throw new RetryableError(`Failed to download media: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? undefined;
  const stored = await storage.store(key, buffer, contentType);
  logger.info("Downloaded competitor creative", { key, bytes: stored.bytes });
  return { storageUrl: stored.storageUrl, hash: stored.hash, skipped: false };
}

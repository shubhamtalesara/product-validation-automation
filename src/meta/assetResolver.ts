import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PermanentError, RetryableError, toSanitizedMessage } from "../lib/errors.js";
import type { MetaMediaKind } from "./types.js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm"]);

export function inferMediaKind(url: string): MetaMediaKind {
  const ext = url.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(ext) ? "video" : "image";
}

/**
 * Resolves the actual bytes of OUR adapted creative asset, wherever it lives
 * (local disk from LocalStorageProvider, S3, or a plain HTTP(S) URL a human
 * pasted into the sheet).
 */
export async function resolveCreativeBytes(url: string): Promise<Buffer> {
  if (url.startsWith("file://")) {
    try {
      return await readFile(fileURLToPath(url));
    } catch (err) {
      throw new PermanentError(`Could not read local creative file: ${toSanitizedMessage(err)}`);
    }
  }
  if (url.startsWith("s3://")) {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const [, , bucket, ...keyParts] = url.split("/");
    const client = new S3Client({});
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: keyParts.join("/") }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new PermanentError(`S3 object body was empty for ${url}`);
    return Buffer.from(bytes);
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new RetryableError(`Failed to fetch creative asset: ${toSanitizedMessage(err)}`);
    }
    if (!response.ok) {
      throw new RetryableError(`Failed to fetch creative asset: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new PermanentError(`Unsupported creative asset URL scheme: ${url}`);
}

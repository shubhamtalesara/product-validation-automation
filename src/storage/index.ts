import { env } from "../config/env.js";
import { LocalStorageProvider } from "./localStorageProvider.js";
import { S3StorageProvider } from "./s3StorageProvider.js";
import type { StorageProvider } from "./types.js";

export * from "./types.js";
export { LocalStorageProvider } from "./localStorageProvider.js";
export { S3StorageProvider } from "./s3StorageProvider.js";

let provider: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  if (env.STORAGE_PROVIDER === "s3") {
    provider = new S3StorageProvider({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      endpoint: env.S3_ENDPOINT,
    });
  } else {
    provider = new LocalStorageProvider(env.LOCAL_STORAGE_DIR);
  }
  return provider;
}

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { sha256Hex } from "../lib/hash.js";
import type { StorageProvider, StoredAsset } from "./types.js";

export interface S3StorageProviderOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageProviderOptions) {
    this.bucket = options.bucket;
    const config: S3ClientConfig = {
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };
    if (options.endpoint) {
      config.endpoint = options.endpoint;
      config.forcePathStyle = true;
    }
    this.client = new S3Client(config);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async store(key: string, data: Buffer, contentType?: string): Promise<StoredAsset> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    return {
      storageUrl: this.resolveUrl(key),
      hash: sha256Hex(data),
      bytes: data.byteLength,
    };
  }

  resolveUrl(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }
}

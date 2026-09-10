import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sha256Hex } from "../lib/hash.js";
import type { StorageProvider, StoredAsset } from "./types.js";

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  private pathFor(key: string): string {
    return join(this.rootDir, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async store(key: string, data: Buffer): Promise<StoredAsset> {
    const filePath = this.pathFor(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return {
      storageUrl: this.resolveUrl(key),
      hash: sha256Hex(data),
      bytes: data.byteLength,
    };
  }

  resolveUrl(key: string): string {
    return `file://${this.pathFor(key)}`;
  }

  async readBack(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }
}

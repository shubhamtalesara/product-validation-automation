import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ readFile: (...args: unknown[]) => readFileMock(...args) }));

const { loadSimpleConfig } = await import("./config.js");

beforeEach(() => {
  readFileMock.mockReset();
});

function configWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    competitors: [{ name: "Acme", landingPage: "https://acme.com" }],
    ...overrides,
  });
}

describe("loadSimpleConfig", () => {
  it("defaults angles and offers to empty arrays when omitted", async () => {
    readFileMock.mockResolvedValue(configWith({}));
    const config = await loadSimpleConfig();
    expect(config.angles).toEqual([]);
    expect(config.offers).toEqual([]);
  });

  it("parses configured angles and offers", async () => {
    readFileMock.mockResolvedValue(
      configWith({
        angles: [{ name: "Erectile Dysfunction", keywords: ["erectile", "erection"] }],
        offers: [{ name: "BOGO", keywords: ["buy one get one"] }],
      }),
    );
    const config = await loadSimpleConfig();
    expect(config.angles).toEqual([{ name: "Erectile Dysfunction", keywords: ["erectile", "erection"] }]);
    expect(config.offers).toEqual([{ name: "BOGO", keywords: ["buy one get one"] }]);
  });

  it("rejects an angle rule with no keywords", async () => {
    readFileMock.mockResolvedValue(configWith({ angles: [{ name: "Empty", keywords: [] }] }));
    await expect(loadSimpleConfig()).rejects.toThrow("invalid");
  });

  it("rejects a competitor list with no entries", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ competitors: [] }));
    await expect(loadSimpleConfig()).rejects.toThrow("invalid");
  });

  it("throws a clear error when the file can't be read", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    await expect(loadSimpleConfig()).rejects.toThrow("Could not find competitors.simple.json");
  });
});

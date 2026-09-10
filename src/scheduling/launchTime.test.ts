import { describe, expect, it } from "vitest";
import { InvalidLaunchTimeError, isValidTimezone, resolveLaunchAt } from "./launchTime.js";

describe("resolveLaunchAt", () => {
  it("converts a New York launch time to the correct UTC instant (EDT, UTC-4)", () => {
    const result = resolveLaunchAt("2026-09-15", "10:00", "America/New_York");
    expect(result.toISOString()).toBe("2026-09-15T14:00:00.000Z");
  });

  it("converts a Tokyo launch time to the correct UTC instant", () => {
    const result = resolveLaunchAt("2026-09-15", "10:00", "Asia/Tokyo");
    expect(result.toISOString()).toBe("2026-09-15T01:00:00.000Z");
  });

  it("never silently assumes UTC when timezone is missing", () => {
    expect(() => resolveLaunchAt("2026-09-15", "10:00", "")).toThrow(InvalidLaunchTimeError);
  });

  it("throws on missing launch date", () => {
    expect(() => resolveLaunchAt("", "10:00", "America/New_York")).toThrow(InvalidLaunchTimeError);
  });

  it("defaults to midnight when launch time is omitted", () => {
    const result = resolveLaunchAt("2026-09-15", "", "UTC");
    expect(result.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("throws a clear error on an invalid timezone", () => {
    expect(() => resolveLaunchAt("2026-09-15", "10:00", "Not/AZone")).toThrow(
      InvalidLaunchTimeError,
    );
  });

  it("validates timezone names", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isOnOrAfter, resolveCreatedDate } from "./createdDate.js";

describe("resolveCreatedDate", () => {
  it("prefers the real observed date over back-calculating from daysRunning", () => {
    expect(resolveCreatedDate("2026-04-10T00:00:00.000Z", 9)).toBe("2026-04-10");
  });

  it("falls back to back-calculating from daysRunning when the real date is missing", () => {
    const now = new Date("2026-09-17T12:00:00.000Z");
    expect(resolveCreatedDate(undefined, 10, now)).toBe("2026-09-07");
  });

  it("falls back to back-calculating when the real date is an empty string", () => {
    const now = new Date("2026-09-17T00:00:00.000Z");
    expect(resolveCreatedDate("", 30, now)).toBe("2026-08-18");
  });

  it("falls back to back-calculating when the real date fails to parse", () => {
    const now = new Date("2026-09-17T00:00:00.000Z");
    expect(resolveCreatedDate("not-a-date", 5, now)).toBe("2026-09-12");
  });

  it("returns an empty string when neither a real date nor daysRunning is available", () => {
    expect(resolveCreatedDate(undefined, undefined)).toBe("");
    expect(resolveCreatedDate(undefined, null)).toBe("");
  });
});

describe("isOnOrAfter", () => {
  it("returns true when the date is on the cutoff", () => {
    expect(isOnOrAfter("2026-06-01", "2026-06-01")).toBe(true);
  });

  it("returns true when the date is after the cutoff", () => {
    expect(isOnOrAfter("2026-07-15", "2026-06-01")).toBe(true);
  });

  it("returns false when the date is before the cutoff", () => {
    expect(isOnOrAfter("2026-05-31", "2026-06-01")).toBe(false);
  });

  it("returns false for an unknown (empty) date", () => {
    expect(isOnOrAfter("", "2026-01-01")).toBe(false);
  });
});

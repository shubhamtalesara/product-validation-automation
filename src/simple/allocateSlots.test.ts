import { describe, expect, it } from "vitest";
import { allocateAdSlots } from "./allocateSlots.js";

describe("allocateAdSlots", () => {
  it("distributes proportionally to weight while giving everyone at least one slot", () => {
    const result = allocateAdSlots(
      [
        { name: "big", weight: 100, available: 50 },
        { name: "mid", weight: 50, available: 50 },
        { name: "small", weight: 50, available: 50 },
      ],
      20,
    );
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(20);
    expect(result.get("big")!).toBeGreaterThan(result.get("mid")!);
    expect(result.get("mid")).toBe(result.get("small"));
    for (const v of result.values()) expect(v).toBeGreaterThan(0);
  });

  it("never lets a dominant competitor starve everyone else to zero", () => {
    const result = allocateAdSlots(
      [
        { name: "whale", weight: 1000, available: 50 },
        { name: "minnow1", weight: 1, available: 50 },
        { name: "minnow2", weight: 1, available: 50 },
      ],
      10,
    );
    expect(result.get("minnow1")).toBeGreaterThanOrEqual(1);
    expect(result.get("minnow2")).toBeGreaterThanOrEqual(1);
    expect(result.get("whale")!).toBeGreaterThan(result.get("minnow1")!);
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("never allocates more slots to a competitor than it has ads for", () => {
    const result = allocateAdSlots(
      [
        { name: "heavy-but-thin", weight: 900, available: 2 },
        { name: "steady", weight: 100, available: 50 },
      ],
      20,
    );
    expect(result.get("heavy-but-thin")).toBe(2);
    // the 18 slots the thin competitor can't absorb should flow to the other one
    expect(result.get("steady")).toBe(18);
  });

  it("caps allocation to available ads and still sums to totalSlots when capacity allows", () => {
    const result = allocateAdSlots(
      [
        { name: "a", weight: 10, available: 3 },
        { name: "b", weight: 10, available: 3 },
        { name: "c", weight: 10, available: 3 },
      ],
      9,
    );
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(3);
    expect(result.get("c")).toBe(3);
  });

  it("prioritizes higher-weight competitors when there aren't enough slots for everyone", () => {
    const result = allocateAdSlots(
      [
        { name: "a", weight: 100, available: 10 },
        { name: "b", weight: 80, available: 10 },
        { name: "c", weight: 60, available: 10 },
        { name: "d", weight: 40, available: 10 },
        { name: "e", weight: 20, available: 10 },
      ],
      3,
    );
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(1);
    expect(result.get("d")).toBe(0);
    expect(result.get("e")).toBe(0);
  });

  it("still gives a fair share to a competitor with zero/unknown weight, as long as it has ads", () => {
    const result = allocateAdSlots(
      [
        { name: "known", weight: 50, available: 50 },
        { name: "unknown-weight", weight: 0, available: 50 },
      ],
      10,
    );
    expect(result.get("unknown-weight")!).toBeGreaterThanOrEqual(1);
  });

  it("excludes competitors with zero available ads entirely", () => {
    const result = allocateAdSlots(
      [
        { name: "has-ads", weight: 10, available: 5 },
        { name: "no-ads", weight: 999, available: 0 },
      ],
      10,
    );
    expect(result.has("no-ads")).toBe(false);
    expect(result.get("has-ads")).toBe(5);
  });

  it("returns an empty map when there are no competitors or no slots", () => {
    expect(allocateAdSlots([], 10).size).toBe(0);
    expect(allocateAdSlots([{ name: "a", weight: 1, available: 5 }], 0).get("a")).toBe(0);
  });
});

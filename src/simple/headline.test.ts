import { describe, expect, it } from "vitest";
import { deriveHeadline } from "./headline.js";

describe("deriveHeadline", () => {
  it("uses the title when present", () => {
    expect(deriveHeadline("Stop wasting money", "Some long body copy here.")).toBe("Stop wasting money");
  });

  it("falls back to the first sentence of the body when title is null", () => {
    expect(deriveHeadline(null, "Stop wasting money on the wrong supplements. Here's why.")).toBe(
      "Stop wasting money on the wrong supplements.",
    );
  });

  it("falls back to the first line when there's no sentence-ending punctuation", () => {
    expect(deriveHeadline(null, "New arrival copy\nMore details below")).toBe("New arrival copy");
  });

  it("truncates a long first line at a word boundary with an ellipsis", () => {
    const body = "This is a very long piece of ad copy that goes on and on without any punctuation at all here";
    const result = deriveHeadline(null, body);
    expect(result.length).toBeLessThanOrEqual(71);
    expect(result.endsWith("…")).toBe(true);
    expect(body.startsWith(result.slice(0, -1).trim())).toBe(true);
  });

  it("returns an empty string when both title and body are missing", () => {
    expect(deriveHeadline(null, undefined)).toBe("");
    expect(deriveHeadline("", "")).toBe("");
  });
});

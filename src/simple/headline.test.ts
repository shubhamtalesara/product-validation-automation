import { describe, expect, it } from "vitest";
import { deriveHeadline } from "./headline.js";

describe("deriveHeadline", () => {
  it("uses the title when present", () => {
    expect(deriveHeadline({ title: "Stop wasting money", primaryText: "Some long body copy here." })).toBe(
      "Stop wasting money",
    );
  });

  it("falls back to ctaDescription when title is missing", () => {
    expect(
      deriveHeadline({ title: null, ctaDescription: "Free shipping over $50", primaryText: "Long story ad copy." }),
    ).toBe("Free shipping over $50");
  });

  it("falls back to ctaLinkDescription when title and ctaDescription are both missing", () => {
    expect(
      deriveHeadline({
        title: null,
        ctaDescription: null,
        ctaLinkDescription: "Shop the collection",
        primaryText: "Long story ad copy.",
      }),
    ).toBe("Shop the collection");
  });

  it("falls back to the first sentence of the body when nothing else is populated", () => {
    expect(deriveHeadline({ primaryText: "Stop wasting money on the wrong supplements. Here's why." })).toBe(
      "Stop wasting money on the wrong supplements.",
    );
  });

  it("falls back to the first line when there's no sentence-ending punctuation", () => {
    expect(deriveHeadline({ primaryText: "New arrival copy\nMore details below" })).toBe("New arrival copy");
  });

  it("truncates a long first line at a word boundary with an ellipsis", () => {
    const body = "This is a very long piece of ad copy that goes on and on without any punctuation at all here";
    const result = deriveHeadline({ primaryText: body });
    expect(result.length).toBeLessThanOrEqual(71);
    expect(result.endsWith("…")).toBe(true);
    expect(body.startsWith(result.slice(0, -1).trim())).toBe(true);
  });

  it("returns an empty string when nothing at all is populated", () => {
    expect(deriveHeadline({})).toBe("");
    expect(deriveHeadline({ title: "", ctaDescription: "", ctaLinkDescription: "", primaryText: "" })).toBe("");
  });
});

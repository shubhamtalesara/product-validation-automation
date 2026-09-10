import { describe, expect, it } from "vitest";
import { matchLandingPage } from "./matchLandingPage.js";

describe("matchLandingPage", () => {
  it("matches PDP to PDP exactly", () => {
    const options = [
      { url: "https://mine.com/products/x", type: "PDP" },
      { url: "https://mine.com/pages/quiz", type: "Quiz" },
    ];
    expect(matchLandingPage("PDP", options)?.url).toBe("https://mine.com/products/x");
  });

  it("matches across minor formatting differences (dashes/spacing/case)", () => {
    const options = [{ url: "https://mine.com/pages/why", type: "5 Reasons Why" }];
    expect(matchLandingPage("5-reasons-why", options)?.url).toBe("https://mine.com/pages/why");
  });

  it("matches Home to Homepage via synonym normalization", () => {
    const options = [
      { url: "https://mine.com/", type: "Homepage" },
      { url: "https://mine.com/products/x", type: "PDP" },
    ];
    expect(matchLandingPage("Home", options)?.url).toBe("https://mine.com/");
  });

  it("matches Collection to Category Page via synonym normalization", () => {
    const options = [
      { url: "https://mine.com/products/x", type: "PDP" },
      { url: "https://mine.com/cat/all", type: "Category Page" },
    ];
    expect(matchLandingPage("Collection", options)?.url).toBe("https://mine.com/cat/all");
  });

  it("falls back to the only available option when nothing shares a bucket (advertorial example from the brief)", () => {
    const options = [{ url: "https://mine.com/pages/story", type: "Advertorial" }];
    expect(matchLandingPage("5-reasons-why", options)?.url).toBe("https://mine.com/pages/story");
  });

  it("picks the closer advertorial-bucket option when multiple are available", () => {
    const options = [
      { url: "https://mine.com/pages/quiz", type: "Quiz" },
      { url: "https://mine.com/pages/why", type: "5 Reasons Why" },
      { url: "https://mine.com/pages/vsl", type: "VSL" },
    ];
    expect(matchLandingPage("5-reasons-why", options)?.url).toBe("https://mine.com/pages/why");
  });

  it("returns null when there are no options at all", () => {
    expect(matchLandingPage("PDP", [])).toBeNull();
  });

  it("returns the single option when there's only one, regardless of type text", () => {
    const options = [{ url: "https://mine.com/only-page", type: "Whatever" }];
    expect(matchLandingPage("PDP", options)?.url).toBe("https://mine.com/only-page");
  });

  it("preserves extra fields (e.g. brandName) on the matched option, for a list spanning multiple brands", () => {
    const options = [
      { url: "https://brand-a.com/products/x", type: "PDP", brandName: "Brand A" },
      { url: "https://brand-b.com/pages/why", type: "5 Reasons Why", brandName: "Brand B" },
    ];
    const match = matchLandingPage("PDP", options);
    expect(match?.url).toBe("https://brand-a.com/products/x");
    expect(match?.brandName).toBe("Brand A");
  });
});

import { describe, expect, it } from "vitest";
import { classifyLandingPage } from "./landingPageType.js";

describe("classifyLandingPage", () => {
  it("labels a Shopify product page as PDP", () => {
    expect(classifyLandingPage("https://shop.com/products/mouse-repellent-pouches")).toBe("PDP");
  });

  it("labels a collection page", () => {
    expect(classifyLandingPage("https://shop.com/collections/best-sellers")).toBe("Collection");
  });

  it("uses the last path segment as the label for advertorial-style pages", () => {
    expect(classifyLandingPage("https://shop.com/pages/5-reasons-why")).toBe("5-reasons-why");
  });

  it("strips a trailing .html/.php extension from the slug", () => {
    expect(classifyLandingPage("https://shop.com/vsl/5-reasons-why.html")).toBe("5-reasons-why");
  });

  it("labels the bare root domain as Home", () => {
    expect(classifyLandingPage("https://shop.com")).toBe("Home");
    expect(classifyLandingPage("https://shop.com/")).toBe("Home");
  });

  it("returns an empty string for an empty input", () => {
    expect(classifyLandingPage("")).toBe("");
  });

  it("falls back to the raw string when the URL can't be parsed at all", () => {
    expect(classifyLandingPage("not a url::")).toBe("not a url::");
  });
});

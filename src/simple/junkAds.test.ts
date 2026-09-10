import { describe, expect, it } from "vitest";
import { isJunkAd } from "./junkAds.js";

describe("isJunkAd", () => {
  it("flags an ad whose landing page is the advertiser's own Facebook page", () => {
    expect(
      isJunkAd({ callToAction: "LIKE PAGE", landingPageUrl: "https://www.facebook.com/1107800459077831" }),
    ).toBe(true);
  });

  it("flags an ad whose landing page is bare google.com", () => {
    expect(isJunkAd({ callToAction: "SHOP NOW", landingPageUrl: "https://google.com" })).toBe(true);
  });

  it("flags a LIKE_PAGE cta even without a facebook.com landing page", () => {
    expect(isJunkAd({ callToAction: "LIKE_PAGE", landingPageUrl: "https://real-shop.com/products/x" })).toBe(true);
  });

  it("does not flag a real product ad", () => {
    expect(isJunkAd({ callToAction: "SHOP NOW", landingPageUrl: "https://real-shop.com/products/mouse-pouch" })).toBe(
      false,
    );
  });

  it("does not flag an ad with no landing page and a normal CTA", () => {
    expect(isJunkAd({ callToAction: "SHOP NOW" })).toBe(false);
  });

  it("handles missing content entirely", () => {
    expect(isJunkAd(undefined)).toBe(false);
  });
});

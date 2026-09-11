import { describe, expect, it } from "vitest";
import { localizePrimaryText, replaceBrandName, replaceLinkMentions } from "./localize.js";

describe("replaceBrandName", () => {
  it("replaces a whole-word case-insensitive brand mention", () => {
    expect(replaceBrandName("Then I found Avouria's built-in bra tank.", "Avouria", "MyBrand")).toBe(
      "Then I found MyBrand's built-in bra tank.",
    );
  });

  it("preserves the possessive apostrophe style", () => {
    expect(replaceBrandName("avouria’s tank is great", "Avouria", "MyBrand")).toBe("MyBrand’s tank is great");
  });

  it("replaces a non-possessive mention", () => {
    expect(replaceBrandName("I love Avouria so much", "Avouria", "MyBrand")).toBe("I love MyBrand so much");
  });

  it("does not replace a substring that isn't a whole word", () => {
    expect(replaceBrandName("Avourialand is different", "Avouria", "MyBrand")).toBe("Avourialand is different");
  });

  it("returns the text unchanged when myBrand is empty", () => {
    expect(replaceBrandName("I love Avouria", "Avouria", "")).toBe("I love Avouria");
  });

  it("matches a hyphenated config name against a concatenated one-word mention in copy", () => {
    expect(replaceBrandName("Introducing EsoRepair by NanoRevive", "nano-revive", "MyBrand")).toBe(
      "Introducing EsoRepair by MyBrand",
    );
  });

  it("matches a hyphenated config name against a spaced mention in copy", () => {
    expect(replaceBrandName("Introducing EsoRepair by Nano Revive", "nano-revive", "MyBrand")).toBe(
      "Introducing EsoRepair by MyBrand",
    );
  });

  it("matches a hyphenated config name against the same hyphenation in copy", () => {
    expect(replaceBrandName("by Nano-Revive today", "nano-revive", "MyBrand")).toBe("by MyBrand today");
  });

  it("still requires a whole-word match at the token boundaries", () => {
    expect(replaceBrandName("NanoRevived is unrelated", "nano-revive", "MyBrand")).toBe("NanoRevived is unrelated");
  });
});

describe("replaceLinkMentions", () => {
  it("replaces a bare domain mention with the full my-landing-page URL", () => {
    expect(
      replaceLinkMentions("Shop now at avouria.com today", "avouria.com", "https://mybrand.com/products/tank"),
    ).toBe("Shop now at https://mybrand.com/products/tank today");
  });

  it("replaces the domain AND drops the competitor's own path, keeping only the my-landing-page URL", () => {
    expect(
      replaceLinkMentions(
        "👉 https://shop.pipitea.com/ppbs/7-benefits",
        "shop.pipitea.com",
        "https://get.trywellvi.com/pages/wellvi-tea",
      ),
    ).toBe("👉 https://get.trywellvi.com/pages/wellvi-tea");
  });

  it("matches with or without protocol/www prefix on the competitor's mention", () => {
    expect(
      replaceLinkMentions("Visit https://www.avouria.com/sale now", "avouria.com", "https://mybrand.com/deal"),
    ).toBe("Visit https://mybrand.com/deal now");
  });

  it("keeps trailing sentence punctuation outside the replaced link", () => {
    expect(
      replaceLinkMentions("Check it out at pipitea.com/ppbs/7-benefits.", "pipitea.com", "https://mybrand.com/x"),
    ).toBe("Check it out at https://mybrand.com/x.");
  });

  it("is a no-op when the domain never appears in the text", () => {
    expect(replaceLinkMentions("No links here", "avouria.com", "https://mybrand.com")).toBe("No links here");
  });

  it("is a no-op when no myLandingPageUrl is provided", () => {
    expect(replaceLinkMentions("Shop at avouria.com", "avouria.com", "")).toBe("Shop at avouria.com");
  });
});

describe("localizePrimaryText", () => {
  it("swaps both brand name and link when both are provided, using the full my-landing-page URL", () => {
    const result = localizePrimaryText({
      body: "Then I found Avouria's tank at avouria.com.",
      competitorBrandName: "Avouria",
      competitorDomain: "avouria.com",
      myBrandName: "MyBrand",
      myLandingPageUrl: "https://mybrand.com/products/tank",
    });
    expect(result).toBe("Then I found MyBrand's tank at https://mybrand.com/products/tank.");
  });

  it("discards the competitor's own subpage path when swapping the link", () => {
    const result = localizePrimaryText({
      body: "👉 https://shop.pipitea.com/ppbs/7-benefits",
      competitorBrandName: "Pipi Tea",
      competitorDomain: "shop.pipitea.com",
      myBrandName: "wellvi",
      myLandingPageUrl: "https://get.trywellvi.com/pages/wellvi-tea",
    });
    expect(result).toBe("👉 https://get.trywellvi.com/pages/wellvi-tea");
  });

  it("only swaps the brand name when no matched landing page is available", () => {
    const result = localizePrimaryText({
      body: "Then I found Avouria's tank.",
      competitorBrandName: "Avouria",
      competitorDomain: "avouria.com",
      myBrandName: "MyBrand",
    });
    expect(result).toBe("Then I found MyBrand's tank.");
  });

  it("returns the original text unchanged when no myBrandName is configured yet", () => {
    const result = localizePrimaryText({
      body: "Then I found Avouria's tank.",
      competitorBrandName: "Avouria",
      competitorDomain: "avouria.com",
    });
    expect(result).toBe("Then I found Avouria's tank.");
  });
});

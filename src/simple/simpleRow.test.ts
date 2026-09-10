import { describe, expect, it } from "vitest";
import { SIMPLE_SHEET_COLUMNS, simpleRowToSheetValues, type SimpleAdRow } from "./simpleRow.js";

function baseRow(overrides: Partial<SimpleAdRow> = {}): SimpleAdRow {
  return {
    competitor: "Acme",
    competitorLandingPage: "https://acme.com",
    facebookPageName: "Acme Official",
    adSet: "Ad Set 1 (Video)",
    trendtrackAdId: "ad-1",
    trendtrackPreviewUrl: "https://app.trendtrack.io/share/ad-1",
    headline: "Stop wasting money",
    primaryText: "Full ad copy here.",
    localizedPrimaryText: "Full ad copy here.",
    cta: "SHOP NOW",
    landingPageUrl: "https://acme.com/products/x",
    landingPageType: "PDP",
    myLandingPageUrl: "",
    myLandingPageType: "",
    mediaType: "image",
    mediaUrl: "https://cdn.example.com/ad-1.jpg",
    thumbnailUrl: "",
    reach: 12345,
    daysRunning: 40,
    rank: 1,
    ...overrides,
  };
}

describe("simpleRowToSheetValues", () => {
  it("produces one value per declared column, in order", () => {
    const values = simpleRowToSheetValues(baseRow());
    expect(values).toHaveLength(SIMPLE_SHEET_COLUMNS.length);
  });

  it("renders a Creative Preview IMAGE() formula from the thumbnail when present", () => {
    const values = simpleRowToSheetValues(baseRow({ thumbnailUrl: "https://cdn.example.com/thumb.jpg" }));
    const previewIndex = SIMPLE_SHEET_COLUMNS.indexOf("Creative Preview");
    expect(values[previewIndex]).toBe('=IMAGE("https://cdn.example.com/thumb.jpg", 4, 80, 80)');
  });

  it("falls back to the media URL as the preview for a static image with no thumbnail", () => {
    const values = simpleRowToSheetValues(baseRow({ thumbnailUrl: "" }));
    const previewIndex = SIMPLE_SHEET_COLUMNS.indexOf("Creative Preview");
    expect(values[previewIndex]).toBe('=IMAGE("https://cdn.example.com/ad-1.jpg", 4, 80, 80)');
  });

  it("leaves the Creative Preview blank for a video with no thumbnail", () => {
    const values = simpleRowToSheetValues(
      baseRow({ mediaType: "video", mediaUrl: "https://cdn.example.com/ad-1.mp4", thumbnailUrl: "" }),
    );
    const previewIndex = SIMPLE_SHEET_COLUMNS.indexOf("Creative Preview");
    expect(values[previewIndex]).toBe("");
  });

  it("escapes double quotes in the preview URL for the formula", () => {
    const values = simpleRowToSheetValues(baseRow({ thumbnailUrl: 'https://cdn.example.com/a"b.jpg' }));
    const previewIndex = SIMPLE_SHEET_COLUMNS.indexOf("Creative Preview");
    expect(values[previewIndex]).toBe('=IMAGE("https://cdn.example.com/a""b.jpg", 4, 80, 80)');
  });
});

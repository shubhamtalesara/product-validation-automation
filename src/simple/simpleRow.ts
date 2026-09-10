export const SIMPLE_SHEET_COLUMNS = [
  "Competitor",
  "Facebook Page Name",
  "Ad Set",
  "Headline",
  "Primary Text",
  "Localized Primary Text",
  "CTA",
  "Landing Page",
  "Landing Page Type",
  "My Landing Page",
  "My Landing Page Type",
  "Media Type",
  "Creative Preview",
  "Media Link",
  "Impressions (Reach)",
  "Days Running",
  "Rank",
  "TrendTrack Ad ID",
  "TrendTrack Preview Link",
] as const;

export interface SimpleAdRow {
  competitor: string;
  competitorLandingPage: string;
  facebookPageName: string;
  adSet: string;
  trendtrackAdId: string;
  trendtrackPreviewUrl: string;
  headline: string;
  primaryText: string;
  localizedPrimaryText: string;
  cta: string;
  landingPageUrl: string;
  landingPageType: string;
  myLandingPageUrl: string;
  myLandingPageType: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  reach: number | null;
  daysRunning: number | null;
  rank: number | null;
}

/**
 * Google Sheets renders `=IMAGE(url, 4, w, h)` as an inline thumbnail in the
 * cell (mode 4 = fixed custom size) - this is the standard way to get a
 * visual creative preview in a sheet, rather than just a text link. Prefers
 * the dedicated thumbnail; for image ads without one, the media file itself
 * doubles as its own preview. A video with no thumbnail has nothing
 * IMAGE() can render, so that cell is left blank rather than showing a
 * broken-image icon for the raw video file.
 */
function creativePreviewFormula(row: SimpleAdRow): string {
  const url = row.thumbnailUrl || (row.mediaType === "image" ? row.mediaUrl : "");
  if (!url) return "";
  return `=IMAGE("${url.replace(/"/g, '""')}", 4, 80, 80)`;
}

export function simpleRowToSheetValues(row: SimpleAdRow): (string | number)[] {
  return [
    row.competitor,
    row.facebookPageName,
    row.adSet,
    row.headline,
    row.primaryText,
    row.localizedPrimaryText,
    row.cta,
    row.landingPageUrl,
    row.landingPageType,
    row.myLandingPageUrl,
    row.myLandingPageType,
    row.mediaType,
    creativePreviewFormula(row),
    row.mediaUrl,
    row.reach ?? "",
    row.daysRunning ?? "",
    row.rank ?? "",
    row.trendtrackAdId,
    row.trendtrackPreviewUrl,
  ];
}

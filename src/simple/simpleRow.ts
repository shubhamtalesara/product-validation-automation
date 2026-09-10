export const SIMPLE_SHEET_COLUMNS = [
  "Competitor",
  "Facebook Page Name",
  "Ad Set",
  "Headline",
  "Primary Text",
  "CTA",
  "Landing Page",
  "Landing Page Type",
  "Media Type",
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
  cta: string;
  landingPageUrl: string;
  landingPageType: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  reach: number | null;
  daysRunning: number | null;
  rank: number | null;
}

export function simpleRowToSheetValues(row: SimpleAdRow): (string | number)[] {
  return [
    row.competitor,
    row.facebookPageName,
    row.adSet,
    row.headline,
    row.primaryText,
    row.cta,
    row.landingPageUrl,
    row.landingPageType,
    row.mediaType,
    row.mediaUrl,
    row.reach ?? "",
    row.daysRunning ?? "",
    row.rank ?? "",
    row.trendtrackAdId,
    row.trendtrackPreviewUrl,
  ];
}

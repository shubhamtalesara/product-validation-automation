export const SIMPLE_SHEET_COLUMNS = [
  "Competitor",
  "Headline",
  "Primary Text",
  "CTA",
  "Landing Page",
  "Media Type",
  "Media Link",
  "Impressions (Reach)",
  "Days Running",
  "Rank",
  "TrendTrack Ad ID",
] as const;

export interface SimpleAdRow {
  competitor: string;
  competitorLandingPage: string;
  trendtrackAdId: string;
  headline: string;
  primaryText: string;
  cta: string;
  landingPageUrl: string;
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
    row.headline,
    row.primaryText,
    row.cta,
    row.landingPageUrl,
    row.mediaType,
    row.mediaUrl,
    row.reach ?? "",
    row.daysRunning ?? "",
    row.rank ?? "",
    row.trendtrackAdId,
  ];
}

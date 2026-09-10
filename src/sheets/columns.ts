/**
 * Single source of truth for the Google Sheet's column layout. Order here
 * defines column order in the sheet (column A = index 0).
 */
export const SHEET_COLUMNS = [
  "Research ID",
  "Competitor",
  "TrendTrack Ad ID",
  "Collation ID",
  "Status",
  "Validation Score",
  "Days Running",
  "Reach",
  "Reach Δ 7d",
  "Current Rank",
  "Media Type",
  "Competitor Creative",
  "Competitor Creative URL",
  "Competitor Copy",
  "Competitor Headline",
  "Competitor CTA",
  "Competitor Landing Page",
  "Transcript",
  "Creative Analysis",
  "Our Creative",
  "Our Creative URL",
  "Our Primary Text",
  "Our Headline",
  "Our CTA",
  "Our Landing Page",
  "Launch Date",
  "Launch Time",
  "Timezone",
  "Meta Campaign ID",
  "Meta Ad Set ID",
  "Meta Creative ID",
  "Meta Ad ID",
  "Meta Status",
  "Spend",
  "Impressions",
  "Clicks",
  "CTR",
  "CPC",
  "CPM",
  "Conversions",
  "CPA",
  "ROAS",
  "Verdict",
  "Notes",
] as const;

export type SheetColumn = (typeof SHEET_COLUMNS)[number];

export const COLUMN_INDEX: Record<SheetColumn, number> = Object.fromEntries(
  SHEET_COLUMNS.map((col, index) => [col, index]),
) as Record<SheetColumn, number>;

/** Columns a human is expected to edit directly in the sheet during review/approval. */
export const HUMAN_EDITABLE_COLUMNS: SheetColumn[] = [
  "Status",
  "Our Creative",
  "Our Creative URL",
  "Our Primary Text",
  "Our Headline",
  "Our CTA",
  "Our Landing Page",
  "Launch Date",
  "Launch Time",
  "Timezone",
  "Notes",
];

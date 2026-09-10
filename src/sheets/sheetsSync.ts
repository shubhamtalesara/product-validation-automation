import type { Competitor, CompetitorAd, PerformanceSnapshot, TestCreative } from "@prisma/client";
import { COLUMN_INDEX, SHEET_COLUMNS, type SheetColumn } from "./columns.js";

export type ResearchRecord = CompetitorAd & {
  competitor: Competitor;
  testCreative: (TestCreative & { performanceSnapshots: PerformanceSnapshot[] }) | null;
};

function n(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "" : Number(value.toFixed(digits)).toString();
}

function s(value: string | null | undefined): string {
  return value ?? "";
}

interface AggregatedPerformance {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export function aggregatePerformance(snapshots: PerformanceSnapshot[]): AggregatedPerformance {
  return snapshots.reduce(
    (acc, snap) => ({
      spend: acc.spend + (snap.spend ?? 0),
      impressions: acc.impressions + (snap.impressions ?? 0),
      clicks: acc.clicks + (snap.clicks ?? 0),
      conversions: acc.conversions + (snap.conversions ?? 0),
      conversionValue: acc.conversionValue + (snap.conversionValue ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );
}

/** Maps one joined CompetitorAd+TestCreative DB record into a sheet row, in column order. */
export function rowFromRecord(record: ResearchRecord): (string | number)[] {
  const tc = record.testCreative;
  const perf = aggregatePerformance(tc?.performanceSnapshots ?? []);
  const ctr = perf.impressions > 0 ? perf.clicks / perf.impressions : null;
  const cpc = perf.clicks > 0 ? perf.spend / perf.clicks : null;
  const cpm = perf.impressions > 0 ? (perf.spend / perf.impressions) * 1000 : null;
  const cpa = perf.conversions > 0 ? perf.spend / perf.conversions : null;
  const roas = perf.spend > 0 ? perf.conversionValue / perf.spend : null;

  const row: Record<SheetColumn, string | number> = {
    "Research ID": record.id,
    Competitor: record.competitor.name,
    "TrendTrack Ad ID": record.trendtrackAdId,
    "Collation ID": s(record.collationId),
    Status: s(tc?.status) || "RESEARCHED",
    "Validation Score": n(record.validationScore, 4),
    "Days Running": record.daysRunning ?? "",
    Reach: record.reach ?? "",
    "Reach Δ 7d": record.reachDelta7d ?? "",
    "Current Rank": record.currentRank ?? "",
    "Media Type": s(record.mediaType),
    "Competitor Creative": s(record.storageUrl),
    "Competitor Creative URL": s(record.mediaUrl),
    "Competitor Copy": s(record.primaryText),
    "Competitor Headline": s(record.headline),
    "Competitor CTA": s(record.cta),
    "Competitor Landing Page": s(record.landingPageUrl),
    Transcript: s(record.transcript),
    "Creative Analysis": s(record.creativeAnalysis),
    "Our Creative": s(tc?.creativeStorageUrl),
    "Our Creative URL": s(tc?.creativeUrl),
    "Our Primary Text": s(tc?.primaryText),
    "Our Headline": s(tc?.headline),
    "Our CTA": s(tc?.cta),
    "Our Landing Page": s(tc?.landingPageUrl),
    "Launch Date": s(tc?.launchDate),
    "Launch Time": s(tc?.launchTime),
    Timezone: s(tc?.timezone),
    "Meta Campaign ID": s(tc?.metaCampaignId),
    "Meta Ad Set ID": s(tc?.metaAdSetId),
    "Meta Creative ID": s(tc?.metaCreativeId),
    "Meta Ad ID": s(tc?.metaAdId),
    "Meta Status": s(tc?.metaStatus),
    Spend: n(perf.spend),
    Impressions: perf.impressions || "",
    Clicks: perf.clicks || "",
    CTR: n(ctr, 4),
    CPC: n(cpc),
    CPM: n(cpm),
    Conversions: perf.conversions || "",
    CPA: n(cpa),
    ROAS: n(roas),
    Verdict: s(tc?.verdict),
    Notes: s(tc?.errorReason),
  };

  return SHEET_COLUMNS.map((col) => row[col]);
}

export interface ParsedHumanRow {
  researchId: string;
  status: string;
  ourCreativeStorageUrl: string;
  ourCreativeUrl: string;
  ourPrimaryText: string;
  ourHeadline: string;
  ourCta: string;
  ourLandingPageUrl: string;
  launchDate: string;
  launchTime: string;
  timezone: string;
  notes: string;
}

/** Parses a raw sheet row back into the fields a human may have edited. */
export function parseHumanRow(row: string[]): ParsedHumanRow {
  const get = (col: SheetColumn) => (row[COLUMN_INDEX[col]] ?? "").trim();
  return {
    researchId: get("Research ID"),
    status: get("Status").toUpperCase(),
    ourCreativeStorageUrl: get("Our Creative"),
    ourCreativeUrl: get("Our Creative URL"),
    ourPrimaryText: get("Our Primary Text"),
    ourHeadline: get("Our Headline"),
    ourCta: get("Our CTA"),
    ourLandingPageUrl: get("Our Landing Page"),
    launchDate: get("Launch Date"),
    launchTime: get("Launch Time"),
    timezone: get("Timezone"),
    notes: get("Notes"),
  };
}

export function buildRowIndex(rows: string[][]): Map<string, number> {
  const index = new Map<string, number>();
  // rows[0] is the header; data starts at sheet row 2.
  for (let i = 1; i < rows.length; i++) {
    const researchId = rows[i]?.[COLUMN_INDEX["Research ID"]];
    if (researchId) index.set(researchId, i + 1);
  }
  return index;
}

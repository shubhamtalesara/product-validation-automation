import { describe, expect, it } from "vitest";
import { COLUMN_INDEX, SHEET_COLUMNS } from "./columns.js";
import { aggregatePerformance, buildRowIndex, parseHumanRow, rowFromRecord, type ResearchRecord } from "./sheetsSync.js";

function baseRecord(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return {
    id: "research-1",
    trendtrackAdId: "tt-1",
    collationId: "col-1",
    competitorId: "comp-1",
    status: "active",
    createdAt: new Date(),
    firstSeenAt: null,
    lastSeenAt: null,
    daysRunning: 30,
    mediaType: "video",
    mediaUrl: "https://cdn.example.com/a.mp4",
    thumbnailUrl: null,
    storageUrl: "s3://bucket/a.mp4",
    mediaHash: null,
    primaryText: "Competitor copy",
    headline: "Competitor headline",
    cta: "SHOP_NOW",
    landingPageUrl: "https://competitor.com/lp",
    reach: 12345,
    reachDelta1d: null,
    reachDelta7d: 500,
    reachDelta30d: null,
    currentRank: 3,
    rankDelta: null,
    transcript: "transcript text",
    creativeAnalysis: "analysis text",
    dedupeFingerprint: "fp",
    duplicateCount: 4,
    validationScore: 0.8231,
    rawTrendtrackData: "{}",
    updatedAt: new Date(),
    competitor: {
      id: "comp-1",
      name: "Acme",
      advertiserId: "adv-1",
      brandtrackerId: null,
      active: true,
      category: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    testCreative: null,
    ...overrides,
  } as ResearchRecord;
}

describe("rowFromRecord", () => {
  it("maps a fresh research record (no TestCreative fields filled) to the right columns", () => {
    const row = rowFromRecord(baseRecord());
    expect(row[COLUMN_INDEX["Research ID"]]).toBe("research-1");
    expect(row[COLUMN_INDEX["Competitor"]]).toBe("Acme");
    expect(row[COLUMN_INDEX["TrendTrack Ad ID"]]).toBe("tt-1");
    expect(row[COLUMN_INDEX["Status"]]).toBe("RESEARCHED");
    expect(row[COLUMN_INDEX["Competitor Headline"]]).toBe("Competitor headline");
    expect(row[COLUMN_INDEX["Our Headline"]]).toBe("");
    expect(row).toHaveLength(SHEET_COLUMNS.length);
  });

  it("includes human-entered our-creative fields and Meta IDs once present", () => {
    const record = baseRecord({
      testCreative: {
        id: "tc-1",
        competitorAdId: "research-1",
        creativeUrl: "https://drive.google.com/our-ad",
        creativeStorageUrl: "s3://bucket/our-ad.mp4",
        primaryText: "Our copy",
        headline: "Our headline",
        cta: "SHOP_NOW",
        landingPageUrl: "https://ours.com/lp",
        launchDate: "2026-09-15",
        launchTime: "10:00",
        timezone: "America/New_York",
        launchAt: null,
        status: "APPROVED",
        errorReason: null,
        verdict: null,
        publishLock: null,
        metaCampaignId: "camp1",
        metaAdSetId: "set1",
        metaCreativeId: "cre1",
        metaAdId: "ad1",
        metaStatus: "ACTIVE",
        sheetRowNumber: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        performanceSnapshots: [
          {
            id: "p1",
            testCreativeId: "tc-1",
            date: new Date("2026-09-16"),
            spend: 100,
            impressions: 1000,
            clicks: 20,
            ctr: 0.02,
            cpc: 5,
            cpm: 100,
            conversions: 2,
            conversionValue: 300,
            cpa: 50,
            roas: 3,
            rawMetaData: "{}",
            createdAt: new Date(),
          },
        ],
      },
    });

    const row = rowFromRecord(record);
    expect(row[COLUMN_INDEX["Status"]]).toBe("APPROVED");
    expect(row[COLUMN_INDEX["Our Headline"]]).toBe("Our headline");
    expect(row[COLUMN_INDEX["Meta Ad ID"]]).toBe("ad1");
    expect(row[COLUMN_INDEX["Spend"]]).toBe("100");
    expect(row[COLUMN_INDEX["Impressions"]]).toBe(1000);
    expect(row[COLUMN_INDEX["CTR"]]).toBe("0.02");
    expect(row[COLUMN_INDEX["ROAS"]]).toBe("3");
  });
});

describe("aggregatePerformance", () => {
  it("sums across multiple snapshots without overwriting", () => {
    const snapshots = [
      { spend: 10, impressions: 100, clicks: 1, conversions: 0, conversionValue: 0 },
      { spend: 20, impressions: 200, clicks: 3, conversions: 1, conversionValue: 50 },
    ] as never[];
    const agg = aggregatePerformance(snapshots);
    expect(agg.spend).toBe(30);
    expect(agg.impressions).toBe(300);
    expect(agg.clicks).toBe(4);
    expect(agg.conversions).toBe(1);
    expect(agg.conversionValue).toBe(50);
  });
});

describe("parseHumanRow", () => {
  it("extracts editable fields keyed correctly regardless of column position", () => {
    const row = new Array(SHEET_COLUMNS.length).fill("");
    row[COLUMN_INDEX["Research ID"]] = "research-1";
    row[COLUMN_INDEX["Status"]] = "approved";
    row[COLUMN_INDEX["Our Headline"]] = "New headline";
    row[COLUMN_INDEX["Launch Date"]] = "2026-09-15";
    row[COLUMN_INDEX["Launch Time"]] = "10:00";
    row[COLUMN_INDEX["Timezone"]] = "America/New_York";

    const parsed = parseHumanRow(row);
    expect(parsed.researchId).toBe("research-1");
    expect(parsed.status).toBe("APPROVED");
    expect(parsed.ourHeadline).toBe("New headline");
    expect(parsed.launchDate).toBe("2026-09-15");
  });
});

describe("buildRowIndex", () => {
  it("maps Research ID to the correct 1-indexed sheet row, skipping the header", () => {
    const rows = [
      [...SHEET_COLUMNS],
      (() => {
        const r = new Array(SHEET_COLUMNS.length).fill("");
        r[COLUMN_INDEX["Research ID"]] = "r1";
        return r;
      })(),
      (() => {
        const r = new Array(SHEET_COLUMNS.length).fill("");
        r[COLUMN_INDEX["Research ID"]] = "r2";
        return r;
      })(),
    ];
    const index = buildRowIndex(rows);
    expect(index.get("r1")).toBe(2);
    expect(index.get("r2")).toBe(3);
  });
});

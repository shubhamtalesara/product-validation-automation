-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "brandtrackerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompetitorAd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trendtrackAdId" TEXT NOT NULL,
    "collationId" TEXT,
    "competitorId" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" DATETIME,
    "lastSeenAt" DATETIME,
    "daysRunning" INTEGER,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "storageUrl" TEXT,
    "mediaHash" TEXT,
    "primaryText" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "landingPageUrl" TEXT,
    "reach" INTEGER,
    "reachDelta1d" INTEGER,
    "reachDelta7d" INTEGER,
    "reachDelta30d" INTEGER,
    "currentRank" INTEGER,
    "rankDelta" INTEGER,
    "transcript" TEXT,
    "creativeAnalysis" TEXT,
    "dedupeFingerprint" TEXT,
    "duplicateCount" INTEGER NOT NULL DEFAULT 1,
    "validationScore" REAL,
    "rawTrendtrackData" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitorAd_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCreative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitorAdId" TEXT NOT NULL,
    "creativeUrl" TEXT,
    "creativeStorageUrl" TEXT,
    "primaryText" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "landingPageUrl" TEXT,
    "launchDate" TEXT,
    "launchTime" TEXT,
    "timezone" TEXT,
    "launchAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RESEARCHED',
    "errorReason" TEXT,
    "verdict" TEXT,
    "publishLock" TEXT,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaCreativeId" TEXT,
    "metaAdId" TEXT,
    "sheetRowNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCreative_competitorAdId_fkey" FOREIGN KEY ("competitorAdId") REFERENCES "CompetitorAd" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCreativeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "spend" REAL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "ctr" REAL,
    "cpc" REAL,
    "cpm" REAL,
    "conversions" INTEGER,
    "conversionValue" REAL,
    "cpa" REAL,
    "roas" REAL,
    "rawMetaData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceSnapshot_testCreativeId_fkey" FOREIGN KEY ("testCreativeId") REFERENCES "TestCreative" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "error" TEXT,
    "summary" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_advertiserId_key" ON "Competitor"("advertiserId");

-- CreateIndex
CREATE INDEX "Competitor_active_idx" ON "Competitor"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorAd_trendtrackAdId_key" ON "CompetitorAd"("trendtrackAdId");

-- CreateIndex
CREATE INDEX "CompetitorAd_competitorId_idx" ON "CompetitorAd"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorAd_collationId_idx" ON "CompetitorAd"("collationId");

-- CreateIndex
CREATE INDEX "CompetitorAd_dedupeFingerprint_idx" ON "CompetitorAd"("dedupeFingerprint");

-- CreateIndex
CREATE INDEX "CompetitorAd_validationScore_idx" ON "CompetitorAd"("validationScore");

-- CreateIndex
CREATE UNIQUE INDEX "TestCreative_competitorAdId_key" ON "TestCreative"("competitorAdId");

-- CreateIndex
CREATE INDEX "TestCreative_status_idx" ON "TestCreative"("status");

-- CreateIndex
CREATE INDEX "TestCreative_launchAt_idx" ON "TestCreative"("launchAt");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_testCreativeId_idx" ON "PerformanceSnapshot"("testCreativeId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceSnapshot_testCreativeId_date_key" ON "PerformanceSnapshot"("testCreativeId", "date");

-- CreateIndex
CREATE INDEX "JobRun_jobType_startedAt_idx" ON "JobRun"("jobType", "startedAt");

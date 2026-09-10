# Product Validation Automation

> **Just want competitor ads in a Sheet + a dashboard, with no coding?**
> See **[SIMPLE_SETUP.md](./SIMPLE_SETUP.md)** — a 10-minute, click-only
> setup for as many competitors as you want, no CLI/terminal required.
> Everything below this point documents the full advanced pipeline (Meta
> publishing, approval workflow, database).

Automates the full competitor-ad research -> validation -> Meta publishing
pipeline end to end, without n8n/Zapier/Make or any other automation
platform. Everything (scheduling, API integrations, database, Google Sheets
sync, creative storage, Meta publishing, performance tracking) is plain
TypeScript/Node.js.

```
TrendTrack API -> Research Worker -> Dedup -> Scoring -> Top N -> Database
   -> Google Sheets -> human creative adaptation -> status=APPROVED
   -> Approval Worker (validates) -> Publish Worker -> Meta Marketing API
   -> Performance Worker -> Database + Google Sheets
```

The database is always the source of truth. Google Sheets is the human
operating interface, kept in sync with it. Competitor creatives
(`CompetitorAd`) and our own adapted creatives (`TestCreative`) are modeled
as separate entities on purpose - the system never publishes a competitor's
creative unchanged. A human always reviews and adapts before anything goes
to Meta.

## Requirements

- Node.js >= 20
- A TrendTrack API key
- A Google Cloud OAuth client (for Sheets) + a spreadsheet
- A Meta Marketing API access token, ad account, page, campaign, and ad set

## Setup

```bash
npm install
cp .env.example .env      # fill in the values described below
npm run db:setup          # applies Prisma migrations + generates the client
```

`npm run db:setup` creates `prisma/dev.db` (SQLite) if `DATABASE_URL` is
left unset. Nothing else needs to run before the CLI/worker will start.

## Environment variables

See `.env.example` for the full list with defaults. Highlights:

| Var | Purpose |
|---|---|
| `TRENDTRACK_API_KEY` / `TRENDTRACK_BASE_URL` | TrendTrack auth |
| `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GOOGLE_SHEET_ID` | Google Sheets auth + target sheet |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_DEFAULT_CAMPAIGN_ID`, `META_DEFAULT_ADSET_ID` | Meta publishing target |
| `DATABASE_URL` | Prisma connection string (SQLite by default, Postgres-ready) |
| `STORAGE_PROVIDER`, `LOCAL_STORAGE_DIR`, `S3_*` | Creative storage backend |
| `DRY_RUN` | When `true` (default), Meta publishing is simulated and logged, never live |
| `RESEARCH_CRON`, `APPROVAL_CRON`, `PUBLISH_CRON`, `PERFORMANCE_CRON` | Job schedules (cron expressions) |
| `TOP_AD_COUNT` | How many creative concepts to select per competitor per run |
| `LONGEVITY_WEIGHT`, `REACH_WEIGHT`, `GROWTH_WEIGHT`, `DUPLICATION_WEIGHT` | Validation score weights (should sum to ~1.0) |
| `MIN_SPEND`, `MIN_IMPRESSIONS`, `TARGET_CPA`, `TARGET_ROAS`, `MIN_CTR` | Winner/loser thresholds |

Never commit `.env` - only `.env.example` is tracked.

## Database setup

The schema (`prisma/schema.prisma`) models `Competitor`, `CompetitorAd`
(research data), `TestCreative` (our adapted version + Meta IDs + status),
`PerformanceSnapshot` (one row per ad per day, never overwritten), and
`JobRun` (structured status/history for every scheduled run).

Default provider is SQLite so the whole system runs with zero external
services. For production, switch to Postgres:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"` under `datasource db`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. Run `npm run db:setup` again.

All field types used in the schema are supported by both providers, so no
other changes are required.

> **Note on SQLite paths:** relative `file:` URLs in Prisma resolve relative
> to `prisma/schema.prisma`'s directory. `DATABASE_URL` defaults to an
> absolute path at `prisma/dev.db` to avoid any ambiguity - only override it
> if you want the database somewhere else or want to point at Postgres.

## Google authentication

1. In Google Cloud Console, create an OAuth 2.0 Client ID (type "Desktop
   app" is easiest for a one-time token exchange).
2. Enable the Google Sheets API for the project.
3. Run through the OAuth consent flow once (e.g. with
   [Google's OAuth Playground](https://developers.google.com/oauthplayground)
   configured with your own client ID/secret) authorizing the
   `https://www.googleapis.com/auth/spreadsheets` scope, and capture the
   **refresh token** - it's long-lived and is what the app uses for every
   subsequent run.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
5. Create a Google Sheet, share it with the Google account the OAuth client
   authenticated as, and set `GOOGLE_SHEET_ID` to the ID in its URL.
   `GOOGLE_SHEET_TAB` selects which tab (defaults to `Research`).

The column layout is defined once in `src/sheets/columns.ts` and includes
every field from the spec: research metadata, competitor creative/copy,
our creative/copy, launch scheduling, Meta IDs/status, performance metrics,
and verdict/notes.

## TrendTrack authentication

Set `TRENDTRACK_API_KEY` and `TRENDTRACK_BASE_URL`. The client
(`src/trendtrack/client.ts`) wraps exactly the three documented endpoints:

- `GET /v1/advertisers/{advertiserId}/ads` (paginated, `status=active`)
- `GET /v1/ads/{adId}` (full detail, stored raw as JSON)
- `GET /v1/ads/{adId}/media-url` (resolves the downloadable asset URL)

## Meta authentication

Create a Meta Marketing API access token with `ads_management` permission
for the ad account you'll publish to, then set `META_ACCESS_TOKEN`,
`META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_API_VERSION`, and (since ads
attach to a shared campaign/ad set rather than one created per row)
`META_DEFAULT_CAMPAIGN_ID` + `META_DEFAULT_ADSET_ID`. Optionally set
`META_INSTAGRAM_ACCOUNT_ID` and `META_UTM_TEMPLATE`.

**On scheduling:** Meta does not support a per-ad native start time
independent of its ad set (start times live on ad sets/campaigns, which
here are shared across many test creatives). Scheduling is therefore
enforced by this system's own Publish Worker: it only creates the Meta ad
once `launchAt` (resolved from Launch Date/Time/Timezone) has passed. The
ad is created directly with `status=ACTIVE` at that moment.

## Competitors

Competitors are pure data - add or deactivate them without touching code:

```bash
npm run cli -- competitors:add --name "Acme" --advertiser-id adv_123 --category supplements
npm run cli -- competitors:list
```

## Running research

```bash
npm run cli -- research:run                      # all active competitors
npm run cli -- research:run --competitor=<id>     # just one
npm run cli -- research:top --limit=25            # inspect current top-scored ads
```

Each run: paginates active ads per competitor, deduplicates creative
concepts (TrendTrack `collationId` first, falling back to normalized
media URL + copy + headline + advertiser so real variants are never
merged), computes a **validation/prioritization score** (not a
profitability claim) from configurable weights, selects the top
`TOP_AD_COUNT`, downloads/stores each asset exactly once, and upserts
`CompetitorAd` + a placeholder `TestCreative` (status `RESEARCHED`).

## Syncing Sheets

```bash
npm run cli -- sheets:sync
```

Writes/updates one row per `CompetitorAd`, matched by the "Research ID"
column so re-syncing never duplicates rows. Runs automatically after every
research/publish/performance job if Sheets is configured.

## The approval workflow

A human reviews rows in the sheet, fills in the "Our *" columns (creative,
copy, headline, CTA, landing page) plus Launch Date/Time/Timezone, and sets
**Status = APPROVED** (or `REJECTED` to drop a row). The state machine is:

```
RESEARCHED -> SELECTED -> IN_PRODUCTION -> READY -> APPROVED -> SCHEDULED -> LIVE -> WINNER/LOSER
                                                    (also: REJECTED, BLOCKED, ERROR)
```

```bash
npm run cli -- approval:check
```

polls the sheet, pulls the human-edited fields into the database, and for
any row newly set to `APPROVED` validates: our creative, our copy,
headline, CTA, landing page, launch date, a valid timezone, and that Meta
is configured (token/account/page/campaign/ad set). If anything is
missing, the row is set to `BLOCKED` with a specific `errorReason` (shown
in the sheet's Notes column) and is **not** published. Only `APPROVED` rows
can ever enter the publishing pipeline.

## Publishing to Meta

```bash
npm run cli -- ads:publish              # publishes every due, approved row
npm run cli -- ads:publish --id=<id>    # force-publish one row now
```

The Publish Worker finds `TestCreative`s where `status=APPROVED`,
`metaAdId IS NULL`, and `launchAt <= now`, then for each: uploads the
creative (image or video, inferred from the file extension), creates the
Meta ad creative (`object_story_spec` with `link_data` or `video_data`),
creates the ad against the configured campaign/ad set, and stores
`metaCreativeId`/`metaAdId` back on the row (status -> `SCHEDULED`).

**Idempotency:** if `metaAdId` already exists, the row is skipped
unconditionally - repeated cron ticks never create duplicate ads. If the
process crashes after creating the ad creative but before creating the ad,
the next run reuses the stored `metaCreativeId` instead of re-uploading.
A `publishLock` field (`PUBLISHING`/`PUBLISHED`/`FAILED`) additionally
guards against a single row being processed twice in the same run.

### Dry run mode

`DRY_RUN=true` (the default) makes research, Sheets sync, and creative
downloading behave normally, but publishing never calls Meta - it logs
exactly what would be created and leaves the row untouched (still
`APPROVED`, no Meta IDs), for example:

```
DRY RUN

Competitor: Acme
TrendTrack Ad: tt-ad-2

Our Creative: https://cdn.example.com/our-ad.jpg
Campaign: camp_1
Ad Set: set_1
Launch: 2026-09-15 10:00 America/New_York

Would create:
  Meta Creative
  Meta Ad

No live Meta objects created.
```

Set `DRY_RUN=false` only once Meta credentials/campaign/ad set are
confirmed correct.

## Performance sync

```bash
npm run cli -- performance:sync
```

For every ad that has a `metaAdId` and isn't in a terminal state: checks
Meta's `effective_status` (promoting `SCHEDULED` -> `LIVE`), fetches
insights, and **upserts today's snapshot** (same-day re-runs update it;
prior days' snapshots are never overwritten). It then recomputes cumulative
performance and applies the configurable winner/loser thresholds
(`MIN_SPEND`, `MIN_IMPRESSIONS`, `TARGET_CPA`, `TARGET_ROAS`, `MIN_CTR`):
below the spend/impressions minimums the verdict is always
`INSUFFICIENT_DATA`; otherwise `WINNER` if it clears the CTR floor and
hits either the CPA or ROAS target, `LOSER` otherwise.

## Running the workers (production mode)

```bash
npm run worker
```

Starts one long-running process with four cron jobs (schedules from
`RESEARCH_CRON` / `APPROVAL_CRON` / `PUBLISH_CRON` / `PERFORMANCE_CRON`),
each independently guarded so one job's failure never stops the others.
Run it under your process manager of choice (systemd, pm2, a container
with restart-on-exit, etc).

**Enabling production mode:**

1. Fill in real TrendTrack/Google/Meta credentials in `.env`.
2. Point `DATABASE_URL` at Postgres (see Database setup) and switch the
   Prisma `provider`.
3. Set `STORAGE_PROVIDER=s3` and fill in `S3_*`.
4. Set `DRY_RUN=false` only after a successful dry-run pass.
5. `npm run build && node dist/worker.js` (or `npm run worker` with `tsx`).

## Error handling

Every external call (TrendTrack, Meta, Google Sheets, media downloads) goes
through retry/backoff with permanent-vs-retryable classification
(`src/lib/httpClient.ts`, `src/lib/errors.ts`): 4xx/validation errors fail
fast, 429/5xx/timeouts retry with exponential backoff. Every scheduled run
is recorded in `JobRun` (`RUNNING`/`SUCCESS`/`FAILED` with a sanitized error
message - access tokens are redacted before anything is logged or stored).
A failed research run doesn't block other competitors; a failed publish
marks that one row `ERROR` with the reason, and moves on.

## Testing

```bash
npm test          # vitest - 80+ tests across every module
npm run typecheck # tsc --noEmit
npm run lint      # eslint
```

Tests cover: TrendTrack pagination/errors/parsing, dedup (collation ID,
media/copy fallback, genuinely-different variants), scoring (normalization,
missing metrics, configurable weights, outlier dampening), Sheets row
mapping/parsing, the full research pipeline against a real Prisma test
database, approval validation and state transitions, Meta dry-run/real
publish/failure/idempotency, and timezone-aware launch scheduling.

## CLI reference

```
research:run [--competitor=<id>]
research:top [--competitor=<id>] [--limit=25]
sheets:sync
approval:check
ads:publish [--id=<testCreativeId>]
performance:sync
competitors:add --name= --advertiser-id= [--brandtracker-id=] [--category=] [--notes=]
competitors:list
```

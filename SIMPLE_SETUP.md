# Quick Setup (no coding required)

This gets you: your Google Sheet auto-filled with the highest-impression
ads across all of your competitors, plus a live web dashboard — updated
automatically every day, or on demand with one click. Everything below is
clicking buttons in websites you already use (Google, GitHub) — no
terminal, no code.

You list as many competitors as you want (2, 10, 30 - no limit). The
system fills two buckets: `SIMPLE_HIGH_REACH_AD_COUNT` slots (default 18)
picked purely by impressions, split across your competitors in proportion
to how many live ads each one is running - a competitor running far more
ads than the others earns more of the slots, but every competitor with at
least one eligible ad is guaranteed at least one slot - plus
`SIMPLE_RECENT_AD_COUNT` more slots (default 12) picked purely by
impressions from ads created since June 2026, with no competitor
weighting (see "How the final 30 are chosen" below).

Total time: about 10 minutes, once.

## 1. Create a "robot" Google account (service account)

This is the one slightly technical step, and it's unavoidable — Google
requires it before any program (including this one) can be given permission
to edit a Sheet automatically.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   sign in with any Google account.
2. Click the project dropdown at the top → **New Project** → name it
   anything (e.g. "ad-research") → **Create**.
3. In the search bar at the top, type **Google Sheets API** → open it →
   click **Enable**.
4. In the left menu: **IAM & Admin** → **Service Accounts** → **Create
   Service Account**. Name it anything (e.g. "sheet-writer") → **Create and
   Continue** → **Continue** → **Done**.
5. Click the service account you just created → **Keys** tab → **Add Key**
   → **Create new key** → choose **JSON** → **Create**. A `.json` file
   downloads. Open it in Notepad/TextEdit — you'll need to paste its full
   contents in step 3 below.
6. Inside that file, find `"client_email"` — it looks like
   `something@your-project.iam.gserviceaccount.com`. Copy that email.

## 2. Share your Google Sheet with the robot

1. Open your Google Sheet.
2. Click **Share** (top right) → paste the `client_email` from step 1.6 →
   make sure it's set to **Editor** → **Send** (uncheck "notify" if asked).
3. Copy the Sheet's ID from its URL — the long code between `/d/` and
   `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

## 3. Add your 3 secrets to GitHub

In this repository on GitHub: **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, and add these three, one at a
time:

| Secret name | Value |
|---|---|
| `TRENDTRACK_API_KEY` | Your TrendTrack API key |
| `GOOGLE_SHEET_ID` | The Sheet ID from step 2.3 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The **entire contents** of the `.json` file from step 1.5 (open it, select all, copy, paste) |

> A repository secret is never shown to anyone (not even you) after saving,
> and never appears in code or logs — this is the standard, safe way to
> hand a password to an automated job.
>
> ⚠️ You pasted your TrendTrack key in a chat earlier to get this built —
> once it's saved here as a secret, go rotate/regenerate that key in
> TrendTrack's dashboard so the old, exposed one stops working.

## 4. Tell it who your competitors are (and, optionally, your own landing pages)

In this repository: open the file **`competitors.simple.json`** → click the
pencil (✏️) icon to edit → replace the example entries with your real
competitor names and landing page URLs (add or remove as many as you
want) → **Commit changes**.

```json
{
  "myBrand": { "name": "YourDefaultBrandName" },
  "myLandingPages": [
    { "url": "https://brand-a.com/products/your-product", "type": "PDP", "brandName": "Brand A" },
    { "url": "https://brand-a.com/pages/your-advertorial", "type": "5 Reasons Why", "brandName": "Brand A" },
    { "url": "https://brand-b.com/pages/your-quiz", "type": "Quiz", "brandName": "Brand B" }
  ],
  "competitors": [
    { "name": "Competitor 1", "landingPage": "https://competitor1.com" },
    { "name": "Competitor 2", "landingPage": "https://competitor2.com" },
    { "name": "Competitor 3", "landingPage": "https://competitor3.com" }
  ]
}
```

That's the only file you ever need to touch again — to add, remove, or
swap out a competitor later, just edit this file the same way.

- **`myBrand.name`** (optional) — your default brand name, used for the
  swap below whenever a matched landing page doesn't specify its own.
  Skip it entirely if every one of your `myLandingPages` entries has its
  own `brandName`, or if you don't want the swap at all.
- **`myLandingPages`** (optional) — **one shared list**, not per
  competitor. List every landing page you've built (one, three, six, as
  many as you have, across as many of your own brands as you run — it's
  fine to add more later, or leave it as `[]` for now). For each ad,
  whichever entry here best matches *that ad's* competitor landing page
  type gets picked automatically — you don't assign pages to specific
  competitors yourself. For each entry:
  - **`url`** — paste it exactly as you want it to show up in the sheet.
  - **`type`** — a short label **you** choose for what kind of page it is
    (e.g. `"PDP"`, `"Home"`, `"Collection"`, `"5 Reasons Why"`, `"Quiz"`,
    `"Advertorial"`, `"VSL"` — anything). The system does **not** try to
    guess your page's type from its content; it only compares the label
    you type here against the competitor ad's own auto-detected type, and
    picks whichever of your pages is the closest match (exact wording
    doesn't need to match — "Advertorial" will still be matched against a
    competitor page auto-labeled `5-reasons-why`, for example).
  - **`brandName`** (optional) — this page's own brand name, if
    `myLandingPages` spans more than one of your brands (each brand's
    pages get their own brand name in the swap). Omit it to use the
    top-level `myBrand.name` for that entry instead.

The `competitors.simple.json` in this repo already has an empty
`"myLandingPages": []` waiting for you — edit that file, add `"myBrand"`
and fill in your pages following the example above.

## 5. Turn on your dashboard website

In this repository: **Settings** → **Pages** → under "Build and
deployment", set **Source** to **Deploy from a branch**, **Branch** to
`main` and folder to **`/docs`** → **Save**. GitHub will show you the live
URL (something like `https://your-username.github.io/your-repo/`) — that's
your dashboard.

## 6. Run it

In this repository: **Actions** tab → **Sync competitor ads** (left
sidebar) → **Run workflow** button → **Run workflow**. Wait about a minute,
then:

- Refresh your **Google Sheet** — a new tab called "Competitor Ads" will
  have the best ads across all of your competitors (18 by pure impressions
  plus 12 created since June 2026, or however many you've set).
- Refresh your **dashboard URL** from step 5 — you'll see the same ads as
  visual cards (thumbnail, headline, copy, impressions, days running, link
  to their landing page).

After this, it re-runs automatically every day at 6am UTC — you never have
to do anything again unless you want to change your competitor list (step
4, any number of them — 3, 10, 30, no limit) or force a refresh right now
(step 6). Every competitor is fetched in parallel, so adding more doesn't
meaningfully slow the sync down.

## What's in the Google Sheet

Each row is one winning ad, with:

- **Competitor** / **Platform** / **Page / Profile Name** — which brand, which
  ad platform the ad came from (`Meta` or `TikTok`), and which of their pages
  (Facebook Page name) or TikTok profiles ran it. A brand can run more than
  one page/profile per platform.
- **Ad Set** — see "Ad set clubbing" below.
- **Headline** — TrendTrack's own headline field when it has one; when it
  doesn't (common — most ads only have body copy), falls back to a short
  link-description field if TrendTrack has one, and only as a last resort
  derives one from the first sentence of the primary text, so this column
  is never blank.
- **Primary Text** — the competitor's original ad copy, unedited.
- **Localized Primary Text** — the same copy with the competitor's brand
  name (and any inline link mentions) swapped for yours, from `myBrand`
  and the matched `myLandingPages` entry (see step 4). Identical to
  Primary Text until you fill those in.
- **CTA** — the call-to-action button label (Meta ads only; TikTok ads don't
  carry a separate CTA field in TrendTrack's API, so this is blank for them).
- **Landing Page** / **Landing Page Type** — the exact URL the ad sends
  people to, and an auto-detected label for what kind of page it is: `PDP`
  for a plain product page, `Collection` for a category page, `Home` for
  the homepage, or the page's own slug (e.g. `5-reasons-why`) for an
  advertorial/quiz/listicle-style page. TikTok ads don't carry a per-ad
  destination URL in TrendTrack's API — only a bare domain — so this falls
  back to the competitor's own configured landing page (with its real path)
  for a more useful type classification than a bare domain would give.
- **My Landing Page** / **My Landing Page Type** — whichever entry in your
  shared `myLandingPages` list (step 4) best matches this ad's landing page
  type, and the type label you gave it. Blank until you add entries.
- **Media Type** / **Creative Preview** / **Media Link** — image or video,
  an inline visual preview of the actual creative, and the direct file URL.
- **Impressions (Reach)**, **Days Running**, **Date Created**, **Rank** —
  performance signals (for TikTok ads, reach is views, TikTok's closest
  equivalent). Date Created is the real date TrendTrack observed the ad
  actually start running (`firstSeenAt` for Meta, `publishedAt` for TikTok
  — never TrendTrack's own record-creation timestamp, which lags behind
  and isn't the ad's real launch date); if that field is ever missing, it's
  back-calculated from Days Running instead.

  Three hard rules decide which ads ever make it into the sheet, with no
  exceptions or fallback for any of them: any Meta page-engagement/"Like
  Page"/"Visit Profile" ad with no real landing page is always excluded;
  every ad must have **at least 5,000 impressions/views**; and every ad
  must have started running in **2026 or later**.

  On top of that, the final selection is two separate buckets - see "How
  the final ads are chosen" below.
- **TrendTrack Ad ID** / **TrendTrack Preview Link** — click the preview
  link to open the actual ad (TrendTrack's own viewer for Meta ads, the
  real TikTok video page for TikTok ads).

### Ad set clubbing

The selected ads are also grouped into ready-to-launch ad sets (labeled
e.g. "Ad Set 1 (Meta Video)", "Ad Set 2 (TikTok Video)", "Ad Set 3 (Meta
Static)") so you can hand a whole sheet section straight to whoever builds
your campaigns: each set has at most 5 ads, and a set never mixes video
with static (image) ads, or Meta with TikTok — a leftover handful of one
format/platform still gets its own (smaller) set rather than being mixed
in.

## Troubleshooting a specific ad's data

If something in the sheet looks wrong for a specific ad (wrong headline,
wrong copy, etc.) and you want to see exactly what TrendTrack returned for
it: **Actions** tab → **Sync competitor ads** → **Run workflow** → check
the **"Dump raw TrendTrack API responses..."** box → **Run workflow**.
Open that run's log afterward (click the run → the "Fetch competitor ads"
step) and search for the ad's ID — you'll see the complete raw response
TrendTrack sent back for it, which is the fastest way to report a data
issue precisely.

## How it finds every one of a competitor's ad accounts

You only give it a website — not a TrendTrack ID. Under the hood, for each
competitor it: looks up the domain to find TrendTrack's record of that
brand's website, then asks TrendTrack for every Facebook advertiser page
linked to that website (some brands run ads from more than one Facebook
page/ad account), then pools the ads from all of them together before
picking the top performers. So if a brand advertises from 2 Facebook
pages, both are covered automatically — you never have to hunt for a
"page ID" yourself.

## Meta and TikTok, fetched together

Every sync pulls ads from **both** Meta (Facebook/Instagram) and TikTok for
each competitor — TrendTrack indexes them as two separate libraries, and
both get pooled into the same sheet, subject to the same reach/2026
floors and the same two-bucket selection described above. TikTok ads are
resolved
from the same domain lookup as Meta (no separate ID to configure), fetched
as `active`, paid `ad`-type items only (never someone's organic/non-ad
video), and marked `TikTok` in the **Platform** column so you can always
tell which platform an ad came from. If you only want Meta ads, set
`SIMPLE_FETCH_TIKTOK=false` as a repository secret/variable (or in your
`.env` for local runs) and re-run the sync.

## How the final ads are chosen

The sheet is filled by two separate, non-overlapping buckets rather than
one global "best N by impressions" list:

**Bucket 1 - `SIMPLE_HIGH_REACH_AD_COUNT` ads (default 18), any date.**
Instead of a single global ranking (which would let one high-reach
competitor crowd everyone else out), each competitor's share of these
slots is set by their own total live-ad count relative to everyone
else's — a competitor running 400 live ads earns proportionally more
slots than one running 8, but that one still always gets at least one
slot as long as they have at least one eligible ad. Within its own
allocation, each competitor's best ads (by impressions) are picked. This
is a fixed arithmetic rule (largest-remainder apportionment, the same
method used to divide parliamentary seats by population) — not an AI
judgment call, and it never produces an even split either.

**Bucket 2 - `SIMPLE_RECENT_AD_COUNT` ads (default 12), created since June
2026.** From whatever's left after Bucket 1 (no double-counting), this
takes the single best-reach ads that started running on or after June
2026 — no competitor weighting, purely the top performers by impressions.
If there aren't enough eligible post-June ads to fill this bucket, it's
backfilled with the next-best-reach remaining ads (any date) so the sheet
still fills out fully whenever there's enough inventory overall - a
warning is logged when that happens.

## What if a competitor's ads don't show up?

If TrendTrack doesn't recognize a competitor's website domain at all,
that row's dashboard section will show a plain-English error explaining
exactly that. As a manual override, you can open the competitor's page on
TrendTrack's own website, find their advertiser ID there, and pin it in
`competitors.simple.json` like this:

```json
{ "name": "Competitor 1", "landingPage": "https://competitor1.com", "advertiserId": "the-id-from-trendtrack" }
```

Note that a pinned `advertiserId` locks the sync to that one page only —
it skips the automatic "find every page" step above. Only add it if the
automatic lookup genuinely can't find the competitor.

---

*This "simple" mode intentionally skips the advanced parts of this project
(Meta ad publishing, local database, cloud storage) — it's just research →
Sheet → dashboard. The full pipeline (with Meta publishing and an approval
workflow) is still in this repo and documented in `README.md` if you ever
want to grow into it.*

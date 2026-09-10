# Quick Setup (no coding required)

This gets you: your Google Sheet auto-filled with your 3 competitors'
highest-impression ads, plus a live web dashboard — updated automatically
every day, or on demand with one click. Everything below is clicking
buttons in websites you already use (Google, GitHub) — no terminal, no code.

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

## 4. Tell it who your 3 competitors are

In this repository: open the file **`competitors.simple.json`** → click the
pencil (✏️) icon to edit → replace the 3 example entries with your real
competitor names and landing page URLs → **Commit changes**.

```json
{
  "competitors": [
    { "name": "Competitor 1", "landingPage": "https://competitor1.com" },
    { "name": "Competitor 2", "landingPage": "https://competitor2.com" },
    { "name": "Competitor 3", "landingPage": "https://competitor3.com" }
  ]
}
```

That's the only file you ever need to touch again — to swap out a
competitor later, just edit this file the same way.

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
  have the highest-impression ads from all 3 competitors.
- Refresh your **dashboard URL** from step 5 — you'll see the same ads as
  visual cards (thumbnail, headline, copy, impressions, days running, link
  to their landing page).

After this, it re-runs automatically every day at 6am UTC — you never have
to do anything again unless you want to change the 3 competitors (step 4)
or force a refresh right now (step 6).

## What if a competitor's ads don't show up?

If TrendTrack doesn't recognize a competitor's website domain directly,
that row's dashboard section will show a plain-English error explaining
exactly that, and telling you to open the failing competitor's page on
TrendTrack's own website, find their advertiser ID there, and add it to
`competitors.simple.json` like this:

```json
{ "name": "Competitor 1", "landingPage": "https://competitor1.com", "advertiserId": "the-id-from-trendtrack" }
```

---

*This "simple" mode intentionally skips the advanced parts of this project
(Meta ad publishing, local database, cloud storage) — it's just research →
Sheet → dashboard. The full pipeline (with Meta publishing and an approval
workflow) is still in this repo and documented in `README.md` if you ever
want to grow into it.*

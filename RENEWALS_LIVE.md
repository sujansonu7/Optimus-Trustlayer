# Making the /sources Renewals badge go green

The Renewals tab on `/sources` shows one of two badges:

| Badge | Meaning |
| --- | --- |
| 🟢 **Live** | The rows on screen were just read from Google. |
| 🟠 **showing cached data** | Every live path failed, so `fixture/renewals_tracker.csv` is being shown instead. |

`loadRenewals()` (`lib/renewals.ts`) tries three sources in order and takes the
first that works:

1. **Service account** — private sheet, exact Drive `modifiedTime`. Needs a Google Cloud project.
2. **Published CSV** — a "Publish to web" link. No Google Cloud, no auth at all.
3. **Cached CSV** — the local fixture. This is the amber state.

Both 1 and 2 are genuine reads from Google, so a green badge is honest either
way. They differ in *who can see the sheet* and *how good the timestamp is* —
not in whether the data is live.

---

## Option A — Sheet CSV export (no Google Cloud account)

Use this when you don't have GCP access.

> ⚠️ **This works because the sheet is already link-readable.** Anyone with the
> URL can read it — no Google login required. That was already true of the demo
> sheet before this fallback existed; it is fine for fixture data, but never
> point this at a sheet with real customer records. Use Option B for those.

### A.1 — If the sheet is already shared "anyone with the link" (fastest)

Nothing to click. Google serves any link-readable sheet as CSV directly:

```
RENEWALS_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv
```

`<SHEET_ID>` is the long token between `/d/` and `/edit` in the sheet URL. For the
bundled demo sheet this is already set in `.env`. Restart the dev server and
reload `/sources`.

To check a sheet qualifies, open the export URL in a private/incognito window —
if you see CSV rather than a sign-in page, you're done.

### A.2 — If the sheet is private: publish just that tab

Takes about a minute, and makes the published tab public.

#### Browser steps

1. Open the Renewals spreadsheet in Google Sheets (you must be its owner or an editor).
2. Menu bar → **File** → **Share** → **Publish to web**.
3. In the dialog, stay on the **Link** tab.
4. Left dropdown: choose the specific **tab** holding the renewals rows (not "Entire Document" — that publishes a bundle, not clean CSV).
5. Right dropdown: change **Web page** to **Comma-separated values (.csv)**.
6. Click **Publish**, then **OK** in the browser confirmation.
7. Copy the URL it shows. It looks like:
   ```
   https://docs.google.com/spreadsheets/d/e/2PACX-1vT.../pub?gid=0&single=true&output=csv
   ```
   It contains `/d/e/` and ends in `output=csv`. If your URL has `/d/` **without**
   the `/e/`, you copied the normal sharing link — go back to step 2.

### Wire it up

Add to `.env` (git-ignored):

```
RENEWALS_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vT.../pub?gid=0&single=true&output=csv
```

Restart the dev server — Next.js only reads `.env` at boot — then reload `/sources`.

### Notes

- Edits to the sheet appear within roughly a minute; Google caches the published copy briefly.
- **The badge will read "Live · read just now" on this path.** Neither CSV endpoint returns a `Last-Modified` header, so there is no edit time to show. Rather than pass fetch time off as an edit time, the badge states only what's true: the read is fresh. Option B shows a real "updated 2 hours ago".
- To undo A.2: same dialog → **Stop publishing**, and remove the env var.

---

## Option B — Service account (the real path)

Keeps the sheet **private** and gives an exact last-modified time. This is what
production should use. Nothing needs to change in the code — adding credentials
is enough, because the service account is tried *first* and Option A is only a
fallback.

### Browser steps: Google Cloud

1. Go to <https://console.cloud.google.com/> and sign in.
2. **Create a project** (skip if you have one): project dropdown in the top bar → **New Project** → name it (e.g. `trustlayer`) → **Create**. Wait for the notification, then make sure that project is selected in the dropdown.
3. **Enable both APIs.** This is the step most often half-done — the app calls Sheets *and* Drive, so enabling only Sheets still lands you on amber.
   - Go to <https://console.cloud.google.com/apis/library/sheets.googleapis.com> → **Enable**.
   - Go to <https://console.cloud.google.com/apis/library/drive.googleapis.com> → **Enable**.
4. **Create the service account.** Navigation menu (☰) → **IAM & Admin** → **Service Accounts** → **+ Create service account**.
   - *Service account name*: `trustlayer-sheets-reader` → **Create and continue**.
   - *Grant this service account access to project*: *skip it* — click **Continue**. Project roles grant nothing here; access comes from sharing the sheet in step 6.
   - Click **Done**.
5. **Download the key.** Click the new service account → **Keys** tab → **Add key** → **Create new key** → select **JSON** → **Create**. The file downloads immediately. It is the only copy — Google will not show it again.
6. **Share the sheet with it.** Copy the service account's email (ends in `.iam.gserviceaccount.com`), open the Renewals spreadsheet → **Share** → paste the email → set role to **Viewer** → untick "Notify people" → **Share**.

### Wire it up locally

Save the downloaded file to the project root as:

```
google-service-account.json
```

`.gitignore` already excludes `google-service-account.json`, `*-service-account.json`, and `*.credentials.json`, so it will not be committed. Restart the dev server.

To keep it elsewhere, point `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` at the path instead.

### Wire it up on Vercel

A file on disk isn't available to a Vercel build, so pass the JSON as an env var.

1. Vercel dashboard → your project → **Settings** → **Environment Variables**.
2. **Key**: `GOOGLE_SERVICE_ACCOUNT_JSON`
3. **Value**: the **entire contents** of the downloaded JSON file, pasted as-is.
   - Paste it verbatim, including the outer `{ }`. Do **not** hand-edit the `\n`
     sequences inside `private_key` — the code runs `JSON.parse`, which converts
     them to real newlines. "Fixing" them is what usually breaks this.
   - Do not wrap the whole thing in extra quotes.
4. Tick the environments it applies to (Production, Preview, Development).
5. **Save**, then **redeploy** — env var changes only take effect on a new build.

Also set `RENEWALS_SHEET_ID` there if you're pointing at a different sheet than
the built-in default.

`GOOGLE_SERVICE_ACCOUNT_JSON` takes precedence over the key file, so once it's
set on Vercel the deployment uses it regardless of Option A.

---

## Still amber? Read the reason

The fallback records why *every* path failed. Check the server logs (terminal for
`npm run dev`, or the Vercel function logs) for:

```
No live renewals path succeeded; serving cached CSV instead: [ ... ]
```

Common causes:

| Message | Cause |
| --- | --- |
| `ENOENT ... google-service-account.json` | No key file, and no `GOOGLE_SERVICE_ACCOUNT_JSON`. Expected if you're on Option A. |
| `Sheets API 403` | Sheets API not enabled, **or** the sheet was never shared with the service account email. |
| `Drive API 403` | Drive API not enabled — the easy one to miss, since Sheets alone looks fine. |
| `Sheets API 404` | Wrong `RENEWALS_SHEET_ID`. It's the long token between `/d/` and `/edit` in the sheet URL. |
| `Published CSV URL returned HTML, not CSV` | Publishing was turned off, or the link isn't an `output=csv` published link. |
| `RENEWALS_SHEET_CSV_URL not set` | Option A not configured. Expected if you're on Option B. |
| `invalid_grant` / `Invalid JWT` | Key was revoked or the pasted JSON is malformed. |

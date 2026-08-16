# TrustLayer

TrustLayer is a knowledge app for a company whose customer data lives in four places that do not agree: a CRM, a spreadsheet, email, and call transcripts.

It reads those sources, joins the same customer under one name, and when two tools disagree it tells you **which value it trusts and why**. Every answer shows its sources. You can also hand it a messy to-do list and watch it work.

**If you have five minutes** (hiring manager, founder, buyer): read [VISION.md](VISION.md). That is the idea — nine layers, why this order, and what this repo can show today versus what is still ahead. Layer 9, commitments, is not built yet.

**If you want to run it:** start at [Get running](#get-running-about-10-minutes). You can load the bundled fictional company, or point it at **your own** CRM export, spreadsheet, emails, and call transcripts.

---

## Two ways to use this

| Path | What you load | When to use it |
|---|---|---|
| **A. Demo data** | The fictional company already in this repo (Meridian Analytics) | First run, a hiring conversation, or a buyer walkthrough. Ready in one click. |
| **B. Your data** | Your own CRM export, renewals spreadsheet, emails, and transcripts | You want to see TrustLayer on real accounts. There is no HubSpot / Gmail login — you drop exports into the same folders the demo uses, then ingest. |

Both paths use the same app. After ingest, Ask, Conflicts, Entities, and Crew run on whatever is in the database.

---

## What you will see (demo path)

The bundled company is **Meridian Analytics**, a small B2B software vendor. The snapshot date is **15 March 2026**.

The account that makes the product click is **Cobalt Ridge Manufacturing**:

| Source | Renewal date |
|---|---|
| CRM | 30 September 2026 (stale) |
| Spreadsheet | 30 June 2026 (updated from the signed order form) |

TrustLayer picks **30 June 2026** because you declared the spreadsheet the system of record for renewal dates — and it shows both sides.

---

## What you need

| You need | Required? | What it is for |
|---|---|---|
| [Node.js](https://nodejs.org/) 18 or newer | Yes | Runs the app. The installer includes `npm`. |
| A Postgres database | Yes | Where every fact is stored. A free [Neon](https://neon.tech) project is enough. |
| An [Anthropic](https://console.anthropic.com/settings/keys) API key | Yes, for anything useful | Reads emails and transcripts, answers questions, runs Crew and the agent. This costs a little money. Loading the demo once is usually well under a dollar. |
| An [E2B](https://e2b.dev/dashboard) API key | No | Only needed if you want the agent to draw charts. The free tier is enough. |
| Google Sheet credentials | No | Only needed if you want the Renewals tab to say “Live” instead of “cached.” The demo works without this. |

You do **not** need Docker, Redis, or a second service.

---

## Get running (about 10 minutes)

### 1. Install Node.js

Download the current LTS from [nodejs.org](https://nodejs.org/) and install it. Then open a terminal and check:

```bash
node -v
npm -v
```

You should see version numbers. If the commands are not found, close the terminal and open a new one.

### 2. Get the project

```bash
git clone https://github.com/YOUR_ORG/trustlayer.git
cd trustlayer
```

If you downloaded a zip instead, unzip it and `cd` into that folder.

### 3. Create a database

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Open **Connection details** and copy the connection string. It starts with `postgresql://`.
3. Use the URI that includes `sslmode=require`.

Any Postgres database with a connection string works. Neon is just the shortest path.

### 4. Get an Anthropic key

1. Open [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Create a key and copy it.
3. Make sure the workspace has a little credit. If the balance is $0, Ask, ingest, and Crew will fail with a billing error — that is not a bug in this repo.

### 5. Put the secrets in a local file

Copy the example file and rename it `.env`:

```bash
# Mac / Linux
cp .env.example .env

# Windows PowerShell
copy .env.example .env
```

Open `.env` in a text editor and fill in two lines:

```
DATABASE_URL=postgresql://...your Neon string...
ANTHROPIC_API_KEY=sk-ant-...
```

Leave the other lines alone. You can add `E2B_API_KEY` later if you want charts.

Never commit `.env`. It is already in `.gitignore`.

### 6. Install, set up the database, start the app

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The badge next to the title must say **Database connected** (green). If it is red, the database URL is wrong or migrate did not run — fix `.env`, run `npm run db:migrate` again, then reload.

---

## Load data

A green badge means the app can reach Postgres. It does **not** mean customer data is loaded yet. Until you ingest, Ask will have nothing to cite.

### Path A — the demo (fictional company)

**Guided (recommended the first time)**  
Open [http://localhost:3000/onboarding](http://localhost:3000/onboarding) and walk through Setup: Welcome → Connect → Build → Declare → Prove it.

- The spreadsheet card can talk to a real Google Sheet if you configured one. CRM, email, and calls use a short connector, then **Build** reads the files in `fixture/`.
- Emails and transcripts go through Anthropic. This takes a few minutes.

**Faster**  
Open [http://localhost:3000/admin](http://localhost:3000/admin) and click **Ingest fixture**. Wait until the run finishes.

Then go back to [http://localhost:3000](http://localhost:3000) and click:

> **When does Cobalt Ridge Manufacturing renew?**

You should get June 30, both sides of the disagreement, and a sentence about the spreadsheet being the system of record.

### Path B — your real sources

There is no “Sign in with HubSpot” or “Connect Gmail” button. You export from the tools you already use, put the files where the demo files live, and ingest. The product then treats that as the source of truth.

**Do not commit real customer files to git.** Keep them on your machine. `fixture/` is not ignored.

1. **Optional but wise:** copy `fixture/` aside so you can restore the demo later.
2. Replace the four sources. Keep the **file names** and the **column headers** below — extra columns are fine; missing required ones are skipped.

| Your source | Put the file here | Required headers (exact names) |
|---|---|---|
| CRM accounts | `fixture/crm_accounts.csv` | `account_name`, `last_activity_date`, plus any of: `account_owner`, `tier`, `industry`, `status`, `arr_usd`, `renewal_date`, `primary_contact`, `primary_contact_title`, `primary_contact_email` |
| CRM deals | `fixture/crm_deals.csv` | `account_name`, `close_date`, plus any of: `deal_name`, `deal_stage`, `deal_owner`, `product`, `amount_usd` |
| Renewals spreadsheet | `fixture/renewals_tracker.csv` **or** a live Google Sheet ([RENEWALS_LIVE.md](RENEWALS_LIVE.md)) | `account`, `last_edited`, plus any of: `renewal_date`, `account_owner`, `tier`, `status`, `arr_usd` |
| Email | `fixture/emails/*.txt` (one file per message) | First lines like a real email: `From:`, `To:`, `Subject:`, `Date:`, then a blank line, then the body |
| Call transcripts | `fixture/transcripts/*.txt` (one file per call) | Plain text. A header with account and date helps; speaker turns are enough |

Look at the files already in `fixture/` if you want a filled-in example. Column names must match; the company names can be yours.

3. **Spreadsheet live (optional).** To read a real Google Sheet instead of the CSV, follow [RENEWALS_LIVE.md](RENEWALS_LIVE.md). Use the same headers as `renewals_tracker.csv`. This is the one source that can stay in Google and be read live.
4. Open [http://localhost:3000/admin](http://localhost:3000/admin) → **Reset demo** (clears the fictional facts) → **Ingest fixture**. Wait until it finishes. More email and transcript files cost more Anthropic credit.
5. Open [http://localhost:3000](http://localhost:3000) and ask about **your** accounts — for example, “When does [your customer] renew?”

On `/settings`, set which tool is allowed to win for renewals, ownership, and the rest. That is what makes a disagreement settle out loud instead of guessing.

To go back to the fictional demo: restore the original `fixture/` files, Reset demo, ingest again.

---

## A 10-minute tour

Every page is linked from the bottom of the home page.

| Page | URL | What to do |
|---|---|---|
| Ask | `/` | Ask the Cobalt Ridge question. Click a citation to see the exact passage. |
| Sources | `/sources` | The raw CRM, spreadsheet, inbox, and transcripts — no cleanup applied. |
| Conflicts | `/conflicts` | Every live disagreement, the winner, and the rule in plain English. |
| Facts | `/facts` | Every stored fact, with tool, document, time, and quote. |
| Entities | `/entities` | One customer, every spelling each tool used. |
| Review | `/review` | Borderline “are these the same company?” cases. Approve or keep separate. |
| Decisions | `/decisions` | Every automatic decision. **Revert** undoes one. |
| Crew | `/crew` | Paste a messy brain-dump, review the plan, then confirm. Nothing runs until you confirm. |
| Library | `/library` | Finished briefs the agent produced. |
| Settings | `/settings` | Systems of record and freshness rules. |
| Admin | `/admin` | Ingest, turn a source off, reset the demo, quality scores. |

A Crew dump that matches the demo data:

> Prep the Cobalt Ridge renewal and confirm the real date, verify the Prairie Point discount, check whether Grantline is still an active customer, and draft a QBR summary.

After Crew finishes, open `/library` for the briefs and `/facts` for anything it filed back.

To start over: `/admin` → **Reset demo**. That wipes derived data (facts, decisions, Crew, Library). Then ingest again.

---

## Optional extras

**Charts.** Add `E2B_API_KEY` to `.env`, restart `npm run dev`, and ask for “QBR summary for Northwind Freight with a revenue chart.” The agent writes Python, runs it in an isolated sandbox, and attaches the chart. No database password ever goes into the sandbox.

**Live Renewals badge.** Without extra setup, `/sources` → Renewals shows amber “cached” and uses the file in this repo. That is fine. To read a real Google Sheet instead, follow [RENEWALS_LIVE.md](RENEWALS_LIVE.md). Skip it on day one.

---

## What this is not (yet)

These are easy to assume from the name. They are **not** in this repo:

- One-click OAuth into HubSpot, Salesforce, Gmail, or Gong — use exports (Path B) instead
- Writing a corrected date back to Google Sheets
- A scheduled morning brief
- A week-long job you can fast-forward
- Ingesting the Slack, Notion, or billing files that sit in `fixture/` (they are unused)

---

## If something goes wrong

| What you see | What to do |
|---|---|
| Red “Database not connected” | Check `DATABASE_URL` in `.env`. Run `npm run db:migrate`. Restart `npm run dev` (it only reads `.env` at start). |
| Ask says there is no evidence | You have not ingested yet. Use `/onboarding` or `/admin` → **Ingest fixture**. |
| Your CSV columns were ignored | Headers must match the names in Path B exactly (for example `account_name`, not `Account Name`). |
| “credit balance is too low” | The Anthropic workspace needs credit. Not a code bug. |
| Renewals badge is amber | Expected until you follow [RENEWALS_LIVE.md](RENEWALS_LIVE.md). The rest of the app still works. |
| Charts fail or never appear | `E2B_API_KEY` is missing or the sandbox timed out. Ask still works. |

---

## For developers

One app, one database.

- **Next.js 14** (TypeScript, App Router, Tailwind)
- **Postgres** (Neon or any host) — schema in `migrations/`, applied by `npm run db:migrate`
- **Anthropic** for extract, Ask, Crew, and the agent
- **E2B** (optional) behind a `Runner` interface in `lib/agent/runner/`

Facts are append-only: a new value supersedes the old one; nothing is overwritten. The agent keeps no durable knowledge — that all lives in Postgres.

The idea, for a non-technical reader: [VISION.md](VISION.md).  
Working rules for anyone changing the code: [CLAUDE.md](CLAUDE.md).  
Demo dataset: [fixture/README.md](fixture/README.md).  
Demo walkthrough (also seeds the home-page question chips): [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

```
npm run dev          # http://localhost:3000
npm run db:migrate   # apply migrations (safe to re-run)
npm run build        # production build
npm run lint         # Next.js lint
```

---

## License

MIT. See [LICENSE](LICENSE).

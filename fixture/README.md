# Meridian Analytics — Test Fixture

Fictional dataset shipped with TrustLayer so the app can run without anyone’s
real CRM or inbox.

- **Company:** Meridian Analytics — ~60-person B2B SaaS vendor selling "Meridian Pulse".
- **Snapshot / "today":** March 15, 2026. All relative timestamps anchor here.
- **~35 customer accounts** across the four ingested tools, plus unused supporting files.

How to load this into the app: see the README — **Path A** (this demo) or **Path B** (replace these files with your own exports, same names and headers).
The account that disagrees with itself in the demo is **Cobalt Ridge Manufacturing**.

## Live sources (shown at `/sources`, ingested by the app)

| File / folder | Simulated system |
|---|---|
| `crm_accounts.csv`, `crm_deals.csv` | CRM (Salesforce / HubSpot-style export) |
| `renewals_tracker.csv` | Ops/Finance spreadsheet (RevOps) — has `last_edited` per row |
| `emails/` (28 `.txt` files) | Email (Gmail/Outlook threads) |
| `transcripts/` (8 files) | Call transcripts (Gong) |

## Supporting sources (not ingested, not shown as tabs)

These files exist for the answer key and future work. The app does **not** read
them today.

| File / folder | Simulated system |
|---|---|
| `billing_line_items.csv` | Billing system (SKUs) |
| `slack/` | Slack exports |
| `notion/product-naming.md` | Engineering/internal docs |

## Answer keys

| File | Role | Who may read it |
|---|---|---|
| `labeled_pairs.csv` | ~200 entity-pair judgments (same_entity, difficulty) | **Admin only** — the Gate-1 scoreboard on `/admin` grades the resolver *after* it has decided. Nothing here is fed into Ask, Conflicts, or the agent. The HTTP source route still refuses to serve this file. |
| `planted_conflicts.md` | One entry per planted conflict and which source should win | **Humans only.** The app must not read this file. |

The `/sources` page has **no resolution logic** — it exists only to make the raw mess visible.

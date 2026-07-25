# Meridian Analytics — Test Fixture

Fictional dataset for testing entity-resolution / conflict-detection tooling.

- **Company:** Meridian Analytics — ~60-person B2B SaaS vendor selling "Meridian Pulse".
- **Snapshot / "today":** March 15, 2026. All relative timestamps anchor here.
- **~35 customer accounts** across five simulated source systems.

## Live sources (rendered at `/sources` in the app)
| File / folder | Simulated system |
|---|---|
| `crm_accounts.csv`, `crm_deals.csv` | CRM (Salesforce / HubSpot-style export) |
| `renewals_tracker.csv` | Ops/Finance spreadsheet (RevOps) — has `last_edited` per row |
| `emails/` (28 `.txt` files) | Email (Gmail/Outlook threads) |
| `transcripts/` (8 files) | Call transcripts (Gong) |

## Supporting sources (not shown as tabs, referenced by the answer key)
| File / folder | Simulated system |
|---|---|
| `billing_line_items.csv` | Billing system (SKUs) |
| `slack/` | Slack exports (#account-handoffs, #eng-general) |
| `notion/product-naming.md` | Engineering/internal docs |

## Answer keys — the app must NEVER read these
| File | Role |
|---|---|
| `labeled_pairs.csv` | ~200 entity-pair judgments (same_entity, difficulty) |
| `planted_conflicts.md` | one entry per planted conflict + which source should win |

The `/sources` page has **no resolution logic** — it exists only to make the raw mess visible.

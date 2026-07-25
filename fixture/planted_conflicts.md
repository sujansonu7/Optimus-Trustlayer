# Planted Conflicts — Answer Key

**Fixture:** Meridian Analytics (fictional ~60-person B2B SaaS vendor, product "Meridian Pulse").
**Snapshot / "today":** March 15, 2026. All relative timestamps are anchored to this date.
**Purpose:** ground truth for testing entity-resolution / conflict-detection tooling.

> ⚠️ This file (and `labeled_pairs.csv`) are the **answer key**. The application must
> never read from them. They exist only so a human can grade the tool's output.

There are **~35 accounts** total. The ~15 accounts below carry deliberately planted
problems. The remaining ~20 are clean filler (consistent everywhere), except for 3
that carry *trivial formatting variation only* (see Conflict 12) to test for false
positives.

---

## 1. Identity Mess — One Customer, Four Names

**Real entity:** Silverline Logistics Group, Inc. — freight/logistics, ~$210,000 ARR, Enterprise tier.
**Contact:** Renee Ashford (VP Operations). **AE:** Marcus Ohene.

| Source | Name as it appears | File(s) |
|---|---|---|
| CRM (Salesforce/HubSpot export) | `Silverline Logistics Group, Inc.` | `crm_accounts.csv` (ACC-1001), `crm_deals.csv` |
| Ops spreadsheet | `SLG-West` (region-code shorthand) | `renewals_tracker.csv` |
| Email domain / signature | `silverlinelogistics.io` / "Silverline Logistics" | `emails/2025-09-18_silverline_01_ashford-rebrand.txt`, `emails/2026-02-24_silverline_02_ashford-to-ohene.txt`, `emails/2026-02-25_silverline_03_ohene-to-ashford.txt` |
| Call transcript (Gong) | "Silverline" / "the Silverline folks" / "we're SLG for short internally" | `transcripts/2025-11-12_silverline_qbr.txt`, `transcripts/2026-02-20_silverline_renewal-prep.txt` |

**Conflict:** four surface names for one entity. The customer rebranded their site/email to
`.io` (dropping "Group") in 2024, but the CRM legal name was never updated.
**Which should "win":** the **CRM legal name** `Silverline Logistics Group, Inc.` is the
canonical entity name; all others are aliases that must resolve **into** it.
**Correct resolution:** all four → **same entity**.

---

## 2. Near-Miss Pairs — Genuinely Different Companies, Confusingly Similar Names

These must **stay split**. A resolver that merges any of them is wrong.

| Company A | Company B | Why different | Files |
|---|---|---|---|
| Beacon Health Partners (Columbus, OH) — AE Sara Lindqvist | Beacon Healthcare Systems (Tampa, FL) — AE Diego Marin | Different HQ, owner, ownership | `crm_accounts.csv` (ACC-1002 vs ACC-1003) |
| Nova Materials Inc. (Pittsburgh, PA) — $95K legacy | Nova Material Sciences LLC (Austin, TX) — $340K new logo, signed Q4 2025 | Different size/vintage/city/rep | ACC-1004 vs ACC-1005; `transcripts/2025-12-03_novamaterialsciences_onboarding.txt`; `emails/2026-01-28_novamaterials_01_support.txt` |
| Crestview Financial Group (Chicago, IL) — churned 2024 | Crestview Capital Advisors (Denver, CO) — active $150K | Merging would resurrect a churned account | ACC-1006 vs ACC-1007 |
| Atlas Freight Solutions (Memphis, TN) | Atlas Freight Logistics (Charlotte, NC) | Same vertical, onboarded ~3 weeks apart in 2025 — hardest pair | ACC-1008 vs ACC-1009 |
| Brightpath Consulting (Seattle, WA) — brightpathconsulting.com, Tax ID 47-3921004 | Brightpath Digital (Seattle, WA) — brightpath.digital, Tax ID 88-2140577 | Same city (deliberate), different domains + tax IDs | ACC-1010 vs ACC-1011 |

**Which should "win":** neither — they are distinct entities. Decisive split signals: HQ,
domain, tax ID, account owner, ARR/vintage. **Geographic proximity alone is NOT a merge signal**
(Brightpath pair, same city).
**Correct resolution:** each pair → **different entities**.

---

## 3. Renewal Date Conflict — Cobalt Ridge Manufacturing

Enterprise tier, ARR $184,000. **AE:** Sara Lindqvist. **Contact:** Tomas Reyes.

| Source | Renewal date on record | Last updated | File |
|---|---|---|---|
| CRM | **September 30, 2026** | July 10, 2025 (~8 months stale) | `crm_accounts.csv` (ACC-1012), `crm_deals.csv` (renewal deal close date) |
| Ops spreadsheet | **June 30, 2026** | March 11, 2026 (4 days before snapshot) | `renewals_tracker.csv` (order form ref `CRM-CBR-2026-0311`) |

**Which should "win":** the **spreadsheet (June 30, 2026)**. It was updated 4 days ago by
RevOps directly from the countersigned order form (ref `CRM-CBR-2026-0311`), which amends
the term to the customer's fiscal year. The CRM date reflects an earlier, superseded
contract term and hasn't been touched since before the amendment.
**Supporting evidence:** `emails/2026-03-10_cobaltridge_01_reyes-orderform.txt`,
`emails/2026-03-11_cobaltridge_02_sara-to-revops.txt`,
`transcripts/2026-03-04_cobaltridge_renewal.txt`.

---

## 4. Buried Exception — Unrecorded Discount Approval — Prairie Point Retail Co.

Growth tier, ARR $96,000, renewal due May 2026. **AE:** Marcus Ohene.
**Approver:** Diane Kessler (VP Sales). **Contact:** Priya Nair.

**The conflict:** Diane approved a **one-time 20% discount** on the renewal by email on
March 6, 2026, and explicitly told Marcus to "loop in RevOps so billing reflects it
correctly, and note it somewhere." **Marcus never did.** Every structured system still shows
the **full price ($96,000)**:

- `crm_accounts.csv` (ACC-1013) → ARR $96,000
- `crm_deals.csv` → renewal deal amount $96,000, no discount note
- `renewals_tracker.csv` → $96,000, note says "Full-price quote on file"

**The only record of the discount** is the email thread:
- `emails/2026-03-06_prairiepoint_01_ohene-to-kessler.txt` (request)
- `emails/2026-03-06_prairiepoint_02_kessler-to-ohene.txt` (approval — instructs loop-in RevOps)
- `emails/2026-03-07_prairiepoint_03_ohene-to-nair.txt` (discount extended to customer; **RevOps not cc'd**)
- `emails/2026-03-10_prairiepoint_04_nair-to-ohene.txt` (customer accepts)
- context: `transcripts/2026-03-05_prairiepoint_pricing.txt`

**Which should "win":** the **email thread** is the true intent (a 20% discount was
approved and extended). Any "quoted vs. signed price" reconciliation will show an
unexplained ~20% gap whose only justification lives in email — that gap is the finding.

---

## 5. Additional Conflicts

### 5a. ARR Mismatch (board deck vs. finance sheet) — Quantum Peak Insurance
**AE:** Diego Marin.
- Board deck value: **$410,000** — recorded in this fixture via `emails/2026-03-02_quantumpeak_02_deckprep.txt` (slide 14, "Top Accounts by ARR") and noted in `planted_conflicts` context. (No literal .pptx is shipped; the deck figure lives in that email + this key.)
- `renewals_tracker.csv` (ACC-1014) & `crm_accounts.csv`: **$365,000**
- **Root cause:** the deck number bundles a **$45,000 one-time professional-services add-on** that Finance does not count as recurring ARR. See `billing_line_items.csv` (SKU-40012-PS, recurring=no), `emails/2025-12-12_quantumpeak_01_psaddon.txt`, `transcripts/2026-01-28_quantumpeak_services.txt`.
- **Which should "win":** for **recurring ARR**, the **$365,000** (finance/sheet) figure. The $410K is correct only as "total account value including one-time services," which is not ARR.

### 5b. Wrong / Stale Account Owner — Thornbury & Cole Insurance Group
- `crm_accounts.csv` (ACC-1015) "account_owner": **Jordan Ellis**
- Reality: Jordan Ellis left Meridian in **October 2025**. Account reassigned to **Sara Lindqvist**.
- Corrected in `renewals_tracker.csv` (owner = Sara Lindqvist) and in Slack (`slack/account-handoffs.txt`, Oct 22 2025 message) and `emails/2025-10-21_thornbury_01_handoff.txt`. **CRM field never updated.**
- **Which should "win":** **Sara Lindqvist** (spreadsheet + Slack + email agree, and are more recent than the CRM field).

### 5c. Churned Account Still Marked "Active" — Grantline Media Group
- Contract end date: **January 31, 2026**. Customer confirmed non-renewal Jan 14, 2026 ("Confirming we will not be renewing past Jan 31") — `emails/2026-01-14_grantline_01_vasquez-nonrenewal.txt`, `transcripts/2026-01-09_grantline_review.txt`.
- `crm_accounts.csv` (ACC-1016): status still **"Active — Renewal Upcoming"**, phantom renewal date **April 30, 2026**; `crm_deals.csv` has an open renewal deal.
- `renewals_tracker.csv`: status **Churned** (edited Jan 15, 2026), no renewal date; Slack confirms (`slack/account-handoffs.txt`).
- **Which should "win":** **Churned** (customer email + spreadsheet + Slack all agree; CRM is stale because no one updated it after the churn email).

### 5d. Duplicate-Looking Contact Records (contrast case) — Beacon Health Partners
- CRM contact: **Elizabeth Munro**, Director of Analytics (`elizabeth.munro@beaconhealthpartners.com`) — `crm_accounts.csv` (ACC-1002).
- Support/email: **"Liz Munro"**, same email address — `emails/2026-03-05_beaconhealth_01_munro.txt`.
- **Which should "win":** these are the **same person** — must resolve together. This is the
  deliberate contrast to the company-level near-misses in Conflict 2 (which must stay split).

---

## 6. Non-Person Entities With Naming Drift

### 6a. Core platform — all the SAME product
| Context | Name | File |
|---|---|---|
| Marketing / sales | Meridian Pulse | `notion/product-naming.md` |
| Engineering | Project Fathom (codename, still used) | `slack/eng-fathom-lighthouse.txt`, `notion/product-naming.md` |
| Billing | SKU-10045-ENT ("Pulse Enterprise v3") | `billing_line_items.csv` |
| Support tags | "Pulse Enterprise" / "Enterprise" | `notion/product-naming.md` |

**Correct resolution:** all → **same product**.

### 6b. Add-on module — all the SAME module
| Context | Name | File |
|---|---|---|
| Marketing | Meridian Insights Add-on | `notion/product-naming.md` |
| Engineering | Project Lighthouse | `slack/eng-fathom-lighthouse.txt` |
| Billing | SKU-20087-ADD | `billing_line_items.csv` |
| Slack / eng docs | "Insights Module (beta)" | `slack/eng-fathom-lighthouse.txt` |

**Secondary inconsistency:** still tagged **"(beta)"** internally even though it went **GA and
has been billed since Q3 2025**. The beta label is stale. **Correct resolution:** all → **same module**.

**Cross-check:** the core platform and the add-on are **different products** — do not merge
6a with 6b.

---

## 7. Filler Accounts (clean)

~20 filler accounts (`ACC-2001`..`ACC-2020`) are consistent across all sources. They exist so
the planted conflicts don't stand out structurally. **No conflicts to detect here.**

## 8. False-Positive Bait — Trivial Formatting Variation (NOT real conflicts)

Three filler accounts carry a cosmetic name difference between CRM and the spreadsheet. A good
resolver treats each as **the same entity** and raises **no conflict**:

| CRM name | Renewals Tracker name | Account |
|---|---|---|
| `Ironwood Construction Co.` | `Ironwood Construction Co` | ACC-2005 |
| `Cedar Vale Software LLC` | `Cedar Vale Software, LLC` | ACC-2007 |
| `Kingfisher Payments, Inc.` | `Kingfisher Payments Inc` | ACC-2018 |

---

## File Index

| File | Role |
|---|---|
| `crm_accounts.csv` | CRM account export (HubSpot-style), 36 accounts |
| `crm_deals.csv` | CRM deals export (new-business + open renewals) |
| `renewals_tracker.csv` | RevOps ops spreadsheet, with per-row `last_edited` timestamp |
| `billing_line_items.csv` | Billing SKUs (supports non-person entity naming drift) |
| `emails/` | 28 individual email `.txt` files with full headers |
| `transcripts/` | 8 Gong-style dated call transcripts |
| `slack/` | Slack exports (#account-handoffs, #eng-general) |
| `notion/` | Internal product-naming reference doc |
| `labeled_pairs.csv` | **Answer key** — 200 entity-pair judgments (app must not read) |
| `planted_conflicts.md` | **Answer key** — this file (app must not read) |

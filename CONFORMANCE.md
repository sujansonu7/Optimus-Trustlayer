# CONFORMANCE.md — TrustLayer vs. `full-journey-build-guide.md`, Milestones 0–11

**Audited:** 2026-07-26 · **Scope:** Milestones 0 through 11 and Gates 0, 1, 2, 3, W-A, W-B
**Method:** full read of every route and lib module; read-only queries against the live Neon
database; a live dev server on `http://localhost:3000`; and an executed Gate-2 revoke test.
**No code was changed while producing this document.**

Every verdict below is either **code evidence** (`file:line`) or **live evidence** (a rendered
page, an HTTP response, or a database row). Where I could not establish something, it says so
rather than guessing.

---

## 0. Headline

| Gate | Guide's requirement | Verdict |
|---|---|---|
| **Gate 0** | App live, green "Database connected" badge gated on a real round-trip | ✅ **PASS** |
| **Gate 1** | Rendered auto-merge **precision scoreboard** vs `fixture/labeled_pairs.csv`, ≥ 0.98 green | ❌ **NOT BUILT** at audit time → ✅ **PASS at 100.0%** (built — see §7) |
| **Gate 2** | Revoke a source → answer changes, confidence drops, **nothing from it appears anywhere** | ⚠️ **PARTIAL** at audit time → ✅ **PASS** (fixed — see §7) |
| **Gate 3** | Every automatic decision visible and reversible in one place | ✅ **PASS** (one caveat) |
| **Gate W-A** | Wipe all agent sessions; knowledge unaffected | ✅ **PASS** |
| **Gate W-B** | ≥ 10 rated delegations, ≥ 80% no-correction, Parallel locked until then | ⚠️ **NOT MET** — instrumentation correct, **0 briefs rated** |

Milestone-level roll-up:

| M | Title | Conforms | Partial | Missing |
|---|---|---|---|---|
| 0 | Setup | 6 | 0 | 0 |
| 1 | Fixture + real Sheet | 15 | 1 | 0 |
| 2 | Schema + declarations + freshness | 5 | 0 | 0 |
| 3 | Demo script | 1 | 0 | 0 |
| 4 | Ingest + extract | 6 | 1 | 0 |
| 5 | **Entity resolution + Gate-1 scoreboard** | **0** | **1** | **7** |
| 6 | Conflicts + arbitration | 4 | 3 | 0 |
| 7 | Ask + envelope + beliefs | 11 | 1 | 0 |
| 8 | Onboarding + decision log | 5 | 2 | 0 |
| 9 | Agent engine | 6 | 1 | 0 |
| 10 | E2B sandboxed Python | 5 | 2 | 0 |
| 11 | Crew + ledger | 7 | 1 | 1 |

**The one-sentence summary:** Milestones 4 and 6–11 are genuinely built and, in several places,
built more carefully than the guide asks — grounding is *enforced in code*, not merely prompted.
**Milestone 5 was never built**, and the two gates that are not clean (1 and 2) both trace to
single, well-localised causes.

---

## 1. Corrections to the earlier `DEMO_AUDIT.md`

`DEMO_AUDIT.md` (same date) is stale on three points. Verified live today:

| Audit claimed | Actual, verified now |
|---|---|
| Dev server returns HTTP 500 on every page (EBUSY font-manifest lock) | **Resolved.** All 10 real routes return **200**. |
| `/admin` conflict yield is amber, **junk = 1** | **Green: `✓ all planted caught · zero junk`**, 4/4 caught, junk **0**, winners 4/4. Fixed by `f662e07`. |
| Brief quality "100% across 1 rated brief" | **0 briefs rated.** `crew_runs` and `crew_workstreams` are **empty** (0 rows) — wiped by a reset since. Gate W-B is at 0/10. |
| 12 leftover Library work products | **0.** `work_products` is empty. |
| `agent_steps` FK bug is live | **Fixed** in current code — the insert is now guarded (`lib/agent/library.ts:25-38`) and the wipe spares `running` sessions (`:171`). |

Live route probe:

```
/  /sources  /settings  /facts  /conflicts  /decisions  /library  /crew  /admin  /onboarding   → 200
/entities  /review                                                                            → 404
```

---

## 2. Gate-by-gate findings

### ✅ Gate 0 — PASS

App serves on `http://localhost:3000`; every page performs live DB queries successfully.
The badge is **not** hardcoded: `app/page.tsx:23` calls `isDatabaseReachable()`, which opens a
connection and runs `SELECT 1`, returning `false` on any error (`lib/db.ts:27-42`).
`app/page.tsx:9` sets `dynamic = "force-dynamic"` so it is re-checked per request.
`.env` is git-ignored (`.gitignore:33`, confirmed via `git check-ignore -v .env`).
`CLAUDE.md:22-38` carries all 8 standing rules.

---

### ❌ Gate 1 — NOT BUILT (the largest single gap in Milestones 0–11)

The guide requires, verbatim:

> the **Gate-1 scoreboard** on /admin: evaluate against fixture/labeled_pairs.csv; display
> auto-merge precision huge — green at ≥0.98, red below — plus the specific pairs it got wrong.
> **⚠️ GATE 1 — do not proceed until precision ≥ 0.98 with the near-miss pairs kept separate.**

**None of that exists.** Verified by exhaustive repo grep and by looking at the rendered `/admin`:

| Requirement | Verdict | Evidence |
|---|---|---|
| Multi-signal per-pair scoring (name similarity, email/website domain, shared people/addresses) | **MISSING** | No pair-scoring function anywhere. No edit distance, Jaccard, or trigram. Grep for `domain` across `lib/**/*.ts` yields one unrelated comment. |
| Blocking | **MISSING** (moot — there is no all-pairs comparison to prune) | `lib/conflicts/normalize.ts:172-183` |
| Three outcomes by **configurable thresholds** (auto-merge / review / distinct) | **MISSING** | Zero hits for `threshold` outside `node_modules`. Behaviour is binary: fold or don't (`normalize.ts:181`). The `entity_status` enum `('auto','review','rejected')` exists (`migrations/0004_entities.sql:12`) and is **never used**. |
| Every decision stores a plain-English why | **PARTIAL** | Real, but a fixed template with no signal detail: `lib/decisions.ts:170-172`. Lives in `decisions`, not `entities.explanation`. |
| `/entities` page | **MISSING** | Route does not exist — **404 live**. |
| `/review` page (Approve-merge / Keep-separate) | **MISSING** | Route does not exist — **404 live**. |
| Non-person entities resolved | **MISSING** | `lib/conflicts/expected.ts:20` explicitly punts. The three files carrying the product-naming drift are never ingested (see M4). |
| **Gate-1 scoreboard vs `labeled_pairs.csv`** | **MISSING** | `labeled_pairs.csv` is **never opened by any code**. No `precision`/`recall`/`scoreboard`/`gate1` identifier exists in any `.ts`/`.tsx`. |

**What actually ships instead.** ~45 lines of deterministic canonicalisation in
`lib/conflicts/normalize.ts:132-183`:

1. `entityKey(name)` (`:154-158`) — lowercase, strip punctuation, `&`→`and`, drop trailing legal
   suffixes (`inc|llc|co|ltd|corp|…`, `:140`). This is what neutralises the false-positive bait
   (`Ironwood Construction Co.` ≡ `Ironwood Construction Co`).
2. `makeResolver(canonicalKeys)` (`:172-183`) — the canonical universe is CRM + spreadsheet names
   only. A non-canonical alias folds in **only** if its tokens are a strict prefix of **exactly
   one** canonical key:
   ```ts
   const matches = canonToks.filter(
     (c) => c.toks.length > et.length && et.every((tok, i) => c.toks[i] === tok)
   );
   return matches.length === 1 ? matches[0].key : key;
   ```

Two canonical names can *never* merge with each other. That is why the five near-miss pairs stay
separate — not because of any domain/HQ/tax-ID signal, but because both sides are canonical.

**Live confirmation.** `entities` = **0 rows**, `entity_members` = **0 rows**. Resolution is
recomputed in memory on every request, in three duplicated call sites
(`detect.ts:191-197`, `retrieve.ts:221-227`, `decisions.ts:119-125`), and persisted nowhere.
All 8 `merge` rows in the live `decisions` table read *"…is an unambiguous prefix of exactly one
known account"* — i.e. every merge in the system came from that one rule.

**What this costs, concretely.** `labeled_pairs.csv` holds 201 labelled pairs (86 yes / 115 no;
115 easy / 42 medium / 44 hard), including the full Silverline cluster and all five near-miss
pairs. The resolver folds `Silverline` and `Silverline Logistics` into
`Silverline Logistics Group, Inc.` — but **cannot** fold `SLG`, `SLG-West`, or
`silverlinelogistics.io`, because none is a token prefix. Nothing in the product measures or
reports this.

> **Important nuance for the fix plan:** the guide's Gate 1 measures **precision of auto-merges**
> (plus near-misses kept separate) — *not* recall. Because this resolver is extremely
> conservative, its precision is likely to score very high while its recall is poor. A scoreboard
> is therefore both cheap to add on top of the existing resolver **and** likely to render green.

---

### ⚠️ Gate 2 — PARTIAL. Passes on Ask; fails the "anywhere" clause. **Verified live.**

I ran the real test: asked the kill-shot question, disconnected the Renewals Sheet through the
actual `/admin` toggle, and re-asked.

**Ask surface — PASSES, and passes well:**

| | Sheet connected | Sheet disconnected |
|---|---|---|
| Confidence | **0.94 (High)** | **0.48 (Low)** |
| Evidence items | 30 | 25 |
| Evidence source tools | `email, calls, crm, spreadsheet` | `email, calls, crm` — **no spreadsheet** |
| Degraded banner | none | *"The Renewals Sheet — your declared system of record for renewal dates — is disconnected. Answering from the remaining sources, and lowering confidence accordingly."* |
| Sheet-derived data in envelope | — | **none** |

The filter is **structural, not cosmetic** — a parameterised SQL predicate applied before any
grouping, arbitration, prompt rendering, or hashing (`lib/ask/retrieve.ts:209-217`):

```sql
from facts
where superseded_at is null
  and source_tool = any($1::source_tool[])
```

Cache invalidation is belt-and-suspenders: a surgical `update answer_cache … where $1 = any(evidence_sources)`
in the same transaction as the toggle (`lib/ask/sources.ts:61-67` — live-verified: the one cached
answer flipped to `invalidated`), **and** the connected-tool set is folded into the evidence hash
(`retrieve.ts:686-699`) so a revoke is a cache miss regardless.

The only two residual mentions of the Sheet in the envelope are the degraded banner and the
governing declaration's own text. Both are honest metadata; neither carries Sheet-derived data.

**One nuance a presenter must know:** the renewal **date did not change** (still 2026-06-30),
because email *and* a call transcript independently attest it. That is correct, honest behaviour
— arguably a better story than a flip — but if Beat 6 is narrated as *"the answer changes,"* the
date staying put will read as a bug on camera. The *confidence* is what visibly moves: 94% → 48%.

**The "anywhere" clause — FAILS. Confirmed on screen.** With the Sheet still disconnected I
loaded `/conflicts`. It was **byte-identical to the connected state**, still rendering:

> ✓ 2026-06-30 · email 2026-03-11 · a call transcript 2026-03-04 · **the Renewals Sheet 2026-03-11**
> **DECLARED SYSTEM OF RECORD** — *"Showing 2026-06-30 from **the Renewals Sheet** — your ratified
> system of record for renewal dates…"*

**Single root cause:** `detectConflicts()` takes no `connected` parameter and its query has no
source filter (`lib/conflicts/detect.ts:173-180`). Every caller inherits the leak:

| Surface | Call site | Severity |
|---|---|---|
| `/conflicts` page | `app/conflicts/page.tsx:12` | **High** — directly on the demo path |
| Agent `list_conflicts` tool | `lib/agent/tools.ts:427`, `:442` | **High** — puts the disconnected source's value *and name* into the model's context |
| `execute_python` graph export | `lib/agent/graph.ts:194`, `:252-276` | **High** — writes a disconnected source's value into `graph.json`, marked `contested`, citing a *connected* passage that says something different. Both a leak and a citation-integrity break. |
| Onboarding proof-question copy | `lib/onboarding.ts:165`, `:186` | Low |
| `/facts`, `/decisions` | `lib/facts.ts:19-27`, `lib/decisions.ts:107-112` | Low — defensible as raw ledger / build-time log |

Paths that are **clean**: agent `query_graph` (`tools.ts:328` → `retrieve(query, ctx.connected)`)
and crew brief assembly (`lib/crew/brief.ts:33`).

---

### ✅ Gate 3 — PASS (one caveat)

**Live:** `/decisions` renders **197 automatic decisions** — 5 arbitrations, 8 merges,
184 classifications — in one list with filters, each carrying a "Why" and a working **Revert**.

Revert is genuinely wired for all three kinds:

- **merge** → sets `reverted_at` (`lib/decisions.ts:375-378`) → `splitKeys` (`lib/overrides.ts:47-48`)
  → applied at `retrieve.ts:236`, `detect.ts:244-245`, `graph.ts:182`. The alias stands on its own
  key and its facts stop joining the account.
- **arbitration** → `arbOverrides` (`overrides.ts:49-51`) → applied as tier-0 of arbitration
  (`retrieve.ts:456-459`, basis `"override"`); the UI relabels the block "Manual override".
- **classification** → a real ledger write: `update facts set superseded_at = now() where id = $1`
  (`decisions.ts:367-373`), so it disappears from every retrieval path automatically.

Dependent answers are recomputed: `invalidateAllBeliefs()` runs inside the revert transaction
(`decisions.ts:334-341`, called at `:380`). This is a *blunt global* invalidation and that is
**correct** — a merge/arbitration override changes outcomes without changing evidence content
hashes, so the hash-based miss that saves the revoke path would not fire here.

Decisions are logged pristine: `detectConflicts({ applyOverrides: false })` (`decisions.ts:202`)
so the log records what TrustLayer decided on its own, not a human-overridden value. Idempotent
via `dedup_key` + `on conflict do nothing` — re-materialising never duplicates or clobbers a revert.

**Caveat:** there is no `/review` page (404 live). The guide's "re-merge via review" is instead a
**"Restore decision"** button on the same `/decisions` card (`DecisionsClient.tsx:186-192`).
Functionally this satisfies *"one place"* — arguably better than a separate page — but the named
route does not exist.

---

### ✅ Gate W-A — PASS

The button exists on `/admin`, labelled **"Clear all agent sessions"** (not "Wipe"):
`app/admin/AgentSessions.tsx:58-64`. Live copy on the page states the invariant plainly:

> *"The agent engine keeps no durable knowledge… There are currently 19 sessions. Deleting them
> all changes nothing about your facts, conflicts, canon, or the briefs saved to your Library."*

That claim is **structurally true**, and the FK design is what makes it true
(`lib/agent/library.ts:166-173` uses `DELETE`, not `TRUNCATE`, precisely so referential actions fire):

| Referencing column | On delete | Effect |
|---|---|---|
| `agent_steps.session_id` | `CASCADE` (`0012:32`) | run log dies — intended |
| `work_products.session_id` | `SET NULL` (`0012:50`) | **Library survives** |
| `crew_workstreams.session_id` | `SET NULL` (`0013:49`) | board card survives |

`facts`, `declarations`, `decisions`, `entities`, `answer_cache`, `source_connections` are never
touched. Running sessions are deliberately spared (`where status <> 'running'`, `:171`).

**Residual risk (narrow, not a gate failure):** `crew_workstreams.session_id` is written *after*
`runAgent` returns (`lib/crew/dispatch.ts:114`, `:128`) via an unguarded `update`
(`lib/crew/store.ts:190-208`). Clearing sessions inside that window throws
`crew_workstreams_session_id_fkey`, which escapes `Promise.all` (`dispatch.ts:208`) and aborts the
whole dispatch. The same class of bug *was* hardened for `agent_steps` (`library.ts:25-38`); the
guard was not applied here.

---

### ⚠️ Gate W-B — NOT MET (instrumentation is correct; the gate simply hasn't been run)

**Live state:** `/admin` shows `—  needed no correction · 0 briefs rated · 0 clean · 0 corrected`,
`Parallel OFF`, `Gate locked`, *"10 more briefs to rate."* `crew_runs` and `crew_workstreams` are
both **empty**.

The mechanism itself conforms and is well built:

- Constants `MAX_PARALLEL = 2`, `PARALLEL_QUALITY_BAR = 80`, `PARALLEL_MIN_RATED = 10`
  (`lib/crew/types.ts:125-143`).
- **Enforced server-side, not just in the UI** — `app/crew/actions.ts:21-36` re-reads stats and
  refuses to enable below the gate. Turning it off is always allowed.
- OFF by default in the schema (`0013:66-73`); reset forces it off (`lib/reset.ts:58-60`).
- One-tap verdict on each delivered brief (`CrewClient.tsx:710-746`), running % on `/admin`.

Four real gaps against the guide's wording:

1. **"Across different task types" is unmeasurable.** Nothing records a task taxonomy —
   `crew_workstreams.kind` is only `'workstream' | 'inline'`. `briefQualityStats()` groups by
   `quality` alone (`store.ts:234-239`). This half of the gate is honour-system only.
2. **"Sustained" is really "lifetime."** No time window, no recency weighting
   (`store.ts:233-253`). Early bad ratings can never be aged out.
3. **Failures are excluded from the denominator.** Only `review`/`done` cards can be rated, so a
   card that dies in `needs_input` never lowers the percentage. The metric measures *quality of
   delivered briefs*, not *reliability of delegation*.
4. **Reaching 10 ratings is fragile.** `/crew` loads only the latest run (`page.tsx:27`) with no
   run-history UI — un-rated cards from a previous brain-dump become **permanently unreachable**.
   And `resetDemo` truncates `crew_runs`, **zeroing the counter** (which is exactly what happened
   here).

**Stranding modes in dispatch** (`lib/crew/dispatch.ts`) — five identified, two with no recovery path:

| Mode | Cause | Retry? |
|---|---|---|
| 1 | Agent produced no deliverable → `needs_input` | ✅ UI retry |
| 2 | Dispatch aborted (tab closed) → cards stay `queued`, run still marked `done` (`:198-212`) | ✅ UI retry |
| 3 | **Route timeout** (`maxDuration = 300` vs 30–160 s per workstream) → card stuck **`running`** | ❌ `redispatchWorkstream` explicitly refuses anything not `queued`/`needs_input` (`:153-159`). **Recoverable only by direct SQL.** |
| 4 | **FK violation** on post-run update aborts the entire dispatch | ❌ |
| 5 | Forced-progress path (`:203`) runs a dependent before its prerequisite on a dangling dep | silent |

---

## 3. Milestone-by-milestone detail

### Milestone 0 — Setup · **CONFORMS (6/6)**
Next.js `14.2.35` + TS strict + App Router + Tailwind (`package.json:16,29,30`, `tsconfig.json:7`;
no `pages/` dir). Neon pool with TLS and a 5 s connect timeout (`lib/db.ts:9-21`). Anthropic SDK
wired and actually consumed in 4 modules. `.env` git-ignored. Badge gated on a real round-trip.
`CLAUDE.md` covers all 8 standing rules.

### Milestone 1 — Fixture + real Sheet · **CONFORMS (15/16), 1 PARTIAL**
- `crm_accounts.csv` **36 accounts**, `crm_deals.csv` **42 deals**, HubSpot-shaped headers.
- `renewals_tracker.csv` 36 rows **with per-row `last_edited` + `edited_by`**.
- **28** emails with RFC-2822 headers; **8** dated transcripts with speaker turns.
- **Identity mess:** Silverline Logistics Group, Inc. under **4 names across 4 tools** —
  `SLG-West` (sheet), `silverlinelogistics.io` (email), `Silverline`/`SLG` (calls).
- **5 near-miss pairs** (Beacon, Nova, Crestview, Atlas, Brightpath) + 3 false-positive baits
  (Ironwood / Cedar Vale / Kingfisher) that must raise no conflict.
- **Renewal conflict** (Cobalt Ridge: CRM 2026-09-30 vs Sheet 2026-06-30, sheet edited 4 days
  before snapshot) and the **buried VP discount** (Prairie Point, 20% one-time, approved only in
  `emails/2026-03-06_prairiepoint_02_kessler-to-ohene.txt:6`, present in no structured source).
- **Answer keys:** `labeled_pairs.csv` — 201 rows, columns `record_a,record_b,same_entity,difficulty,note`,
  includes near-misses and non-person entities. `planted_conflicts.md` — 12 planted items, each with
  both values, the winner, and why.
- **The app never opens either answer key** — verified by exhaustive grep; the only hits are
  comments and docs. `app/api/source/route.ts:20` actively refuses to serve them. ✅ *Correct per
  the guide's rule* — but note this is the reason Gate 1 has no data source today.
- `/sources` four tabs render raw files as the original tool: records table, true spreadsheet grid
  with A/B/C column letters, inbox + reading pane, transcript pages. `lib/fixture.ts:1-3` states
  it contains no resolution logic. ✅
- **Google Sheet:** real service-account JWT, **read-only scopes**
  (`spreadsheets.readonly` + `drive.readonly`, `lib/googleSheet.ts:18-21`), real Drive
  `modifiedTime` (`:75-76`), CSV fallback with an honest amber "cached" badge on failure
  (`lib/renewals.ts:24-43`). **Currently on the fallback path locally** — `_dev.log` shows
  `ENOENT … google-service-account.json` and no `GOOGLE_SERVICE_ACCOUNT_JSON` is set.
- **PARTIAL — 18-month spread:** emails span ~9 months (2025-06-10 → 2026-03-11); transcripts ~4
  months. Structured records span ~24 months. No stream matches the guide's "~18 months".

### Milestone 2 — Schema · **CONFORMS (5/5)**
`facts` carries every required column including `content_hash` and both temporal axes
(`0001_facts.sql:18-42`). **Supersede-not-overwrite is real:** no statement anywhere mutates
`facts.value`; re-ingest marks prior rows `superseded_at = now()` inside a transaction and inserts
new ones (`lib/ingest.ts:262-288`), and every reader filters `superseded_at is null`.
`declarations` is canon-shaped and bitemporal with `author`/`evidence_link`/`scope`/`status`
(`0002:15-36`); edits supersede rather than update (`lib/settings.ts:70-126`).
`freshness_table` has `volatility_class` + `staleness_tier` enums and is seeded with 7 rows
(`0005:7-15`) — **live-verified**. `entities`/`entity_members` exist with the exact
`auto|review|rejected` enum and an `explanation` column (`0004:12-38`) — **schema conforms,
tables are dead** (0 rows; the only runtime reference is the truncate in `lib/reset.ts:34`).
`/settings` renders editable cards; both required systems-of-record are seeded — renewals
**ratified** (`0007`), ownership **proposed**. Live-verified in the `declarations` table.

*Minor:* `lib/ingest.ts:263-266` supersedes without setting `superseded_by`, so the pointer to the
replacing row is left NULL on re-ingest.

### Milestone 3 — Demo script · **CONFORMS**
`DEMO_SCRIPT.md` covers all **12 beats** with timings, plus failure drills and a
milestone→beat map. Beats 9, 11, 12 belong to Milestones 12–20 and are **out of scope here**.

### Milestone 4 — Ingest & extract · **CONFORMS (6/7), 1 PARTIAL**
"Ingest fixture" + "Force re-ingest" on `/admin` (`AdminClient.tsx:29-43`). CSV rows map directly
with no LLM. Emails/transcripts go through one `claude-haiku-4-5` call each with a **forced tool
call** (`lib/extract.ts:145`). **Grounding is enforced, not trusted** — `extract.ts:170-176`
rejects any fact whose quote cannot be located in the document:

```ts
const offset = quote ? doc.text.indexOf(quote) : -1;
if (!quote || offset === -1) { rejected++; continue; }
```

Content-hash cache with real skip logic (`ingest.ts:405-415`); live progress streams as **NDJSON**
(functionally equivalent to SSE). `/facts` search + click-to-passage renders the **stored**
`source_quote`, never a re-derivation, with in-document highlighting via the stored `source_offset`.
**Live: 1,625 fact rows — 865 current, 760 superseded, across 38 documents.** (The `/admin`
counter shows 865; it counts current facts, which is the right number to show.)

**PARTIAL:** three fixture sources are **never read by any code** —
`fixture/billing_line_items.csv`, `fixture/slack/`, `fixture/notion/`. These are precisely where
the non-person-entity naming drift (planted item #6) lives, which is why M5's non-person
resolution has no input data.

### Milestone 5 — Entity resolution + Gate-1 scoreboard · **MISSING (7), PARTIAL (1)**
See **Gate 1** above for the full table and the actual mechanism.

### Milestone 6 — Conflicts & arbitration · **CONFORMS (4/7), 3 PARTIAL**
Grouping, the same-source guard, and normalisation all conform. The conflict predicate requires
≥ 2 distinct values **and** ≥ 2 distinct sources (`detect.ts:292-293`) — that second clause is what
makes "a superseded value from the same source is history, not a conflict" true in practice.
`normDate` deliberately avoids `Date.parse` so timezones can't shift a day (`normalize.ts:74-88`).
Losers are never hidden: every distinct value is rendered, winner ✓, losers ○ struck-through with
their own source chips (`ConflictsClient.tsx:77-114`) — **verified on screen**.

**PARTIAL 1 — an undocumented tier sits between declarations and freshness.** The real precedence
is *override → declaration → **corroboration** → freshness* (`detect.ts:355-425`). Declarations do
come first, so the guide's ordering is honoured, but corroboration is load-bearing: 3 of the 4
graded conflicts are decided by it, because `arr`/`status`/`tier` have no declaration scope.

**PARTIAL 2 — "freshness weighted by volatility class" is not implemented.** Volatility appears
**only as prose** in the rule sentence (`:423`); it never alters which value wins.

**PARTIAL 3 — severity is hardcoded, not read from the freshness table.** `ATTR_META`
(`detect.ts:56-62`) is a hand-maintained literal; the comment says "aligned with the
`freshness_table` seeds" — aligned by hand, not derived. Consequence: editing `staleness_tier` on
`/settings` does **not** change `/conflicts` severity. And the alignment is incomplete — the seed
migration has no row for ARR, status, or tier.

**Conflict yield — live-verified GREEN:** 4/4 planted caught, **junk 0**, winners 4/4. But read
the on-screen disclaimer carefully: it grades only *"the value-conflict subset … sections #3, #5a,
#5b, #5c"* and defers the rest — Silverline's four names, the near-miss pairs, the buried discount,
the product-naming drift — to *"entity resolution and exception detection… graded elsewhere."*
**There is no "elsewhere."** Those 8 planted items are graded **nowhere**, because Gate 1 was never
built. The oracle is a hand-transcribed 4-row array (`lib/conflicts/expected.ts:43-76`) — correctly
so, since the app must not read the answer key, but it can silently drift from it.

### Milestone 7 — Ask + envelope + beliefs · **CONFORMS (11/12), 1 PARTIAL**
Ask is at the app root. Retrieval gathers entities, facts, conflicts, declarations and freshness
from Postgres. Exactly **one** Anthropic call (`lib/ask/synthesize.ts:131-138`), short-circuited
before spending when evidence is empty.

**Grounding is enforced in code, not just prompted** — `synthesize.ts:147-158` drops any citation
id not in `validIds`, drops claims left with zero citations, and downgrades `answerable` to false
if nothing survives. A hallucinated citation cannot reach the envelope.

Envelope renders prose, per-claim chips (tool + doc + date) expanding to the exact passage, "Show
in source document" with in-situ highlighting, freshness pills from the freshness table, and a
**collapsed-by-default** inline conflict block with one "Show proof ▼" toggle
(`AskClient.tsx:508-580`) — matching the guide's "calm by default, every proof one click away".

Belief cache keyed by `sha256` of *normalised question + sorted connected set + sorted evidence
content hashes + governing declarations* (`retrieve.ts:686-699`). Confidence formula
(`lib/ask/confidence.ts:64-68`) is earned from corroboration/breadth/groundedness with an explicit
`degraded` penalty — **live-verified 0.94 → 0.48 on revoke.**

Sheet freshness uses the **real Drive `modifiedTime`** when Google answers, aged against wall clock
and marked `real: true`; on fallback it uses the CSV's real file mtime and labels itself "cached".
Nothing is hardcoded. *Worth stating plainly to a buyer:* the renewal **number** is as-of last
ingest; the **"edited N days ago" badge** is live.

**PARTIAL:** the guide's "no trace may survive" is met for Ask but not app-wide — see **Gate 2**.

### Milestone 8 — Onboarding + decision log · **CONFORMS (5/7), 2 PARTIAL**
Five-step wizard; the build step reuses the *exact same* `useIngestStream` hook as `/admin`.
The declaration wizard writes **real** declarations with supersede semantics
(`lib/onboarding.ts:80-125`). **Proof questions are genuinely mined**, not hardcoded: conflict
proofs come from `detectConflicts()` over the just-built ledger, the recall proof is a live SQL
join for commitments/discounts, and every candidate is gated on a real answerability check
(`onboarding.ts:148-155`) that runs retrieval only — no model call, so it is fast and free.
Elapsed timer against a 15-minute target. Clicking a proof deep-links into Ask via `?ask=`.

`resetDemo` (`lib/reset.ts:20-80`) truncates `facts, ingested_sources, answer_cache, entities,
entity_members, decisions, crew_runs, work_products`, re-seeds the two declarations, reconnects all
sources, and forces Parallel off — all in one transaction.

**PARTIAL 1 — 3 of 4 connectors are `setTimeout` fakes** (`OnboardingClient.tsx:181-197`); only the
Sheet really connects. Real ingestion does happen, but as one batch in the *next* step, so a
connector click triggers no ingestion of its own. The earlier "nothing is mocked" overclaim was
already softened by commit `301c0f2`.

**PARTIAL 2 — onboarding never writes `source_connections`.** If a source was left disconnected
from a prior Beat-6 demo, onboarding shows it "✓ Connected" while Ask still treats it as revoked.
Only `resetDemo` reconnects. *(Also: the Reset button's on-screen copy omits that it wipes the
Library and crew runs — it destroys more than it says.)*

### Milestone 9 — Agent engine · **CONFORMS (6/7), 1 PARTIAL**
A genuine ~180-line in-house loop (`lib/agent/loop.ts:100-182`), no framework. All four required
tools present plus `execute_python`. `query_graph` is envelope-carrying — it calls the *same*
`retrieve()` Ask uses and folds evidence/conflicts/freshness/declarations into the run pool
(`tools.ts:328-329`). Steps stream over real SSE with tool name, **verbatim inputs**, and result
summary (`api/agent/route.ts:28-64`, `WorkRunClient.tsx:196-262`), with client-disconnect wired to
an `AbortController`. Work/simple routing is a deterministic regex — no model call
(`lib/agent/classify.ts:37-56`).

**PARTIAL:** the guide requires *every* claim to carry envelope citations. Section claims are
enforced (uncited claims dropped, a zero-claim draft rejected and re-requested,
`tools.ts:631-655`) — but the **executive summary** (`:606`) and **risks[]** (`:607-609`) are
uncited model prose, rendered at the *top* of the brief (`WorkProductView.tsx:62,65-74`).

*Minor:* `classify()` over-triggers on the bare word `total` (`classify.ts:34-35`), so
*"what is the total ARR for Silverline?"* spins up a full agent run instead of answering simply.

### Milestone 10 — E2B sandbox · **CONFORMS (5/7), 2 PARTIAL**
A real `Runner` interface (`runner/types.ts:59-64`) with a single selection point
(`runner/index.ts:17-21`) — swapping backends is a one-file change. Fresh sandbox per run,
unconditional `finally { sandbox.kill() }` (`e2b.ts:68-71`).

**No credentials reach the sandbox** — the only thing written in is
`graph.json` (`tools.ts:511`); `Sandbox.create` receives `apiKey` + `timeoutMs` only, with **no
`envs` and no `process.env` passthrough** (`e2b.ts:30-33`). `DATABASE_URL` / `ANTHROPIC_API_KEY`
never appear on the runner path. The export is connected-source-filtered at the SQL boundary
(`graph.ts:157-166`). All three demo tasks are seeded as chips.

**PARTIAL 1 — stdout/plots do not stream incrementally.** `onStdout`/`onStderr` exist and E2B
wires them (`e2b.ts:46-47`), but the call site never passes them (`tools.ts:515`). Everything
arrives on one `tool_result` step after up to 45 s of on-screen silence.

**PARTIAL 2 — "every number's source" is a regex heuristic.** `referencedEvidenceIds()`
(`tools.ts:473-482`) scrapes code and stdout for `evidence_id` mentions. If the model computes a
total but forgets to print the backing id, the card shows *no* sources and nothing flags it.

*Also note:* the graph export inherits the Gate-2 leak (`graph.ts:194`) — see Gate 2, row 3.

### Milestone 11 — Crew + ledger · **CONFORMS (7/9), 1 PARTIAL, 1 MISSING**
One big box; one-call triage into outcome-shaped workstreams with a conservative inline rule
("when unsure, choose workstream") and **sanitised** `dependsOn` (self-refs and out-of-range
indexes stripped, so sequencing cannot deadlock, `triage.ts:139-142`).

**Confirm-before-dispatch is airtight** — the triage route only plans; the sole execution entry
point is `POST /api/crew/dispatch`, reachable only from the explicit "Confirm & dispatch" button or
a per-card Retry. No `useEffect` auto-dispatch anywhere.

**The brief is deterministic** — no model call (`brief.ts:6-10`); it reuses Ask's retrieval and
arbitration, so it states the same winner Ask and `/conflicts` would. Every context line carries
evidence ids. Shown before dispatch and again on the board.

`depends_on` is **honoured at dispatch time, not merely stored** (`dispatch.ts:191-210`);
sequential by default (`limit = parallel ? MAX_PARALLEL : 1`). Five-column kanban on real Postgres
job tables; board and per-card step logs rehydrate on reload.

**PARTIAL — file-back is weaker than it reads.** The filed-back row carries full provenance and a
*pointer* to the deliverable, but not the envelope itself (`fileback.ts:56-64`). And because
`source_tool = 'work_product'` sits outside `ALL_TOOLS`, both retrieval paths filter it out — so a
filed-back deliverable is **visible on `/facts` but never retrievable by Ask, `query_graph`, or
compute**. It is recorded knowledge, not usable knowledge. (This is a defensible
no-feedback-loop choice, and it is what guarantees file-back can never manufacture a false
conflict — verified: the attribute `crew_work_product` is non-canonical and is dropped before
bucketing.)

**MISSING — "across different task types"** is not tracked in any form. See Gate W-B.

---

## 4. Every finding, ranked by demo impact × effort

Ordered for a buyer/investor demo. "Effort" assumes no refactor of working code.

| # | Finding | Gate | Impact | Effort |
|---|---|---|---|---|
| **1** | **`/conflicts` leaks the disconnected source** — Beat 6 breaks the moment the presenter clicks through after revoking | Gate 2 | 🔴 Critical | **S** |
| **2** | **No Gate-1 precision scoreboard**; `labeled_pairs.csv` never read | Gate 1 | 🔴 Critical | **M** |
| **3** | `list_conflicts` + `graph.json` leak disconnected values into the model and onto charts (citation-integrity break) | Gate 2 | 🟠 High | **S** |
| **4** | Crew cards stuck in `running` are unrecoverable without SQL; 300 s route budget makes this likely on 3+ workstream runs | W-B | 🟠 High | **S–M** |
| **5** | `updateWorkstream` not FK-guarded → one clear-sessions click aborts an entire dispatch | W-A/W-B | 🟠 High | **S** |
| **6** | Gate W-B sits at **0 rated briefs**; reaching 10 is fragile (no run history; reset zeroes it) | W-B | 🟠 High | **S** (history) + time |
| **7** | Onboarding never writes `source_connections` → "✓ Connected" while Ask treats it as revoked | M8 | 🟡 Medium | **S** |
| **8** | `/entities` and `/review` 404 — two named routes in the guide | Gate 1/3 | 🟡 Medium | **M** |
| **9** | Work-product **summary + risks are uncited** at the top of every brief | M9 | 🟡 Medium | **S** |
| **10** | Conflict-yield disclaimer defers 8 planted items to a grader that doesn't exist | M6 | 🟡 Medium | **S** (folds into #2) |
| **11** | Severity hardcoded, not read from `freshness_table` → editing `/settings` changes nothing | M6 | 🟡 Medium | **S** |
| **12** | 3 fixture sources never ingested (billing / slack / notion) — the non-person-entity data | M4/M5 | 🟢 Low | **M** |
| **13** | Compute stdout doesn't stream — up to 45 s of dead air on camera | M10 | 🟢 Low | **S** |
| **14** | `classify()` over-triggers on "total" | M9 | 🟢 Low | **XS** |
| **15** | Reset copy under-reports what it destroys (Library + crew runs) | M8 | 🟢 Low | **XS** |
| **16** | `superseded_by` left NULL on re-ingest | M2 | 🟢 Low | **XS** |
| **17** | Local Sheet is on CSV fallback (no service-account key) — badge reads amber "cached" | M1 | 🟢 Low | config |
| **18** | `planted #N` chips visible by default on `/conflicts` — the app visibly knows which conflicts were seeded | M6 | 🟢 Low | **XS** |

**Not defects — deliberate and correct:** the app never reading the answer keys; file-back being
inert in arbitration; the blunt global belief invalidation on revert; `DELETE`-not-`TRUNCATE` in
the session wipe; the decision log recording pristine (pre-override) arbitrations.

---

## 5. Recommended fix order

Rationale: **#1 and #3 share one root cause and one fix.** Adding a `connected` parameter to
`detectConflicts()` and threading it through its call sites closes the entire Gate-2 leak class
(findings 1, 3, and the low-severity onboarding-copy leak) in one small, surgical change — no
refactor, one new parameter, five call sites. That is the highest impact-to-effort ratio available
and it converts Gate 2 from PARTIAL to PASS.

**#2 is the flagship.** Gate 1 is the only gate in Milestones 0–11 that is not merely imperfect but
absent, and the guide makes it a hard stop. The good news established above: a scoreboard can be
built **on top of the existing resolver** without touching it — parse `labeled_pairs.csv`, strip the
`[Source]` tags, run both sides through `entityKey` + `makeResolver`, and compare. Because the
resolver is conservative, **precision is likely to render green** while recall is visibly poor —
which is an honest, defensible scoreboard and exactly what the guide asks to display.

Proposed sequence, one item at a time, verified on screen and committed separately:

1. **#1 + #3** — thread `connected` through `detectConflicts()`. *Closes Gate 2.*
2. **#2** — build the Gate-1 precision scoreboard on `/admin`. *Closes Gate 1.* (Optionally #10 folds in.)
3. **#5** — FK-guard `updateWorkstream`. *Removes the dispatch-abort class.*
4. **#4** — allow retry of `running` cards past a staleness threshold.
5. **#6** — add minimal crew run history so ratings stop being lost.
6. **#9**, **#7**, **#11** — citation coverage, connection state, severity derivation.
7. Cosmetics: **#14**, **#15**, **#16**, **#18**.

Items **#8** (`/entities`, `/review`) and **#12** (uningested sources) are genuine build work
rather than fixes, and are the natural follow-on to #2 — I'd scope them separately rather than
fold them into a fix pass.

---

## 6. What is honestly demonstrable today (Milestones 0–11)

**Say:** a working single-tenant product on a realistic 1,625-fact corpus with full provenance;
answer-time conflict arbitration with the governing rule displayed as a human sentence; extraction
grounding enforced in code (uncitable facts are rejected, not trusted); belief recomputation on
revocation with confidence visibly dropping 94% → 48%; every automatic decision visible and
reversible in one place; a stateless agent with visible steps producing cited briefs; and real
sandboxed Python with no credentials in the sandbox.

**Don't say (yet):** measured entity-resolution precision (nothing measures it); a sustained ≥80%
brief-quality figure (0 briefs rated); or that the Renewals Sheet is live locally (it is on CSV
fallback). *(The "nothing from a revoked source appears anywhere" caveat was lifted by fix #1 — see §7.)*

---

## 7. Fix log

Sections 1–6 are the audit **as of 2026-07-26** and are left unedited as the historical record.
Fixes applied since are recorded here, newest last.

### Fix #1 — Gate 2 leak closed · `detectConflicts()` connection scoping

**Finding #1 + #3 from §4.** `detectConflicts()` gained an optional `connected?: SourceTool[]`
(`lib/conflicts/detect.ts:162-190`). When supplied, disconnected tools are excluded **at the SQL
boundary** — the same enforcement point Ask already used — so a revoked source's values, name and
dates cannot reach bucketing, arbitration, the rule sentence, or the model. Omitting the parameter
preserves the previous unfiltered behaviour.

Call sites, and why each was decided that way:

| Call site | Now | Reason |
|---|---|---|
| `app/conflicts/page.tsx:12` | **filtered** | the visible Gate-2 leak |
| `lib/agent/tools.ts` `list_conflicts` | **filtered** (via `ctx.connected`) | fed revoked values + source names into the model's context |
| `lib/agent/graph.ts:194` | **filtered** (via `connected`) | wrote a revoked value into `graph.json` as winner, cited to a connected passage that disagreed |
| `lib/onboarding.ts:165` | **filtered** | proof-question copy quotes the winning value |
| `app/admin/ConflictYield.tsx` | **unfiltered, deliberately** | grades the *build*; revoking a source must not move the score |
| `lib/decisions.ts:202` | **unfiltered, deliberately** | historical log — revoking a source later does not un-make a past decision |

`/conflicts` also now renders an amber banner naming the disconnected source, so a revoked source
reads as an intentional state rather than as missing data.

**Verified on screen (round-trip).** All connected → 4 conflicts, Cobalt Ridge card reads
`DECLARED SYSTEM OF RECORD` citing the Renewals Sheet. Sheet disconnected → banner appears,
counts drop to 1 critical / 2 high, and **zero occurrences of "the Renewals Sheet"** remain.
The arbitration cascade degrades correctly rather than merely hiding rows:

- Cobalt Ridge falls from `DECLARED SYSTEM OF RECORD` → `CORROBORATION` (email + call transcript),
  because the declared system of record is the source that was revoked.
- Grantline and Quantum Peak fall from `CORROBORATION` → `FRESHNESS`.
- Thornbury & Cole drops out entirely — correct: without the Sheet there is no *structured* owner
  backing "Sara Lindqvist", so the email value is treated as unanchored extraction noise by the
  existing owner-anchoring rule, exactly as designed.

`/admin` conflict yield held at 4/4 green, junk 0, throughout. Reconnecting restored all four
cards and the original rule sentences. `npx tsc --noEmit` passes.

**Not addressed by this fix** (documented in §2, still true): `/facts` and `/decisions` show
revoked sources' data by design, as raw ledger and historical log respectively.

### Fix #2 — Gate 1 built · entity-resolution precision scoreboard

**Finding #2 from §4.** New `lib/entities/gate1.ts` grades the live resolver against
`fixture/labeled_pairs.csv`; new `app/admin/Gate1Scoreboard.tsx` renders it above the conflict
yield. **The existing resolver was not modified** — the scoreboard calls `entityKey` +
`makeResolver` exactly as a normal caller would and only compares the answers.

The canonical universe is rebuilt the same way every runtime call site builds it (CRM + spreadsheet
`entity_ref`s currently in the ledger), so this scores the resolver the product is actually running.
Decision-log overrides are deliberately **not** applied — the gate measures the *automatic*
decision, for the same reason arbitrations are logged pristine.

**On reading the answer key.** The standing rule is that the app never opens `labeled_pairs.csv`.
Milestone 5 carves out exactly this one exception, and the carve-out is structural, not a promise:
nothing in the module feeds the resolver, the only importer is the `/admin` server component, and
`app/api/source/route.ts` still refuses to serve either answer key over HTTP. The rationale is
written at the top of `lib/entities/gate1.ts`.

**Live result — GATE 1 PASSES:**

| | |
|---|---|
| **Auto-merge precision** | **100.0%** (bar 98%) — green |
| Merges made | 11, of which **0 wrong** |
| **Near-miss pairs kept apart** | **10 / 10** — the gate's second clause |
| Labeled pairs graded | 201 |
| Recall *(not gated)* | 13% — 75 pairs it should have merged and didn't |

Precision is perfect because the resolver only folds an alias in when it is an unambiguous prefix
of exactly one canonical account, and two canonical names can never merge — which is precisely why
the near-miss traps (Beacon, Nova, Crestview, Atlas, Brightpath) all survive.

The same conservatism is why recall is 13%, and the scoreboard says so plainly rather than hiding
it: `SLG`, `SLG-West` and `silverlinelogistics.io` are not token prefixes of anything, so they are
left unlinked rather than guessed. Those 75 misses are listed in a collapsed panel, labelled
"recall, not precision". **This is the honest reading of the gate** — the guide sets the stop-test
on precision with near-misses kept separate, both of which are met — but it also means the
Silverline identity cluster is only partially resolved, and improving recall is the natural next
piece of Milestone 5 work (alongside `/entities` and `/review`, which remain missing).

`npx tsc --noEmit` passes; `npx next lint` reports nothing in the new files.

### Fix #3 — the production build (pre-existing breakage)

Two ESLint errors in `app/crew/` failed `next build`, so **no deploy could
succeed**. `tsc` passed and `npm run dev` worked, which is why it went unnoticed.
Confirmed pre-existing by linting a clean `HEAD`. Fixed without restructuring the
surrounding code. `npm run build` now succeeds.

### Fix #4 — crew reliability (findings #4, #5)

Three failure modes that silently destroyed work and suppressed Gate W-B:

- `updateWorkstream` wrote `session_id`/`work_product_id` **after** the agent run,
  so clearing sessions in that window raised an FK violation — the race already
  hardened for `agent_steps`. Both ids are now adopted only if the row still
  exists.
- That exception escaped `Promise.all`, skipping `setRunStatus` and stranding
  every remaining card in `queued` while the run still looked alive. `dispatchOne`
  is now wrapped per card.
- A card stuck in `running` was **recoverable only by hand-editing the database**.
  Cards now carry `updatedAt`; `isStuckRunning()` treats `running` with no write
  for 6 minutes as a dead dispatch, Retry accepts those, and the card explains
  itself. A card being actively streamed is never flagged.

### Fix #5 — crew run history (finding #6)

`/crew` loaded only the newest run, so a new brain-dump made every un-rated card
from the previous one unreachable — and each is a rating Gate W-B never counts.
`/crew?run=<id>` opens earlier boards, with an amber count of briefs still to rate.

### Fix #6 — three claims presented as sourced (findings #9, #7, #11)

- **Risk flags** were uncited prose at the top of every brief. They now carry
  evidence ids, render source chips, and survive the evidence prune; an ungrounded
  flag is labelled *"the agent's own judgement, not tied to a source"*. The legacy
  bare-string shape still renders.
- **The executive summary** is labelled as synthesis of the cited findings below,
  which makes "every claim is cited" literally true.
- **Onboarding connectors** showed "Connected" as component state only and never
  wrote `source_connections` — so a revoked source read as connected while Ask
  refused it. Connecting now actually reconnects.
- **`/conflicts` severity** was hardcoded while claiming to be "aligned with the
  freshness_table seeds". It now reads `freshness_table` (most severe tier wins),
  falling back to the literals only when a row is missing. Migration `0014` seeds
  rows for ARR, account status and tier — the three attributes `0005` never
  covered — using the previously hardcoded values. **Verified:** board unchanged
  after migration; flipping the ARR tier to critical moved Quantum Peak to
  Critical and re-sorted the board; restored.

### Fix #7 — four small ones (findings #14, #15, #16, #18)

`classify()` no longer treats the bare word "total" as a work request. Reset copy
now admits it destroys crew runs and the Library. Re-ingest links each superseded
fact to its replacement via `superseded_by`. The `planted #N` chips and filter now
require `?qa=1`, and the tag is stripped server-side otherwise — **verified: zero
answer-key values in the default payload, 8 with `?qa=1`**.

### Fix #8 — `/entities` and `/review` (finding #8)

Both routes the guide names existed only as 404s.

**`/entities`** — one card per resolved identity: canonical name, every spelling
each tool uses, fact counts, source chips, and a plain-English *why* per member.
Recomputed from the ledger on every load with the same resolver the retriever and
detector use; the `entities` table stays unwritten.

**`/review`** — the borderline queue. The resolver's conservatism is what keeps
precision at 1.00 and what leaves real aliases unlinked, so the queue surfaces
exactly those, scored by explainable signals (shared tokens, initialisms,
run-together domain spellings, hyphenated suffixes) and shown with the case for
*and* against. **Scoring only ranks — nothing auto-merges.** Approve-merge /
Keep-separate persist in `resolution_reviews` (migration `0015`), survive
re-ingest, and become `mergeKeys` honoured by every resolution path, with a human
split still beating a human merge. Approving invalidates every cached belief, for
the same reason reverting a merge does.

Approved merges deliberately **do not** move the Gate-1 scoreboard, which grades
the resolver's *automatic* decisions — the page says so.

**Verified live:** Silverline's four names resolved into one with per-member
reasoning (62 entities, 11 multi-name); the queue surfaced two genuine fixture
aliases; approving one persisted and appeared on `/entities` as *"You approved
this merge on /review"*, with Gate 1 correctly unmoved. Test verdict cleared.

---

## 8. Pre-existing issue found while verifying (not introduced by any fix here)

**`npm run build` fails on `main`, and did so before this work started.** Confirmed by stashing all
changes and linting clean `HEAD`:

```
./app/crew/CrewClient.tsx
  197:23  Error: '_drop' is assigned a value but never used.  @typescript-eslint/no-unused-vars
./app/crew/page.tsx
  22:7    Error: 'initialSteps' is never reassigned. Use 'const' instead.  prefer-const
```

Next.js runs ESLint as part of `next build` and treats these as errors, so the production build
aborts. `npx tsc --noEmit` passes and `npm run dev` is unaffected, which is why this went unnoticed
— but **a Vercel deploy would fail**. *(Fixed — see Fix #3.)*

---

## 9. The one item deliberately NOT done

**Finding #12 — `fixture/billing_line_items.csv`, `fixture/slack/` and
`fixture/notion/` are still never ingested.** These carry planted item #6, the
non-person-entity naming drift (Meridian Pulse / Project Fathom / SKU-10045-ENT).

I stopped short of this one on purpose. Slack and Notion are not values of the
`source_tool` enum, so ingesting them is not "add two files to a job list" — it
means a new enum value plus every surface keyed on it: source labels, tool chips,
the connection toggles, the freshness table, the `/sources` tabs, the graph export,
and the Gate-2 connected-source filtering just added. That is a wide change across
working, demo-green code, and the standing rule is not to refactor working code.

It is also the only remaining item that could move the conflict-yield counter off
green, since new facts can create new cross-source disagreements.

**Recommendation:** treat it as its own scoped piece of work — "add Slack and
Notion as first-class sources" — rather than a fix. Until then, planted item #6
remains ungraded, which the `/admin` yield caption already states.

---

## 10. Where the gates stand now

| Gate | At audit | Now |
|---|---|---|
| 0 — live + real DB badge | ✅ PASS | ✅ PASS |
| **1 — ER precision scoreboard** | ❌ NOT BUILT | ✅ **PASS — 100.0%**, 0 over-merges, 10/10 near-misses kept apart |
| **2 — revoke test** | ⚠️ PARTIAL (leaked on 3 surfaces) | ✅ **PASS** — structural filtering everywhere it matters |
| 3 — decisions reversible | ✅ PASS (no `/review`) | ✅ PASS — and `/review` now exists |
| W-A — wipe sessions | ✅ PASS | ✅ PASS — plus the residual crew FK race closed |
| **W-B — brief quality** | ⚠️ 0 rated, ratings losable | ⚠️ **Still 0 rated** — but ratings are no longer lost, and stranded cards are recoverable |

**W-B is the only gate still open, and it cannot be closed by code** — it needs ten
real delegations rated by you. What changed is that progress is no longer leaked:
dead dispatches are retryable, un-rated briefs stay reachable via run history, and
a failed card can no longer take the rest of the run down with it.

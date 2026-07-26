# TrustLayer — Build Handoff / Current State

**Last updated:** 2026-07-26
**Scope:** the `/crew` delegation feature. The app uses the **Anthropic API only**
(an earlier offline mode + OpenRouter provider seam were removed by request — see
§7). For the base product's standing brief, see [`CLAUDE.md`](CLAUDE.md).

---

## 1. TL;DR

Built a full **`/crew`** feature: dump a messy brain-dump → it's split into
outcome-shaped workstreams → each gets a **cited brief assembled from the graph**
→ you confirm → they dispatch across a **kanban ledger** → deliverables **file
back into the graph** → each brief gets a **one-tap quality verdict** → a
**Parallel toggle** unlocks only after brief quality is proven.

All AI steps call the **Anthropic API** directly (as the rest of the app does).
Status: typecheck ✅, production build ✅, migration `0013` applied ✅. Running the
AI features requires a funded `ANTHROPIC_API_KEY`.

---

## 2. What `/crew` does

1. **One box** for a messy brain-dump ("prep the Northwind renewal, check the
   Meridian pricing exception, chase Coastal's contract status, draft the QBR agenda").
2. **Triage** (one Anthropic call) splits it into **outcome-shaped workstreams**.
   Trivial items (a generic agenda/template) are **answered inline**. Dependent
   items are **sequenced** (a summary/deck "waits on" the workstreams it summarizes).
3. **Confirm-before-dispatch:** the proposed split is shown with each brief;
   **nothing runs until you click Confirm**. Never auto-runs.
4. Each workstream's **brief is assembled from the graph** — goal, the arbitrated
   relevant context (**every line cited** to a source passage), constraints,
   done-criteria. **The brief is the product** and is shown before dispatch. Brief
   assembly is deterministic (reuses Ask retrieval + arbitration) — no model.
5. **Dispatch** runs workstreams on a **kanban ledger** (queued / running /
   needs-input / review / done), backed by **Postgres job tables**. Sequential by
   default (one agent session at a time); optional Parallel (max 2). Reuses the
   existing agent loop (`lib/agent/loop.ts`).
6. **Outputs file back into the graph** as facts tagged `source: "TrustLayer work
   product"` (envelope-carrying, visible on `/facts`).
7. **Brief-quality instrumentation:** each delivered brief gets a one-tap verdict —
   *"needed no correction"* / *"needed correction"* — running % on `/admin`.
8. **Parallel toggle** (max 2), **OFF by default**, **hard-gated**: only switches on
   at **≥10 rated briefs & ≥80% clean** (enforced in UI *and* server-side).

---

## 3. Architecture / file map

### New files
```
lib/crew/
  types.ts        # shared crew types (client-safe), gate constants (MAX_PARALLEL, ...)
  store.ts        # Postgres CRUD: runs, workstreams, quality, parallel setting
  triage.ts       # Anthropic triage (claude-sonnet-5) → workstreams
  brief.ts        # deterministic, grounded brief assembly (no model)
  fileback.ts     # append delivered work product to the fact ledger
  dispatch.ts     # sequential/parallel dispatch (reuses runAgent) + SSE events
app/api/crew/triage/route.ts     # POST → plan + briefs (no dispatch)
app/api/crew/dispatch/route.ts   # POST → SSE ledger updates
app/crew/
  page.tsx        # /crew server page (loads latest run, settings, stats)
  CrewClient.tsx  # box, plan, kanban board, live steps, quality tap, parallel toggle
  BriefView.tsx   # renders an assembled brief (reuses envelope citation UI)
  actions.ts      # server actions: setParallel (gated), recordQuality
app/admin/CrewQuality.tsx        # /admin brief-quality % + parallel gate status
migrations/0013_crew.sql         # crew tables + 'work_product' source enum value
HANDOFF.md                       # this document
```

### Modified files
```
lib/reset.ts        # clears crew_runs; resets Parallel to OFF on demo reset
app/admin/page.tsx  # renders CrewQuality; loads crew stats; nav link
app/page.tsx        # /crew nav link
scripts/migrate.mjs # hashes LF-normalized migration content (Windows CRLF fix)
```

### Database (migration `0013_crew.sql`)
- `crew_runs` — one brain-dump run.
- `crew_workstreams` — one ledger card: `title`, `goal`, `kind`
  (`workstream`|`inline`), `inline_answer`, `constraints_json`, `done_criteria_json`,
  `depends_on`, `brief_json`, `status`, `session_id`→agent_sessions,
  `work_product_id`→work_products, `quality`, timestamps. FK → `crew_runs` CASCADE.
- `crew_settings` — singleton row: `parallel_enabled` (default false).
- `source_tool` enum gains **`work_product`** — provenance tag for filed-back
  deliverables. Not a connectable ingestion source; excluded from the graph export
  / arbitration. Filed-back facts use the **non-canonical** attribute
  `crew_work_product`, so they can **never** create a false conflict (verified).

### Key data-flow notes
- Brief assembly reuses Ask **retrieval + arbitration** (`lib/ask/retrieve.ts`), so a
  brief states the same arbitrated winner Ask/`/conflicts` would.
- Crew dispatch reuses the existing **agent loop** unchanged.
- Filing back is append-only: `source_doc = work-products/<id>`.

---

## 4. Verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ pass |
| `npm run build` | ✅ pass (`/crew` + `/api/crew/*` present) |
| `npm run db:migrate` | ✅ `0013` applied; runner made CRLF-robust |
| File-back safety | ✅ filed-back facts non-canonical → inert in arbitration |
| Quality tap → running % → gate | ✅ tap records; % on `/admin`; Parallel locked <10/80% |
| Crew triage + dispatch + file-back | ✅ (exercised previously via the model path) |

> Note: the AI paths (Ask, triage, dispatch, ingest extraction) require a funded
> `ANTHROPIC_API_KEY`. If the key's workspace is at $0, those calls return a
> "credit balance is too low" error — a billing state, not a code issue.

---

## 5. How to run

```bash
# project root: C:\Users\Sujan AH\Desktop\trustlayer
npm install          # if needed
npm run db:migrate   # applies migrations (idempotent)
npm run dev          # http://localhost:3000 (or next free port)
```
Open **`/crew`**, type a brain-dump (or "Use the example") → **Delegate** → review the
plan + cited briefs → **Confirm & dispatch** → tap a quality verdict → see the rollup
on **`/admin`**. Filed-back deliverables appear on **`/facts`**.

Env (see `.env.example`): `DATABASE_URL` (Neon Postgres), `ANTHROPIC_API_KEY`
(required for all AI features), `E2B_API_KEY` (optional — the agent's charts).

---

## 6. Open items / next steps

- [ ] **Fund the Anthropic workspace** for the key in `.env` so the AI features run
      (triage, dispatch, Ask, ingest extraction). Then run a small test: one triage
      + one dispatch.
- [ ] **Rollout gate:** run **≥10 real, varied delegations**, rate each brief; the
      Parallel toggle unlocks automatically at ≥10 rated & ≥80% clean.
- [ ] Pre-existing (not from this work): `/admin` conflict-yield shows **junk = 1** in
      the current fixture state — independent of `/crew` (filed-back facts are inert).
      Worth a separate look if the "zero junk" (Milestone 6) promise matters.
- [ ] Prior demo/test runs left sample data (Library work products + filed-back
      facts). Use **Reset demo** on `/admin` for a clean slate (reset clears facts and
      needs a re-ingest).

---

## 7. History note — removed layers

An earlier iteration added, then **removed at the owner's request**:
- an **offline mode** (`AI_ENABLED`, deterministic fallbacks for every AI surface), and
- an **OpenRouter provider seam** (`LLM_PROVIDER`, `OPENROUTER_*`).

These were credit-workarounds and were deemed not needed for later phases. The app
is now back to **Anthropic-only**. Files removed: `lib/config.ts`, `lib/llm.ts`,
`lib/agent/offline.ts`, `lib/crew/offline.ts`, `OFFLINE_MODE.md`; all call sites
restored to `anthropic.messages.create`; env cleaned of `AI_ENABLED` /
`LLM_PROVIDER` / `OPENROUTER_*`.

---

## 8. Design principles honored (from CLAUDE.md)
- **One app, one database.** Crew is Postgres tables + the existing agent.
- **Provenance on every fact;** nothing overwritten — file-back is append-only.
- **Envelope everywhere:** briefs/answers/deliverables carry citations, freshness, conflicts.
- **Demo-ready UI;** each action states where to see the result.
- **Working code left unrefactored** beyond what the feature required.

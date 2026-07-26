# DEMO_AUDIT.md — brutally honest state of TrustLayer for a leadership video

**Audited:** 2026-07-26 · **Auditor:** Claude (code + live Postgres + dev-server logs) · **No code was changed.**

**How this was produced:** read of every route and its libs; a read-only query
against the live Neon database (facts, crew, cache, work products); inspection of
`_dev.log` from the running dev server; and the fixture answer key. Where I could
paste a *real* rendered answer from the belief cache, I did. Where I could **not**
run something live (the dev server is currently returning 500 — see §Blocker), I
say so instead of guessing.

---

## ⛔ BLOCKER (read this first)

**The running dev server currently returns HTTP 500 on every page**, including the
home page. Cause is a Windows file-lock: `EBUSY: resource busy or locked … .next/
server/next-font-manifest.json` (repeats continuously in `_dev.log`). This is not a
code bug — it's the `.next` build cache being locked, almost certainly because the
repo lives under `C:\Users\Sujan AH\Desktop\` (a OneDrive-synced folder) and OneDrive
+ a second/stale `next dev` process are fighting over the file.

**Nothing can be recorded until this is cleared.** Fix before any take:
1. Stop every `node`/`next` process.
2. Delete `.next`.
3. Move the repo out of the OneDrive Desktop path (or pause OneDrive sync) — otherwise it will recur mid-recording.
4. `npm run dev`, confirm `GET /` returns 200.

Everything below assumes you've done this and the app is up.

---

## TL;DR for the eight questions

| # | Question | Short answer |
|---|---|---|
| a | Reset → onboarding → proof → kill shot end-to-end? | **Yes, the pieces exist — but not "one click."** Reset wipes facts, so you must re-run onboarding **Build** (re-ingest, the slow part). Est. **~3–6 min**, dominated by re-ingest. Not runnable right now (500 blocker). Not verified live this session. |
| b | Verbatim kill-shot text for **"When does Northwind renew?"** | **There is none — the question is wrong for this fixture, and no answer text is hardcoded.** Northwind Freight is a *clean* account. Real cached answer: **"Northwind Freight's renewal date is 2027-06-19 and the account owner is Diego Marin."** The kill-shot conflict is **Cobalt Ridge Manufacturing**, and answers are LLM-generated per call (wording varies). |
| c | Gate-1 precision & Gate W-B brief-quality % | **No "Gate-1 precision" metric is rendered anywhere.** Nearest is `/admin` **Conflict yield** (currently **amber "needs attention"**, junk = 1 per HANDOFF). Brief-quality: **100% but only 1 brief rated** → gate **LOCKED** (needs ≥10 rated & ≥80%). |
| d | Crew flow reliable? | **Partially. Flaky.** It has run 6 times and files work back, but live DB shows workstreams **stranded**: 5 in `review`, 2 `needs_input`, 2 `queued`. Plus the `recordStep` FK bug. |
| e | E2B QBR-with-chart reliable + live duration? | **Works, but slow.** Confirmed real chart products in the Library. Live it takes **~1–2.5 min** (LLM turns + sandbox cold-start + Python; runs of 120–161s in the log). Cache a last-good chart as fallback. |
| f | Google Sheet live? Freshness badge? | **NOT live locally.** No `google-service-account.json` → falls back to cached CSV. Badge reads amber **"showing cached data · cached …"**. The Sheet is a *viewer only* — it does **not** feed the kill-shot answer. |
| g | Embarrassing bugs/flakiness | See §7 — 500 blocker, FK step errors, faked connectors, "cached" sheet, junk=1, stranded crew cards, 12 leftover Library items, and **Beats 9/11/12 don't exist**. |
| h | Seeded Ask questions | 9 chips, sourced from `DEMO_SCRIPT.md`. Listed in §8. |

---

## 1. Route-by-route

Routes that **exist**: `/` (Ask), `/onboarding`, `/sources`, `/settings`, `/facts`,
`/conflicts`, `/decisions`, `/library`, `/library/[id]`, `/crew`, `/admin`.

Routes the prompt named that **do NOT exist** (would 404): **`/entities`** and
**`/review`**. Entity resolution is surfaced on `/decisions` (merge decisions) and
`/facts` (canonical labels), not its own page. "review" is a **column on the Crew
kanban board**, not a route. Neither is linked from anywhere, so low risk unless
someone types the URL.

### `/` — Ask (home) · **demo-ready** (when server is up)
Ask box over the governed graph: every answer is built from connected sources with
citations, a freshness badge, and any conflict shown inline; a live green "Database
connected" pill and four source pills sit up top. Suggested-question chips are
seeded from `DEMO_SCRIPT.md`.
- **Specifics:** Answers are **LLM-synthesized at runtime** (one Anthropic call) and
  cached by an evidence hash — **no answer text is hardcoded**, so wording differs
  between takes unless a cached answer is reused. `?ask=` in the URL auto-runs a
  question (used by Library deep-links).

### `/onboarding` — Setup wizard · **rough (contains an overclaim)**
A polished 5-step wizard (Welcome → Connect → Build → Declare → Prove it) that
re-runs the real ingest engine, writes real declarations, and mines real
answerable proof questions.
- **Specifics — this is where "nothing is mocked" is literally false:** the Welcome
  copy says *"Real data, real database — nothing is mocked,"* but in **Connect only
  the spreadsheet actually connects.** CRM, email, and calls are **faked with a
  `setTimeout`** (`// Simulate the OAuth handshake…`). A sharp audience will catch
  this. Also: the "15-minute target" timer will read ~0:45 live (theatrical), and
  `materializeAction()` is fire-and-forget (if it fails, `/decisions` is silently
  empty).

### `/sources` — Four raw source viewers · **demo-ready**
Shows the four ugly, human source datasets side-by-side (CRM accounts/deals, the
Renewals Sheet, emails, call transcripts) with a note that *no* resolution is
applied here — this is the "mess" beat.
- **Specifics:** The Renewals tab shows a **freshness badge**. Right now it is the
  amber **"showing cached data · cached <time>"** state because the live Google
  Sheet read fails (see §f). Green "Live · updated …" only appears if a service
  account is configured.

### `/settings` — Systems of record + freshness · **demo-ready** (minor rough edge)
Renders the declared systems-of-record (the renewals SoR is **ratified**, ownership
is **proposed**) and the freshness policy, all editable via real server actions
with append-only supersede semantics.
- **Specifics:** Validation errors `throw` raw and surface as an **unstyled Next.js
  error page** (no inline message); forms lack `required`. Won't fire on the happy
  path, but don't fat-finger an empty field on camera.

### `/facts` — The fact ledger · **demo-ready**
Every stored fact with entity/attribute/value/source; click a row to see provenance
(tool, document, timestamp) and the exact quoted passage, with "Show in source
document" highlighting for emails/calls. **1,626 facts currently loaded.**
- **Specifics:** Graceful empty/migration states. `source_quote` can be `(not
  recorded)`. Uses deprecated `substr` (harmless).

### `/conflicts` — Live conflict board · **demo-ready** (strong surface)
Recomputes conflicts live and shows, per conflict, **every** value (winner ✓,
losers struck-through, nothing hidden), source chips with dates, and a plain-English
governing rule tagged by basis (declared SoR / corroboration / freshness / override).
- **Specifics:** There's an **"Only planted conflicts" filter** and each card can
  show a `planted …` chip — i.e. the app visibly *knows which conflicts were
  seeded*. Fine internally; a savvy buyer may raise an eyebrow. Consider not toggling
  that filter on camera.

### `/decisions` — Decision log with revert · **demo-ready** (cosmetic bug)
Auto-materializes the arbitration/merge/classification decisions and offers a working
**Revert/Restore** per row that recomputes downstream answers.
- **Specifics:** The optimistic revert writes a **1970-01-01 timestamp**
  (`new Date(0)`) purely to flip card styling before the server reconciles — harmless
  today (UI only checks truthiness) but a landmine if anyone ever renders that date.

### `/library` + `/library/[id]` — Agent work products · **demo-ready** (cluttered)
Lists agent-produced briefs (title/entity/request/date) and renders each with its
answer envelope.
- **Specifics:** **12 leftover work products** from prior test/demo runs are sitting
  here right now (including near-duplicates like two "The Northwind Freight renewal"
  and two "Pinnacle Robotics deal" briefs from crew runs). **Reset does NOT clear the
  Library** (it only clears facts + crew_runs), so this clutter persists across a
  reset. Clean it before recording if the Library is on screen.

### `/crew` — Delegation (brain-dump → board) · **rough / flaky**
The delegation feature: one box for a messy brain-dump → Anthropic triage into
outcome-shaped workstreams → deterministic cited briefs → confirm → kanban dispatch
via the agent loop → deliverables file back to the graph → one-tap brief-quality
verdict → hard-gated Parallel toggle.
- **Specifics:** See §d — real but **not reliably clean**; several workstreams are
  currently stranded mid-board, and it shares the `recordStep` FK bug.

### `/admin` — Control room · **demo-ready** (it's the linchpin)
Reset demo, per-source toggles, agent-session clearing, **Conflict yield**
scoreboard, and **Crew brief-quality** rollup.
- **Specifics:** **Conflict yield currently shows amber "needs attention"** (junk =
  1, per HANDOFF — the "zero junk" promise is unmet). The "Clear run logs" button
  here is the most likely trigger of the FK step errors if pressed during a run.

---

## 2. (a) Reset → onboarding → proof → kill shot, end-to-end

**It works as a sequence, but it is not one button, and I could not time it live
(500 blocker).**

The path and its real costs:
1. **`/admin` → Reset demo** — instant. `resetDemo()` truncates facts, ingest cache,
   belief cache, entities, decisions, crew_runs; reseeds the two declarations
   (renewals **ratified**, ownership **proposed**); reconnects all four sources;
   sets Parallel OFF. **Crucially it wipes all facts** — after reset the app knows
   nothing until you re-ingest.
2. **`/onboarding` → Build** — **the slow, expensive step.** Re-ingests the four
   sources; email/transcript extraction is per-document Anthropic calls (28 emails +
   8 transcripts). This is minutes, not seconds, and burns API credit.
3. **Declare** — writes the declarations (fast).
4. **Prove it** — mines real answerable proofs (a few seconds; one retrieval each).
5. **Ask the kill shot** — `/` → "When does **Cobalt Ridge Manufacturing** renew?"
   → one Anthropic synthesis call (~5–10s). The kill-shot answer is **not currently
   cached** (the cached copy is invalidated), so the first ask pays full latency.

**Estimated wall-clock: ~3–6 minutes**, almost all of it in re-ingest. **Gotcha:** if
a presenter resets and then jumps straight to Ask without completing Build, Ask
returns "no evidence" — the loop *must* pass through Build. **Not verified with a
live stopwatch this session** because the server is down.

---

## 3. (b) The exact kill-shot answer text for "When does Northwind renew?"

**I cannot paste it, and that itself is the finding — for three reasons:**

1. **Wrong entity for this fixture.** The demo script's "Northwind / April 1 vs
   March 15" story is a **narrative placeholder**. The loaded fixture is *Meridian
   Analytics*, and its real renewal-conflict star is **Cobalt Ridge Manufacturing**
   (CRM says **Sept 30 2026**, the Sheet says **June 30 2026**; the Sheet wins,
   updated 4 days before the snapshot per countersigned order form
   `CRM-CBR-2026-0311`). "Northwind Freight" is a **clean, non-conflict account.**

2. **The real, rendered answer for Northwind is boring.** Straight from the live
   belief cache, the app's actual answer for Northwind Freight's renewal is:
   > **"Northwind Freight's renewal date is 2027-06-19 and the account owner is Diego Marin."**
   (answerable: true, confidence ≈ 0.80, **no conflict**.) Asking "When does Northwind
   renew?" on stage produces *this* — not a kill shot.

3. **No answer text is hardcoded anywhere.** Every answer is generated by a live
   `claude-sonnet-5` call and cached by evidence hash. Wording **varies run to run**,
   so there is no verbatim string to guarantee — and the Cobalt Ridge kill-shot
   answer is currently **invalidated in cache**, so the next ask regenerates it fresh.

**Action:** in any recording, ask the kill shot about **Cobalt Ridge Manufacturing**
(or use the seeded chip), and pre-warm it once so the cached wording is the one you
rehearsed.

---

## 4. (c) Gate-1 precision & Gate W-B brief-quality %

- **"Gate-1 precision" does not exist as a rendered metric.** There is no
  entity-resolution precision score anywhere in the UI. `labeled_pairs.csv` (the
  200-pair answer key) is **never read by the app**. The nearest live scoreboard is
  `/admin` **Conflict yield**: *planted caught / junk (false positives) / winners
  correct*. Per HANDOFF it currently reads **junk = 1**, so the badge is amber
  **"needs attention,"** not green "zero junk." (Also note: the `entities` table is
  **empty (0 rows)** — by design, since resolution runs inline via anchored
  normalization, not by populating that table. Don't put an "entity count" on screen.)

- **Gate W-B brief-quality (Crew):** from the live DB, **exactly 1 brief has been
  rated** (verdict: *no correction*). So the headline is **100% — but across only 1
  rated brief.** The Parallel gate needs **≥10 rated AND ≥80% clean**, so it is
  **LOCKED** ("9 more briefs to rate"), and Parallel is **OFF**. Constants:
  `PARALLEL_MIN_RATED = 10`, `PARALLEL_QUALITY_BAR = 80`, `MAX_PARALLEL = 2`.

---

## 5. (d) Does the Crew flow run reliably?

**It runs, but not cleanly. Treat it as flaky.** The full chain exists
(brain-dump → triage → cited brief → confirm → board → agent steps → file-back →
quality tap), it reuses the real agent loop, and it has executed **6 runs** with
deliverables filed back to the Library. But the live DB shows the board is **not
converging**:

| Crew workstream status | count |
|---|---|
| `review` (produced, awaiting quality tap) | 5 |
| `inline` (answered without dispatch) | 4 |
| `needs_input` (agent produced nothing / errored) | 2 |
| `queued` (never dispatched) | 2 |
| `done` + rated | 1 |

So on any given run you risk cards stalling in `needs_input`/`queued`, plus the
`recordStep` FK errors (§7). Triage is a live Anthropic call and each dispatched
workstream is a full 30–160s agent run — long dead-air on camera.

**A brain-dump that demos well (fixture-aligned — this matters):** the built-in
example references entities that are either clean or not in the fixture, so use
planted-conflict entities instead. Recommended:

> *"Prep the Cobalt Ridge renewal and confirm the real date, verify the Prairie
> Point discount, check whether Grantline is still an active customer, and draft a
> QBR summary."*

Each clause maps to a real planted conflict (Cobalt Ridge date, Prairie Point buried
20% discount, Grantline churn-vs-active) so every brief comes back grounded and
cited — and the QBR clause exercises compute.

---

## 6. (e) Does the E2B QBR-with-chart run reliably, and how long live?

**It works — the Library contains real chart work products** ("QBR Summary —
Northwind Freight," "Pipeline Summary by Stage," "Renewal Calendar — Next Quarter",
all produced 2026-07-26). The E2B runner is genuine: a throwaway network-isolated
sandbox, graph JSON handed in, Python + matplotlib run, PNG streamed back, sandbox
killed. `E2B_API_KEY` is set.

**Live duration: ~1–2.5 minutes.** Compute-bearing agent runs in the log took
**120–161s** (LLM planning turns + ~60s sandbox timeout budget + cold start +
Python). It is the **slowest beat** and depends on E2B free-tier availability *and*
a funded Anthropic key. **Follow the demo script's own advice and cache a last-good
QBR chart** to show if the sandbox is slow or times out.

---

## 7. (f) Is the real Google Sheet connection live? Freshness badge?

**No — it is running on the cached CSV fallback locally.** `_dev.log` shows, on every
`/sources` load: *"Live renewals fetch failed; serving cached CSV instead: … ENOENT …
google-service-account.json."* No service-account key file exists and no
`GOOGLE_SERVICE_ACCOUNT_JSON` env var is set, so `fetchLiveRenewals()` throws and
`loadRenewals()` falls back to `fixture/renewals_tracker.csv`.

- **Badge currently shows:** amber **"showing cached data · cached <relative time>"**
  (tooltip: *"Live Google Sheets read failed — showing the local cached CSV"*). The
  green **"Live · updated …"** state only appears if a service account is wired
  (possibly true on Vercel; **false on this machine**).
- **Two things to know:** (1) the Sheet is a **read-only viewer** on `/sources` — it
  does **not** feed the Ask/kill-shot arbitration, which reads ingested Postgres
  facts; (2) `googleSheet.ts` uses **read-only scopes** — there is **no write path**,
  so the "write-back to the real Sheet" beat cannot be performed (see §9).

---

## 8. (g) Every known bug / flaky / unfinished thing that could embarrass us

**Showstoppers**
1. **Home page 500 right now** — `EBUSY` lock on the Next.js font manifest (OneDrive
   + stale `next dev`). App is unrunnable until `.next` is cleared and the repo is
   off the synced path. (§Blocker)
2. **Beats 9, 11, and 12 of `DEMO_SCRIPT.md` are not implemented at all** — no
   write-back to the Sheet (read-only scopes, no apply/verify/revert), no scheduler /
   morning brief, no long-horizon fast-forward. If the video follows the 12-beat
   script, **a third of it cannot be shown.** (§9)

**Flaky / wrong-looking**
3. **`recordStep` FK violations** (`agent_steps_session_id_fkey`) recur in the log
   during agent runs — agent steps stream to the screen live but **fail to persist**,
   so a reloaded session/library view can be missing its step log. 3 agent sessions
   are in `error` state. Most likely trigger: "Clear run logs" on `/admin` (or a
   race) deleting the session row mid-run. Don't clear logs while anything is running.
4. **Crew board leaves stranded cards** (5 `review`, 2 `needs_input`, 2 `queued`) —
   a live crew run may stall visibly.
5. **Kill-shot answer is non-deterministic and currently un-cached** — first ask is
   ~5–10s and the wording may differ from your rehearsal. Pre-warm it.

**Overclaims the audience can catch**
6. **Onboarding says "nothing is mocked"** while 3 of 4 connectors are `setTimeout`
   fakes. Soften the copy or don't dwell on the Connect step.
7. **`/admin` Conflict yield is amber "needs attention" (junk = 1)** — contradicts any
   "zero junk / perfect precision" claim.
8. **`/sources` Renewals badge says "cached," not "Live"** — don't call it live.

**Clutter / cosmetic**
9. **12 leftover Library work products** (with duplicates) — reset does **not** clear
   them; tidy before recording if the Library is shown.
10. **Decisions revert shows a 1970 timestamp** internally (cosmetic; only a risk if
    displayed).
11. **Settings validation errors** render as an unstyled Next error page.
12. **`/entities` and `/review` 404** if typed (not linked — low risk).
13. **Agent/crew runs are 30–160s** — plan narration to cover the dead air.

---

## 9. Bonus: `DEMO_SCRIPT.md` 12-beat coverage vs. reality

The script is written as if all 12 beats are performable. They are not. Honest map:

| Beat | Claim | Reality |
|---|---|---|
| 1 The mess | Four raw sources | ✅ `/sources` |
| 2 Connect & build | Live ingest, resolution, provenance | ⚠️ Real ingest, but 3/4 connectors faked on `/onboarding` |
| 3 Cited answer + freshness | Grounded, clickable, aged | ✅ `/` |
| 4 Kill shot | Conflict arbitration, both sides | ✅ **on Cobalt Ridge**, not Northwind |
| 5 Buried discount | Cross-source recall | ✅ Prairie Point discount is in the fixture |
| 6 Revoke source live | Answer recomputes | ✅ source toggles + evidence-hash recompute |
| 7 Delegate brain-dump | Task ledger fills | ⚠️ `/crew` works but flaky (§d) |
| 8 Real Python → chart | Sandboxed compute | ✅ E2B, but slow (§e) |
| 9 Morning brief by itself | Scheduled/proactive | ❌ **Not implemented** — no scheduler |
| 10 Correction → ratify → cited | Canon proposal flow | ⚠️ Partial — `/settings` can create/ratify declarations, but the "type a correction → auto-proposed canon entry → cited" flow isn't wired |
| 11 Write-back to the Sheet | Dry-run/apply/verify/revert | ❌ **Not implemented** — read-only scopes, no write path |
| 12 Long-horizon fast-forward | Replay a week | ❌ **Not implemented** |

**Bottom line for the video:** you can genuinely demo Beats 1–8 (with the fixes and
caveats above). Beats 9–12 are aspirational and would have to be cut, faked, or built
first. Do not script them as live.

---

## 10. (h) Seeded questions in Ask

Parsed live from the `SUGGESTED_QUESTIONS` block in `DEMO_SCRIPT.md` (edit that block
to change the chips). Currently **9**:

1. Who is the primary contact at Cobalt Ridge Manufacturing?
2. When does Cobalt Ridge Manufacturing renew?  ← **the real kill shot**
3. What is Quantum Peak Insurance's ARR?
4. Who owns the Thornbury & Cole account?
5. Is Grantline Media Group still an active customer?
6. Is there anything I should know before the Prairie Point renewal?
7. QBR summary for Northwind Freight with a revenue chart  ← compute/E2B
8. Pipeline summary by stage with totals  ← compute/E2B
9. Renewal calendar for next quarter  ← compute/E2B

If `DEMO_SCRIPT.md` or its markers go missing, the code falls back to a built-in set
of **4** (Cobalt Ridge renewal, Quantum Peak ARR, Thornbury & Cole owner, Grantline
active) — so the page always has chips.

---

## Recommendation for the leadership video

**Record Beats 1–8 only**, in this order, after: clearing the 500, tidying the
Library, and pre-warming the Cobalt Ridge kill shot. Use **Cobalt Ridge
Manufacturing** as the star account throughout (never "Northwind" for the kill shot).
Brief around, or edit out, the "nothing is mocked" line and the amber "cached"/
"needs attention" badges. Keep narration ready to cover 1–2.5 min compute waits. Do
**not** promise the morning brief, write-back, or long-horizon replay — they don't
exist yet.

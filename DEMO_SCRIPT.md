# DEMO_SCRIPT.md — TrustLayer walkthrough

This is the live demo path. Every beat below can be done in one browser window
against the loaded fixture. If a beat cannot be performed for real, it is marked
**not built** and is not part of the run.

**Rules for the run**

- Real data, real database. No mocked answer screens.
- One browser window. One app.
- Say less than the screen shows. Let the product talk.
- Every claim on screen should carry a receipt: citation, freshness, or conflict.

**Total budget: about 12 minutes** for beats 1–8. The kill shot (beat 4) is the
one we never rush.

The home-page question chips are seeded from the block at the bottom of this
file. Edit that block to change the chips.

---

## Cast (memorize these)

The demo company is **Meridian Analytics**. It runs on four disconnected tools:
**CRM, a spreadsheet (“the Sheet”), email, and call transcripts.**

The star account is **Cobalt Ridge Manufacturing** — not Northwind. Northwind
Freight is in the fixture and is a *clean* account (good for a chart, bad for a
conflict).

The single conflict everything hinges on:

| Fact | CRM says | The Sheet says |
|---|---|---|
| Cobalt Ridge renewal date | **30 September 2026** | **30 June 2026** |
| Last edited | ~8 months before the snapshot | **4 days** before the snapshot (from the signed order form) |
| Declared system of record for *renewals* | — | the Sheet |

TrustLayer picks **30 June 2026** — and can say *why* in one sentence. That
sentence is the product.

---

## Beat 1 — The mess (0:00–1:00)

**On screen:** `/sources` — the four raw sources, side by side, ugly and human.

- CRM record for Cobalt Ridge Manufacturing
- The Sheet, Renewals tab, same account, different date
- An email thread about the order form
- A call transcript that talks about the renewal

**Narration:**
> "This is how every company actually runs. Four tools that don't talk. The same
> customer wears different names. Somewhere in here is the answer to 'when does
> Cobalt Ridge renew?' — and two of these sources disagree."

**This beat proves:** the pain is real and visible in 60 seconds.

---

## Beat 2 — Connect and watch it build (1:00–2:15)

**On screen:** `/onboarding` (or `/admin` → **Ingest fixture**).

Click through Connect, then Build. A log streams: rows read, names folded
together, facts stored with source, document, time, and a hash.

Be honest if asked: the spreadsheet card can talk to Google; CRM, email, and
calls use a short demo connector. The **Build** step is the real ingest from
the files in `fixture/`.

**Narration:**
> "I'm connecting the four tools. Watch it resolve, not copy. Four spellings of
> one customer collapse into one identity. Every fact keeps its receipt."

**This beat proves:** ingest and provenance are happening for real.

---

## Beat 3 — A cited answer with freshness (2:15–3:15)

**On screen:** `/` — ask **“Who is the primary contact at Cobalt Ridge Manufacturing?”**

Answer returns with inline citations and a freshness badge. Click a citation →
the exact passage.

**Narration:**
> "First question, an easy one. Every claim is footnoted. Click it, I land on
> the source. And every answer wears its age."

**This beat proves:** answers are grounded and clickable. It sets up beat 4.

---

## Beat 4 — The kill shot (3:15–4:30)

**On screen:** `/` — ask **“When does Cobalt Ridge Manufacturing renew?”**

The answer should be **30 June 2026**, with both sides shown: the Sheet wins
because it is the declared system of record for renewals and it is fresher. The
CRM’s 30 September 2026 is months stale.

Expand the conflict. The governing rule is a human sentence.

**Narration:**
> "Two sources disagree. It didn't guess, and it didn't hide the disagreement.
> It picked June 30 because *you* declared the Sheet the system of record for
> renewals — and the Sheet was touched days ago, while the CRM is eight months
> stale. That's the difference between an answer and a trustworthy answer."

**Do not rush this beat.**

Other chips that prove the same idea on different accounts:

- Quantum Peak Insurance ARR (recurring vs a bundled one-time figure)
- Thornbury & Cole owner (stale CRM vs corroborated current owner)
- Grantline Media Group still active? (CRM says Active; Sheet and email say Churned)

---

## Beat 5 — The buried discount (4:30–5:15)

**On screen:** `/` — ask **“Is there anything I should know before the Prairie Point renewal?”**

A **20% one-time discount** was approved in email and never reached the CRM or
the Sheet. The answer should cite that email.

**Narration:**
> "This is the part a human misses. It isn't in the CRM. It isn't in the Sheet.
> It's in an email nobody re-reads. TrustLayer hands it to you before you walk
> into the room — with the receipt."

**This beat proves:** a decision-changing fact can come from unstructured text.

---

## Beat 6 — Revoke a source; the answer recomputes (5:15–6:00)

**On screen:** `/admin` — turn **off** the spreadsheet. Return to `/` and re-ask
**“When does Cobalt Ridge Manufacturing renew?”**

The date may stay 30 June 2026 if email and a call also attest it. What must
move is **confidence** (it drops) and a banner that the declared system of
record is disconnected. `/conflicts` must not still name the Sheet as the
winner.

Then turn the spreadsheet back **on** so the rest of the demo is clean.

**Narration:**
> "Trust has to be revocable. I'll pull the Sheet right now. The answer doesn't
> break — it degrades honestly, and it drops its own confidence."

**This beat proves:** permissions change the answer, and the system says so.

---

## Beat 7 — Delegate a brain-dump (6:00–7:15)

**On screen:** `/crew` — paste:

> Prep the Cobalt Ridge renewal and confirm the real date, verify the Prairie
> Point discount, check whether Grantline is still an active customer, and
> draft a QBR summary.

Review the plan and the cited briefs. **Nothing runs until you click Confirm.**
Then watch the board. Each card can take 30–160 seconds.

**Narration:**
> "I'm not going to click through a wizard. Watch the board fill. It turned a
> run-on sentence into a plan, and I can watch every step."

**This beat proves:** natural-language delegation → a task board → visible work.

Afterward: tap a quality verdict on a finished brief. Filed-back items appear
on `/facts`. Finished briefs appear on `/library`.

---

## Beat 8 — Real Python in a sandbox → a chart (7:15–8:30)

**Needs `E2B_API_KEY`.** If it is not set, skip this beat and say so.

**On screen:** `/` — use a compute chip, for example **“QBR summary for Northwind Freight with a revenue chart.”**

Northwind is the right account here: it is clean, so the chart is not fighting
a conflict. The agent writes Python, runs it in an isolated sandbox, and the
work product shows the code, the output, and where each number came from.

This beat is slow (often 1–2 minutes). Narrate over the wait.

**Narration:**
> "This isn't a model describing a chart. It's writing and running Python on
> the real numbers — and the chart still carries its receipts."

**This beat proves:** genuine code execution on governed data.

---

## Not built — do not perform these

These ideas show up in older notes. They are **not in the product**. Do not
promise them on stage.

| Idea | Status |
|---|---|
| Scheduled morning brief | Not built — no scheduler |
| Type a correction → auto canon proposal → ratify → next answer cites it | Partial — you can create and ratify declarations on `/settings`, but there is no “type a correction” flow |
| Write the winning date back to the real Google Sheet (dry-run / apply / revert) | Not built — the Sheet path is read-only |
| Fast-forward a week-long job | Not built |

---

## If something fails

- **Database badge red:** stop. Fix `.env` and `npm run db:migrate` before continuing.
- **Ingest slow:** narrate the build log. The streaming *is* the reassurance.
- **Kill shot wrong:** stop. Re-ask once. If it is still wrong, the demo is not ready.
- **Sandbox timeout (beat 8):** skip the chart. Do not pretend.
- **Anthropic “credit balance is too low”:** billing, not a product bug.

---

## Suggested questions (runnable against the loaded fixture)

The Ask box on the home page seeds its chips from the list below. Each line is
`- <question> | beat:<n> | <one-line what it proves>`. Edit this block to change
the chips. If the block is missing, the app falls back to four built-in questions.

<!-- SUGGESTED_QUESTIONS:start -->
- Who is the primary contact at Cobalt Ridge Manufacturing? | beat:3 | Grounded, cited, single-source answer with a freshness badge.
- When does Cobalt Ridge Manufacturing renew? | beat:4 | The kill shot: CRM and the Sheet disagree; the ratified system-of-record + freshness pick the winner, both sides shown.
- What is Quantum Peak Insurance's ARR? | beat:4 | Conflict resolved by corroboration — recurring ARR ($365K) over the board-deck figure that bundled a one-time add-on.
- Who owns the Thornbury & Cole account? | beat:4 | Stale CRM owner vs. the corroborated current owner across the Sheet and email.
- Is Grantline Media Group still an active customer? | beat:4 | CRM still says Active; the Sheet and the customer's own email say Churned.
- Is there anything I should know before the Prairie Point renewal? | beat:5 | Cross-source recall: a discount approval buried in email that never reached the CRM or the Sheet.
- QBR summary for Northwind Freight with a revenue chart | beat:8 | Compute: the agent writes Python, runs it in an isolated sandbox against the graph export, and charts Northwind's revenue — the code, output, and every number's source shown on the work product.
- Pipeline summary by stage with totals | beat:8 | Compute: open renewal deals grouped by stage, summed, and charted — the totals are calculated in the sandbox, each traceable to its CRM deal row.
- Renewal calendar for next quarter | beat:8 | Compute: accounts renewing next quarter, by month, using the arbitrated (conflict-resolved) renewal dates — the contested ones flagged.
<!-- SUGGESTED_QUESTIONS:end -->

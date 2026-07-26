# DEMO_SCRIPT.md — TrustLayer, ~12 minutes

> **This script is the spec.** It was written before the features existed. Every
> milestone on the build plan exists to make **one beat below** literally true on
> stage — not approximately, not "close enough for a demo." If a beat can't be
> performed for real, the feature isn't done.
>
> **Rules for the run:**
> - Real data, real database, real sandbox. No mocked screens, no video splices.
> - One browser window. One app. If we alt-tab, we've already lost.
> - The narrator says *less* than the screen shows. Let the product talk.
> - Every claim on screen carries its receipt: citation, freshness, conflict.
>
> **Total budget: ~12:00.** Timings are targets, not gates. The kill shot (Beat 4)
> and write-back (Beat 11) are the two beats we never rush.

---

## Cast & fixture facts (memorize these)

The demo company runs on four disconnected tools: **CRM, a spreadsheet ("the
Sheet"), email, and call transcripts.** The star account is **Northwind**.

The single conflict everything hinges on:

| Fact | CRM says | The Sheet says |
|---|---|---|
| Northwind renewal date | **March 15** | **April 1** |
| Last edited | ~8 months ago | **2 days ago** |
| Declared system of record for *renewals* | — | ✅ **the Sheet** |

TrustLayer picks **April 1** — and can say *why* in one sentence. That sentence is
the whole product. Everything else is scaffolding to earn the right to say it.

---

## Beat 1 — The mess (0:00–1:00)

**On screen:** The four raw sources, side by side, ugly and human.
- CRM record for "Northwind Standard Corp."
- The Sheet, tab "Renewals," with "Northwind" in row 12.
- An email thread where someone types "Northwind" lowercase.
- A call transcript that says "the Northwind folks."

**Narration:**
> "This is how every company actually runs. Four tools that don't talk. The same
> customer wears four different names. Somewhere in here is the answer to 'when
> does Northwind renew?' — and two of these sources disagree. Nobody knows which
> to trust. Today that costs you a renewal. Let's fix it in ten minutes."

**The one true thing this beat proves:** the pain is real and legible in 60 seconds.

---

## Beat 2 — Connect & watch it build (1:00–2:15)

**On screen:** Click **Connect** on each of the four sources. Ingestion runs live.
A build log streams: rows read, **entities resolved** ("Northwind Standard Corp.",
"northwind", "the Northwind folks" → **one identity**), facts stored with
**provenance** (source tool, document, timestamp, content hash).

**Narration:**
> "I'm connecting the four tools. Watch the middle column. It's not copying data —
> it's *resolving* it. Four names for one customer collapse into one identity. And
> every single fact it stores keeps its receipt: which tool, which document, when,
> and a hash so we can prove it never changed underneath us."

**The one true thing:** entity resolution and provenance are happening for real,
visibly, on ingest — not pre-baked.

---

## Beat 3 — A cited answer with freshness (2:15–3:15)

**On screen:** Ask a safe warm-up question: **"Who is the primary contact at
Northwind?"** Answer returns with **inline citations** and a **freshness badge**
("from the CRM, updated 3 weeks ago"). Click a citation → jumps to the source row.

**Narration:**
> "First question, an easy one. Notice two things. Every claim is footnoted — click
> it, I land on the exact source row. And every answer wears its age. 'Three weeks
> old' is fine for a contact name. It will not be fine in about thirty seconds."

**The one true thing:** answers are grounded and clickable; freshness is always on
screen. This beat *sets the trap* for Beat 4.

---

## Beat 4 — The kill shot (3:15–4:30)

**On screen:** Ask **"When does Northwind renew?"**

The answer:

> **April 1.**
> *Two sources disagree.* Showing **April 1** — **the Sheet**, your declared
> **system of record for renewals**, edited **2 days ago**. The CRM's **March 15**
> is **8 months old.**

A **conflict badge** is visible. Expand it to show both values side by side, the
system-of-record rule, and the freshness gap.

**Narration (slow down here):**
> "Here's the whole company in one sentence. Two sources disagree. It didn't guess,
> and it didn't hide the disagreement. It picked April 1 because *you* declared the
> Sheet the system of record for renewals — and the Sheet was touched two days ago,
> while the CRM's answer is eight months stale. It shows its work. That's the
> difference between an answer and a *trustworthy* answer."

**The one true thing this beat proves — the reason the product exists:** arbitration
by declared system-of-record + freshness, stated in plain language, with both sides
shown. **Do not rush this beat.**

---

## Beat 5 — The buried discount surfaced (4:30–5:15)

**On screen:** Ask **"Is there anything I should know before the Northwind
renewal?"** TrustLayer surfaces a discount commitment buried in a **call transcript**
("we told them 15% if they sign before end of quarter") that never made it into the
CRM. Cited to the transcript, timestamped.

**Narration:**
> "This is the part a human misses. Eight weeks ago, on a call, someone promised
> Northwind 15% off for signing early. It's not in the CRM. It's not in the Sheet.
> It's in a transcript nobody re-reads. TrustLayer read it, remembered it, and hands
> it to you before you walk into the room — with the receipt."

**The one true thing:** cross-source recall pulls a decision-changing fact out of
unstructured audio-derived text.

---

## Beat 6 — Revoke a source live; answer recomputes (5:15–6:00)

**On screen:** Open source settings. **Revoke the Sheet.** Immediately re-ask
**"When does Northwind renew?"** The answer **recomputes live**: now it falls back
to the CRM's **March 15**, at **reduced confidence**, with a banner: *"System of
record for renewals was revoked — answering from the CRM, 8 months old. Confidence
lowered."*

**Narration:**
> "Trust has to be revocable. I'll pull the Sheet's access right now. Watch the
> answer — it doesn't break, it *degrades honestly*. Now it's forced back onto the
> stale CRM, and it tells you so, and it drops its own confidence. It would rather
> be uncertain out loud than confident and wrong."

**Then:** re-grant the Sheet so the rest of the demo is clean.

**The one true thing:** governance is live and consequential — permissions change
the answer, and the system narrates its own uncertainty.

---

## Beat 7 — Delegate a brain-dump; the board fills (6:00–7:15)

**On screen:** Paste an unstructured **brain-dump** into the delegate box:
> "prep the Northwind renewal — check the discount, confirm the date, draft the
> QBR numbers, and flag anything weird."

TrustLayer decomposes it into a **task ledger** on a board. Tasks appear
(Confirm renewal date ✓ already known · Verify 15% discount · Assemble QBR numbers ·
Flag anomalies). One agent picks up a task and works it with **visible steps**.

**Narration:**
> "I'm not going to click through a wizard. I'm going to talk like a human having a
> bad Monday. Watch the board fill itself. It turned a run-on sentence into a plan,
> and it's already working the first task — and I can watch every step it takes."

**The one true thing:** natural-language delegation → structured task ledger →
visible autonomous work.

---

## Beat 8 — Real Python in a sandbox → a QBR chart (7:15–8:30)

**On screen:** The QBR task runs **real Python in a sandbox** against the resolved
Northwind facts. Code is visible. It computes usage/spend trend and renders a **QBR
chart**. The chart lands in the work product **with the answer envelope** attached
(citations to the underlying facts, freshness, the discount conflict noted).

**Narration:**
> "This isn't a language model describing a chart. It's writing and running actual
> Python in a sandbox, on your real numbers, and producing the QBR figure you'd put
> in front of Northwind. And even the chart carries its receipts — where every
> number came from and how fresh it is."

**The one true thing:** genuine code execution on governed data, output still
carrying citations/freshness/conflict.

---

## Beat 9 — The morning brief arrives by itself (8:30–9:15)

**On screen:** A **morning brief** that was scheduled earlier is already sitting in
the inbox/notifications — generated autonomously overnight. Open it: Northwind
renewal in N days, the April-1-vs-March-15 conflict resolved, the 15% discount flag,
next actions. Every line cited.

**Narration:**
> "I didn't ask for this just now. Last night, on a schedule, it wrote my brief.
> Renewal countdown, the conflict already settled, the discount I'd have forgotten —
> waiting for me before coffee. The work happens whether or not I'm watching."

**The one true thing:** the system runs on its own clock and delivers proactively —
same envelope, no human in the loop.

---

## Beat 10 — Correction → canon proposal → ratify → cited (9:15–10:15)

**On screen:** Type a correction: **"Actually the primary contact is now Dana Reyes,
not the old one."** TrustLayer does **not** silently overwrite. It raises a **canon
proposal** into a governance queue. Owner clicks **Ratify.** Re-ask "who's the
primary contact at Northwind?" → new answer **cites the ratified canon entry.**

**Narration:**
> "When I correct it, it doesn't just believe me and scribble over the record.
> Nothing here is ever overwritten. It proposes a change to the canon and waits for
> a human to ratify it. I approve — and now the next answer cites *that* decision,
> with my name on it. Governed memory, not a sticky note."

**The one true thing:** human-in-the-loop canon — corrections become governed,
attributable, cited facts; nothing overwritten.

---

## Beat 11 — Fix the conflict at the source: write-back (10:15–11:15)

**On screen:** Now close the loop on Beat 4's conflict. TrustLayer offers to
**write the correct renewal date back to the real Sheet.**
1. **Dry-run:** shows the exact cell and the before→after diff (`Renewals!D12:
   March 15 → April 1`). Nothing has changed yet.
2. **Apply:** writes to the real sheet.
3. **Verify:** re-reads the cell live and confirms the new value.
4. **One-click Revert:** puts it back, instantly, and confirms the revert.

**Narration:**
> "Reading is nice. Fixing is the job. It'll correct the stale CRM date at the
> source — but never blind. First a dry run: here's the exact cell, here's
> before and after, nothing's touched yet. Now apply. Now it re-reads to prove it
> took. And if I'm not happy — one click, and it's back the way it was. Powerful,
> and reversible."

**The one true thing:** safe write-back — dry-run → apply → verify → revert on a
real external system. **The second beat we never rush.**

---

## Beat 12 — The long-horizon job's week, in 60 seconds (11:15–12:00)

**On screen:** Open a **long-horizon job** ("shepherd the Northwind renewal to
close"). Hit **fast-forward.** A week of scheduled agent activity replays in 60
seconds on a timeline: brief on day 1, follow-up drafted day 3, discount reminder
day 5, QBR assembled day 6, renewal confirmed day 7 — each step with its envelope.

**Narration:**
> "Last thing. Most of the value of this isn't in a demo minute — it's in the weeks
> nobody watches. So here's a week of one job, fast-forwarded. It briefed, it
> followed up, it reminded, it assembled the QBR, it landed the renewal. Every step
> receipted. You hire it once; it works the whole quarter."

**Close:**
> "Four disconnected tools, one trustworthy memory, an agent that does the work and
> shows every receipt. When two sources disagree, it doesn't guess — it tells you
> which to trust, and why. That's TrustLayer."

**The one true thing:** the value compounds over time, and the system makes an
invisible week visible in a minute.

---

## Failure drills (rehearse these before stage)

- **DB down:** home page "Database connected" badge goes red. Say so, don't hide it.
- **Ingest slow:** narrate the build log; the streaming *is* the reassurance.
- **Kill shot answer wrong:** stop. Re-ask once. If still wrong, the demo is not
  ready — do not talk over it.
- **Sandbox timeout (Beat 8):** have the last-good QBR chart cached to *show*, and
  say plainly it's a cached run.
- **Write-back (Beat 11):** always dry-run on stage. Never apply without the diff
  visible. Always revert before leaving the beat.

## Milestone → beat map (for the build plan)

Each milestone is "done" only when its beat is performable live, end to end:

1. Ingestion + entity resolution + provenance → **Beats 1–2**
2. Grounded answers + citations + freshness → **Beat 3**
3. Conflict arbitration (system-of-record + freshness) → **Beat 4 (kill shot)**
4. Cross-source recall → **Beat 5**
5. Live permission revocation + confidence → **Beat 6**
6. NL delegation + task ledger + visible agent steps → **Beat 7**
7. Sandboxed code execution + enveloped work product → **Beat 8**
8. Scheduled proactive brief → **Beat 9**
9. Canon proposals + ratification → **Beat 10**
10. Write-back: dry-run / apply / verify / revert → **Beat 11**
11. Long-horizon job + fast-forward replay → **Beat 12**

---

## Suggested questions (runnable against the loaded fixture)

The beats above use **Northwind** as a stand-in star account. The fixture actually
loaded into the app is **Meridian Analytics**, whose real renewal-conflict star is
**Cobalt Ridge Manufacturing**. The Ask box on the home page seeds its suggested
questions from the list below, so every chip returns a grounded answer live — the
script's own rule ("if a beat can't be performed for real, the feature isn't done").

Each line is `- <question> | beat:<n> | <one-line what it proves>`. The home page
parses this block; edit it to change the seeded chips.

<!-- SUGGESTED_QUESTIONS:start -->
- Who is the primary contact at Cobalt Ridge Manufacturing? | beat:3 | Grounded, cited, single-source answer with a freshness badge.
- When does Cobalt Ridge Manufacturing renew? | beat:4 | The kill shot: CRM and the Sheet disagree; the ratified system-of-record + freshness pick the winner, both sides shown.
- What is Quantum Peak Insurance's ARR? | beat:4 | Conflict resolved by corroboration — recurring ARR ($365K) over the board-deck figure that bundled a one-time add-on.
- Who owns the Thornbury & Cole account? | beat:4 | Stale CRM owner vs. the corroborated current owner across the Sheet and email.
- Is Grantline Media Group still an active customer? | beat:4 | CRM still says Active; the Sheet and the customer's own email say Churned.
- Is there anything I should know before the Prairie Point renewal? | beat:5 | Cross-source recall: a discount approval buried in email that never reached the CRM or the Sheet.
- QBR summary for Northwind Freight with a revenue chart | beat:6 | Compute: the agent writes Python, runs it in an isolated sandbox against the graph export, and charts Northwind's revenue — the code, output, and every number's source shown on the work product.
- Pipeline summary by stage with totals | beat:6 | Compute: open renewal deals grouped by stage, summed, and charted — the totals are calculated in the sandbox, each traceable to its CRM deal row.
- Renewal calendar for next quarter | beat:6 | Compute: accounts renewing next quarter, by month, using the arbitrated (conflict-resolved) renewal dates — the contested ones flagged.
<!-- SUGGESTED_QUESTIONS:end -->

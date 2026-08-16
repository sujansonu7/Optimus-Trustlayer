# CLAUDE.md — TrustLayer Standing Brief

This file is the durable brief for anyone (human or AI) working on TrustLayer.
Read it before making changes.

How to run the app, load the demo, and walk the pages: **[README.md](README.md)**.
The product thesis (nine layers, why this order): **[VISION.md](VISION.md)**.
Do not duplicate setup here. Treat VISION.md as destination, not as a claim that every layer ships.

## What TrustLayer is

TrustLayer is a **knowledge operating system with a work layer**. Against the
bundled Meridian Analytics fixture it:

- **Ingests** data from four tools: **CRM, spreadsheet, email, calls**.
- **Resolves entities** that appear under multiple names into single identities.
- **Detects and arbitrates conflicts** using declared **systems of record** and
  **freshness**.
- **Answers questions** with **citations** and **freshness badges**.
- **Runs an agent** that does real work on that knowledge.
- Supports **delegation** with a **task ledger** (`/crew`).
- Maintains a **governed canon** with **human approval** (`/settings`, `/decisions`).

Not built (do not add docs or UI that claim they are): write-back to Google
Sheets, scheduled morning briefs, long-horizon job replay, or ingest of the
unused Slack / Notion / billing files in `fixture/`.

## Standing rules (do not violate)

1. **Explain in plain language.** The owner is non-technical. Explain choices
   briefly and plainly — no unexplained jargon.
2. **Boring and simple.** Prefer simple, well-understood solutions.
   **One app, one database.** No unnecessary services or moving parts.
3. **Never refactor working code unless explicitly asked.**
4. **Every stored fact carries provenance:** source tool, source document,
   timestamp, and content hash. **Nothing is ever overwritten — only
   superseded (bitemporal).**
5. **The agent engine holds no durable knowledge state.** All knowledge lives in
   **Postgres**. Agent sessions are **disposable**.
6. **Every agent answer and work product carries the answer envelope:**
   citations, freshness, and conflicts.
7. **All UI must be demo-ready** — this is shown to buyers.
8. **After any task, state exactly how to see the result in the browser**
   (which URL / page / action).

## Current stack (as built)

- **Next.js 14** (TypeScript, App Router, Tailwind CSS) — one app.
- **Neon Postgres** — the single database. Reachability is checked at request
  time in `lib/db.ts`; the home page shows a live "Database connected" badge.
- **Anthropic SDK** (`@anthropic-ai/sdk`) — the agent/LLM layer, keyed by
  `ANTHROPIC_API_KEY`.
- **E2B** (`@e2b/code-interpreter`) — the compute layer, keyed by `E2B_API_KEY`.
  The agent's `execute_python` tool writes Python that runs in an **isolated
  sandbox** against a **typed JSON export of the graph** (`lib/agent/graph.ts`) —
  never DB credentials. stdout and charts stream into the visible steps and
  attach to the work product, where the code, output, and every number's source
  are shown. It sits behind a swappable **`Runner`** interface
  (`lib/agent/runner/`), so the sandbox can be replaced in one file.
- Secrets live only in a git-ignored `.env` locally and in Vercel environment
  variables. `.env.example` documents the variable names. Setup is in the README.
- Deployed on **Vercel**.

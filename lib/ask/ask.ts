// Server-only: the Ask orchestrator. One entry point: ask(question).
//
// Flow:
//   1. Read which sources are connected (disconnected ones are unreachable).
//   2. Retrieve evidence from Postgres (connected sources only) and compute the
//      evidence hash — the belief-cache key.
//   3. Belief cache: if a live cached answer exists for this exact evidence set,
//      serve it (marked cached). This is the belief cache — same question, same
//      evidence => same answer, no model call.
//   4. Otherwise make the ONE Anthropic synthesis call, assemble the envelope,
//      compute confidence, and store it in the cache keyed by the evidence hash.
//
// Because the evidence hash folds in the connected-source set, revoking a source
// changes the hash, so a re-ask always recomputes from the remaining evidence.
import { query } from "@/lib/db";
import { connectedTools } from "./sources";
import { retrieve } from "./retrieve";
import { synthesize } from "./synthesize";
import { withConfidence } from "./confidence";
import { ALL_TOOLS, type AskEnvelope, type SourceTool } from "./types";

export async function ask(question: string): Promise<AskEnvelope> {
  const q = question.trim();
  const connected = await connectedTools();
  const disconnected = ALL_TOOLS.filter((t) => !connected.includes(t));

  // 1–2) Retrieve + hash.
  const r = await retrieve(q, connected);

  // 3) Belief cache lookup by evidence hash.
  const cached = await lookupCache(r.evidenceHash);
  if (cached) {
    // Reflect current connection state (it can't have changed the evidence — the
    // hash matched — but keep the envelope's connection view honest).
    return { ...cached, cached: true, connectedTools: connected, disconnectedTools: disconnected };
  }

  // 4) Synthesize (one Anthropic call).
  const s = await synthesize(r);

  const hasRatifiedSoR = r.declarations.some((d) => d.status === "ratified");
  const envelope = withConfidence(
    {
      question: q,
      answerable: s.answerable,
      answer: s.answer,
      claims: s.claims,
      evidence: r.evidence,
      conflicts: r.conflicts,
      freshness: r.freshness,
      declarations: r.declarations,
      connectedTools: connected,
      disconnectedTools: disconnected,
      degraded: r.degraded,
      note: s.note,
      cached: false,
      evidenceHash: r.evidenceHash,
    },
    hasRatifiedSoR
  );

  // Store the belief (fire-and-forget correctness: a cache write failure must
  // never fail the answer).
  const evidenceSources = Array.from(new Set(r.evidence.map((e) => e.sourceTool)));
  await storeCache(q, r.evidenceHash, envelope, evidenceSources, connected).catch((err) =>
    console.error("answer_cache write failed (non-fatal):", err)
  );

  return envelope;
}

/* ------------------------------------------------------------------ */
/* Belief cache                                                       */
/* ------------------------------------------------------------------ */

async function lookupCache(evidenceHash: string): Promise<AskEnvelope | null> {
  try {
    const { rows } = await query<{ envelope_json: AskEnvelope }>(
      `select envelope_json from answer_cache
        where evidence_hash = $1 and invalidated_at is null
        order by created_at desc
        limit 1`,
      [evidenceHash]
    );
    return rows[0]?.envelope_json ?? null;
  } catch {
    // Cache table missing (migration not applied) — behave as a cache miss.
    return null;
  }
}

async function storeCache(
  question: string,
  evidenceHash: string,
  envelope: AskEnvelope,
  evidenceSources: SourceTool[],
  connected: SourceTool[]
): Promise<void> {
  const norm = question.trim().toLowerCase().replace(/\s+/g, " ");
  await query(
    `insert into answer_cache
       (evidence_hash, question, question_norm, envelope_json, confidence,
        answerable, evidence_sources, connected_snapshot)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7::source_tool[],$8::source_tool[])
     on conflict do nothing`,
    [
      evidenceHash,
      question,
      norm,
      JSON.stringify(envelope),
      envelope.confidence,
      envelope.answerable,
      evidenceSources,
      connected,
    ]
  );
}

/** Cache stats for the /admin panel. */
export async function cacheStats(): Promise<{ live: number; invalidated: number } | null> {
  try {
    const { rows } = await query<{ live: string; invalidated: string }>(
      `select count(*) filter (where invalidated_at is null)::text as live,
              count(*) filter (where invalidated_at is not null)::text as invalidated
         from answer_cache`
    );
    return { live: Number(rows[0].live), invalidated: Number(rows[0].invalidated) };
  } catch {
    return null;
  }
}

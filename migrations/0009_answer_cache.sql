-- 0009_answer_cache.sql
-- Belief cache for the Ask feature.
--
-- Each answer is cached keyed by the HASH OF ITS EVIDENCE SET (evidence_hash).
-- The hash folds in: the normalized question, the exact set of source passages
-- that fed the answer (their content hashes), the governing declarations, and
-- the set of currently-connected sources. So:
--   * ask the same question against the same evidence  -> cache HIT (fast, free).
--   * disconnect a source (or the ledger changes)      -> the evidence set is
--     different -> different hash -> cache MISS -> the answer recomputes from
--     whatever evidence remains.
--
-- `evidence_sources` records which tools the cached answer actually drew on, so
-- disconnecting a tool can surgically INVALIDATE exactly the dependent answers
-- (Beat 6). Invalidation is a soft mark (invalidated_at) — like the rest of
-- TrustLayer, we supersede rather than delete, keeping the belief history.

create table if not exists answer_cache (
  id                uuid primary key default gen_random_uuid(),

  evidence_hash     text not null,            -- the cache key: hash of the evidence set
  question          text not null,            -- the exact question asked
  question_norm     text not null,            -- normalized question (for display/debug)

  envelope_json     jsonb not null,           -- the full answer envelope we served
  confidence        real not null,            -- 0..1, recomputed each time from the evidence
  answerable        boolean not null,         -- did the graph support an answer at all

  evidence_sources  source_tool[] not null default '{}',  -- tools this answer depended on
  connected_snapshot source_tool[] not null default '{}', -- tools connected when it was computed

  created_at        timestamptz not null default now(),
  invalidated_at    timestamptz               -- NULL == this belief is still live
);

-- Fast lookup of a live cached belief by its evidence hash.
create unique index if not exists answer_cache_live_hash_idx
  on answer_cache (evidence_hash)
  where invalidated_at is null;

-- Support surgical invalidation "every answer that depended on tool X".
create index if not exists answer_cache_sources_idx
  on answer_cache using gin (evidence_sources);

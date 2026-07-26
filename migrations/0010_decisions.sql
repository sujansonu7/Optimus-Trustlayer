-- 0010_decisions.sql
-- The decision log: every AUTOMATIC decision TrustLayer made while building the
-- graph, in one auditable place, each with its plain-English "why" and a working
-- Revert. Three kinds:
--
--   merge          — two or more raw names ("Silverline", "SLG", "the Silverline
--                    folks") were resolved into ONE identity. Reverting SPLITS
--                    that alias back out into its own entity, and dependent
--                    answers recompute.
--   classification — an unstructured line (email / call transcript) was labelled
--                    a fact of a given type ("commitment", "pricing", …).
--                    Reverting supersedes that fact so it stops informing answers.
--   arbitration    — two sources disagreed and TrustLayer picked a winner
--                    (by declared system-of-record, corroboration, or freshness).
--                    Reverting flips the answer to the value it had rejected,
--                    recorded as an explicit human override.
--
-- This table is BOTH the log AND the override store. A row with reverted_at set
-- is not just history — it is an instruction the retriever and the conflict
-- detector read on every question:
--   * a reverted merge       -> keep member_key OUT of its canonical group (split)
--   * a reverted arbitration -> force loser_canonical as the winner (override)
--   * a reverted classification -> the fact itself is superseded (see facts)
--
-- Materialization is idempotent: dedup_key is a stable natural key, so rebuilding
-- the log after a re-ingest never duplicates a decision and never clobbers a
-- revert a human already made.

create type decision_kind as enum ('merge', 'classification', 'arbitration');

create table if not exists decisions (
  id            uuid primary key default gen_random_uuid(),
  kind          decision_kind not null,

  -- Stable natural key so re-materializing is a no-op for existing decisions.
  dedup_key     text not null unique,

  -- Subject (what the decision is about). Which fields are set depends on kind.
  entity_key    text,               -- canonical entity key (merge, arbitration)
  entity_label  text,               -- display name for the entity
  attribute     text,               -- arbitration: canonical attribute label; classification: attribute

  -- merge specifics
  member_key    text,               -- the alias key that was folded in (revert splits THIS out)
  member_tool   source_tool,        -- which tool the alias came from
  member_raw    text,               -- the alias exactly as its source spells it

  -- classification specifics
  fact_id       uuid references facts(id),
  classified_as text,               -- the fact_type the model assigned
  source_tool   source_tool,        -- the tool the classified line came from
  source_doc    text,               -- the document it came from
  source_quote  text,               -- the exact line (the "why")

  -- arbitration specifics
  winner_value      text,           -- the value TrustLayer chose (display)
  winner_canonical  text,
  loser_value       text,           -- the value it rejected (display) — revert flips to this
  loser_canonical   text,
  basis             text,           -- 'declaration' | 'corroboration' | 'freshness'

  -- common
  why           text not null,      -- one plain-English sentence
  created_at    timestamptz not null default now(),

  -- Revert state. NULL == the automatic decision stands. Non-NULL == a human
  -- overrode it, and that override is IN EFFECT (read by retrieve + detect).
  reverted_at   timestamptz,
  reverted_by   text
);

-- The common reads.
create index if not exists decisions_kind_idx on decisions (kind);
create index if not exists decisions_active_override_idx
  on decisions (kind) where reverted_at is not null;
create index if not exists decisions_entity_idx on decisions (entity_key);

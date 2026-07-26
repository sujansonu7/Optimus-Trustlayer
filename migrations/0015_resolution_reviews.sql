-- 0015_resolution_reviews.sql
--
-- The /review queue's memory: a human verdict on one candidate entity pair.
--
-- The resolver (lib/conflicts/normalize.ts) is deliberately conservative — it
-- folds a name in only when it is an unambiguous prefix of exactly one canonical
-- account. That keeps precision at 1.00 (see the Gate-1 scoreboard) but leaves
-- real aliases unlinked: "SLG", "SLG-West", "silverlinelogistics.io". Those are
-- the pairs a human can settle, and this table is where those settlements live so
-- they survive every re-ingest and re-resolution.
--
--   verdict 'merge'    -> fold alias_key into canonical_key from now on
--   verdict 'separate' -> confirmed different; stop asking
--
-- Bitemporal note: this table is a small, editable policy surface (like
-- freshness_table), not a fact ledger — a changed verdict overwrites in place,
-- and `decided_at` records when. Nothing in the fact ledger is ever rewritten.

create table if not exists resolution_reviews (
  alias_key      text not null,
  canonical_key  text not null,
  verdict        text not null check (verdict in ('merge', 'separate')),
  decided_by     text not null default 'you',
  decided_at     timestamptz not null default now(),
  primary key (alias_key, canonical_key)
);

-- The resolver reads active merges on every request; keep that lookup cheap.
create index if not exists resolution_reviews_merge_idx
  on resolution_reviews (alias_key)
  where verdict = 'merge';

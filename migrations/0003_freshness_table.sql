-- 0003_freshness_table.sql
-- Freshness policy: for each (source x artifact type), how fast does the data
-- go stale, and how much does staleness hurt? This is what the conflict
-- arbitrator and the freshness badges read from.
--
-- This is POLICY, not a fact — it is edited in place on the /settings page
-- (unlike facts/declarations, which are append-only). One current row per
-- (source, artifact_type).

-- How quickly this kind of data changes.
create type volatility_class as enum ('live', 'days', 'months', 'stable');

-- How badly it hurts to answer from stale data of this kind.
create type staleness_tier as enum ('critical', 'high', 'low');

create table freshness_table (
  id             uuid primary key default gen_random_uuid(),

  source         text not null,               -- e.g. 'Renewals Sheet', 'CRM'
  artifact_type  text not null,               -- e.g. 'renewal dates', 'deal stage'
  volatility     volatility_class not null,   -- how fast it changes
  staleness_tier staleness_tier not null,     -- cost of being wrong/old
  notes          text,                        -- plain-English rationale

  updated_at     timestamptz not null default now(),

  unique (source, artifact_type)
);

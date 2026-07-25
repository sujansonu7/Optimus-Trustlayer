-- 0004_entities.sql
-- Entity resolution: the same real-world thing (an account, a person) shows up
-- under different names across CRM, spreadsheet, email and calls. An `entity`
-- is one resolved identity; its `entity_members` are the individual source
-- records that were judged to be the same thing.
--
-- Each group carries a status (auto = machine-confident, review = needs a
-- human, rejected = a bad merge to keep from being re-proposed) and a
-- plain-English explanation of why these records were grouped.

-- Whether a resolved group is trusted, pending human review, or rejected.
create type entity_status as enum ('auto', 'review', 'rejected');

create table entities (
  id             uuid primary key default gen_random_uuid(),

  canonical_name text not null,               -- the name we show for the group
  entity_type    text,                        -- e.g. 'account', 'person', 'deal'
  status         entity_status not null default 'review',
  explanation    text,                        -- plain-English "why these are one thing"

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table entity_members (
  id           uuid primary key default gen_random_uuid(),

  entity_id    uuid not null references entities(id) on delete cascade,
  source_tool  source_tool not null,          -- which tool this record lives in
  source_id    text,                          -- its id/key in that tool (if any)
  raw_name     text not null,                 -- the name exactly as that source spells it

  added_at     timestamptz not null default now(),

  -- The same source record can only belong to a group once.
  unique (entity_id, source_tool, source_id)
);

create index entity_members_entity_idx on entity_members (entity_id);
create index entities_status_idx on entities (status);

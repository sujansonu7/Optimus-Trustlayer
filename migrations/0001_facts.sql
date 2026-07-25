-- 0001_facts.sql
-- The fact ledger: every atomic thing TrustLayer knows, with full provenance.
--
-- Bitemporal & append-only. We NEVER UPDATE a value and NEVER DELETE a row.
-- To change what we believe, we INSERT a new row and mark the old one
-- superseded (set superseded_at + superseded_by). This preserves the full
-- history of what we knew and when we knew it — the core TrustLayer promise.
--
-- Two time axes:
--   * valid time      (valid_from / valid_to) — when the fact is true in the
--                       real world, per the source.
--   * transaction time (recorded_at / superseded_at) — when TrustLayer held
--                       this belief. superseded_at IS NULL == currently believed.

-- The four source tools TrustLayer ingests from.
create type source_tool as enum ('crm', 'spreadsheet', 'email', 'calls');

create table facts (
  id                    uuid primary key default gen_random_uuid(),

  -- What the fact is about.
  entity_ref            text not null,          -- which entity this is about (see entities.id or a raw key)
  attribute             text not null,          -- e.g. 'renewal_date', 'owner', 'deal_stage'
  value                 text not null,          -- the value as a plain string
  value_json            jsonb,                  -- optional structured form of the same value

  -- Provenance — every stored fact carries this (standing rule #4).
  source_tool           source_tool not null,   -- which of the four tools it came from
  source_doc            text not null,          -- the specific document/record it came from
  doc_timestamp         timestamptz,            -- when that source document is dated
  extraction_timestamp  timestamptz not null default now(), -- when we pulled it out
  content_hash          text not null,          -- hash of the exact source passage (dedup + audit)

  -- Valid time — when this fact is true in the world.
  valid_from            timestamptz not null default now(),
  valid_to              timestamptz,            -- NULL == still valid

  -- Transaction time — when TrustLayer believed it.
  recorded_at           timestamptz not null default now(),
  superseded_at         timestamptz,            -- NULL == currently believed
  superseded_by         uuid references facts(id) -- the row that replaced this one
);

-- Look up everything currently known about an entity attribute.
create index facts_entity_attr_idx on facts (entity_ref, attribute);

-- Fast path for "what do we believe right now" (the common query).
create index facts_current_idx on facts (entity_ref, attribute)
  where superseded_at is null;

-- Dedup / audit by the exact source passage.
create index facts_content_hash_idx on facts (content_hash);

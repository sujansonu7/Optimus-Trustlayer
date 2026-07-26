-- 0013_crew.sql
-- /crew — the delegation layer: one brain-dump in, several outcome-shaped
-- workstreams out, each dispatched to the visible agent as a governed brief.
--
-- Like agent_sessions (0012), crew_runs + crew_workstreams are the WORK LAYER,
-- not knowledge. A run records a brain-dump the owner typed, the workstreams it
-- was split into, the brief assembled for each (from the graph, envelope-carrying),
-- and where each landed on the ledger. Deleting all of it changes nothing about
-- what TrustLayer knows: the facts, declarations, and conflicts are untouched.
--
-- A completed workstream's brief FILES BACK into the graph as a fact (see
-- lib/crew/fileback.ts) tagged with the new 'work_product' source below — so a
-- delivered brief becomes citable knowledge, with full provenance, exactly like
-- any ingested fact. That fact is append-only and carries the same envelope
-- discipline as everything else in the ledger.

-- A fifth provenance source: work TrustLayer itself produced. It is NOT one of
-- the four connectable ingestion tools (it never appears in the source pills or
-- the connection toggles, and the graph export/arbitration read only connected
-- tools) — it is a distinct provenance tag for facts the work layer files back.
-- Added as an enum value only; never used inside this same migration/transaction.
alter type source_tool add value if not exists 'work_product';

-- One brain-dump the owner delegated. Disposable work state.
create table if not exists crew_runs (
  id            uuid primary key default gen_random_uuid(),
  brain_dump    text not null,                        -- the messy, verbatim request
  status        text not null default 'triaged',      -- 'triaged' | 'dispatching' | 'done'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One outcome-shaped workstream carved out of a brain-dump. This row IS a card on
-- the ledger board (its status is the column). It carries the assembled brief
-- (the product), where the agent run landed, and the one-tap brief-quality signal.
create table if not exists crew_workstreams (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references crew_runs(id) on delete cascade,
  seq               integer not null,                 -- order within the run (0-based)
  title             text not null,                    -- short outcome label
  goal              text not null,                    -- what "done" looks like, one sentence
  kind              text not null default 'workstream', -- 'workstream' | 'inline'
  inline_answer     text,                             -- set only for trivial 'inline' items
  constraints_json  jsonb not null default '[]'::jsonb, -- plain-English constraints
  done_criteria_json jsonb not null default '[]'::jsonb, -- done-criteria checklist
  depends_on        jsonb not null default '[]'::jsonb, -- seqs this workstream waits on
  brief_json        jsonb,                            -- the assembled, envelope-carrying brief
  status            text not null default 'queued',   -- queued|running|needs_input|review|done|inline
  session_id        uuid references agent_sessions(id) on delete set null,
  work_product_id   uuid references work_products(id) on delete set null,
  quality           text,                             -- null | 'no_correction' | 'correction'
  error             text,                             -- populated only on a failed dispatch
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  dispatched_at     timestamptz,
  finished_at       timestamptz,
  unique (run_id, seq)
);

create index if not exists crew_workstreams_run_idx
  on crew_workstreams (run_id, seq);

-- Singleton settings row for the work layer. The Parallel toggle lives here:
-- OFF by default, capped at 2 concurrent, and only meant to be turned on once
-- brief quality is proven (see /admin). The CHECK pins it to exactly one row.
create table if not exists crew_settings (
  id                boolean primary key default true check (id),
  parallel_enabled  boolean not null default false,
  updated_at        timestamptz not null default now()
);

insert into crew_settings (id, parallel_enabled) values (true, false)
  on conflict (id) do nothing;

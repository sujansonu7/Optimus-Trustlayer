-- 0012_agent_sessions.sql
-- The agent's disposable run state — and the Library of work products it saves.
--
-- CORE INVARIANT (standing rule #5): the agent engine holds NO durable knowledge.
-- All knowledge lives in the fact ledger, declarations, and derived conflicts.
-- The two tables below (agent_sessions, agent_steps) are pure run logs: what the
-- agent did, step by step, so a human can watch the work. They are SAFE TO WIPE.
-- Deleting every row here changes nothing about what TrustLayer knows — the agent
-- re-reads everything from Postgres on its next run.
--
-- work_products is the /library: the formatted briefs the agent delivers. A brief
-- points back at the session that produced it, but the FK is ON DELETE SET NULL,
-- so clearing the session logs never removes a delivered deliverable. The brief's
-- claims cite the fact ledger (by content hash) — the citations survive because
-- the FACTS survive, not because the session does.

-- One agent run. Disposable.
create table if not exists agent_sessions (
  id            uuid primary key default gen_random_uuid(),
  question      text not null,                       -- the request that started it
  mode          text not null default 'work',        -- 'work' | 'simple'
  status        text not null default 'running',     -- 'running' | 'done' | 'error'
  error         text,                                -- populated only on failure
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- One visible step within a run: a thought, a tool call, a tool result, or the
-- final answer. Ordered by seq. Cascades away with its session.
create table if not exists agent_steps (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references agent_sessions(id) on delete cascade,
  seq           integer not null,
  kind          text not null,          -- 'thought'|'tool_call'|'tool_result'|'final'|'error'
  tool_name     text,                   -- set on tool_call / tool_result
  input_json    jsonb,                  -- the tool inputs (tool_call) — visible work
  summary       text,                   -- human-readable one-liner shown on screen
  created_at    timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists agent_steps_session_idx
  on agent_steps (session_id, seq);

-- The Library: saved work products (formatted, enveloped briefs). Survives the
-- deletion of the session that made it (session_id -> null), because a delivered
-- brief is a product artifact, not agent run state.
create table if not exists work_products (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references agent_sessions(id) on delete set null,
  title         text not null,
  entity        text,                   -- the account the brief is about, if any
  request       text not null,          -- the original request that produced it
  body_json     jsonb not null,         -- the full WorkProduct envelope (claims + evidence)
  created_at    timestamptz not null default now()
);

create index if not exists work_products_created_idx
  on work_products (created_at desc);

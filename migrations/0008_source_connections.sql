-- 0008_source_connections.sql
-- Per-source connection state for the four tools TrustLayer ingests from.
--
-- This is the switch behind the /admin "Disconnect" toggles and DEMO_SCRIPT
-- Beat 6 ("revoke a source live; the answer recomputes"). It is POLICY (a live
-- switch a human flips), not a fact, so it is edited in place — one current row
-- per source tool.
--
-- When a source is DISCONNECTED, the Ask retrieval step must not SELECT any of
-- its facts. That is the whole guarantee: the disconnected source's content
-- becomes structurally unreachable, so no trace of it can survive into a
-- recomputed answer. Reconnecting simply lets its facts be seen again.

create table if not exists source_connections (
  source_tool  source_tool primary key,   -- one row per tool: crm | spreadsheet | email | calls
  connected    boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- All four tools start connected. Safe to re-run.
insert into source_connections (source_tool, connected) values
  ('crm', true),
  ('spreadsheet', true),
  ('email', true),
  ('calls', true)
on conflict (source_tool) do nothing;

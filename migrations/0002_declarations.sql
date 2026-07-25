-- 0002_declarations.sql
-- Declarations: canon-shaped statements a human makes about how the world of
-- record works, e.g. "the Renewals Sheet is the system of record for renewal
-- dates." These are the raw material of the governed canon.
--
-- Same bitemporal, append-only discipline as facts: a declaration is never
-- edited in place. Editing supersedes (insert new + mark old superseded), so
-- the authorship trail survives. Each declaration already carries author,
-- evidence, scope and status, so it can later be *ratified* into a team canon
-- without re-entering anything.

-- Lifecycle of a declaration on its way to becoming canon.
create type declaration_status as enum ('proposed', 'ratified', 'rejected', 'superseded');

create table declarations (
  id             uuid primary key default gen_random_uuid(),

  statement      text not null,               -- the plain-English claim
  scope          text,                        -- what it governs, e.g. 'renewal dates'
  author         text not null,               -- who declared it
  evidence_link  text,                        -- URL / pointer backing the claim
  status         declaration_status not null default 'proposed',

  -- Ratification into team canon (filled when status -> 'ratified').
  ratified_at    timestamptz,
  ratified_by    text,

  -- Valid time — when this declaration is in force in the world.
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,                 -- NULL == still in force

  -- Transaction time — when TrustLayer held this declaration.
  recorded_at    timestamptz not null default now(),
  superseded_at  timestamptz,                 -- NULL == current version
  superseded_by  uuid references declarations(id)
);

-- The common query: current declarations, optionally by scope.
create index declarations_current_idx on declarations (scope)
  where superseded_at is null;

create index declarations_status_idx on declarations (status)
  where superseded_at is null;

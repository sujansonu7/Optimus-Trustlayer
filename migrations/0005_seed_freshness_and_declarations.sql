-- 0005_seed_freshness_and_declarations.sql
-- Sensible starting defaults so /settings is pre-filled on day one.
-- Written to be safe to re-run (idempotent).

-- Freshness defaults: (source x artifact type) -> how fast it moves + how much
-- staleness hurts. These are the demo's opinionated starting points.
insert into freshness_table (source, artifact_type, volatility, staleness_tier, notes) values
  ('Renewals Sheet', 'renewal dates',        'days',   'critical', 'RevOps edits this weekly; a wrong renewal date can miss a renewal.'),
  ('CRM',            'ownership',             'months', 'high',     'Account owner changes occasionally; wrong owner misroutes work.'),
  ('CRM',            'deal stage',            'days',   'high',     'Stages move through a quarter; stale stage skews the forecast.'),
  ('CRM',            'account name',          'stable', 'low',      'Legal name rarely changes; low blast radius if slightly stale.'),
  ('Email',          'commitments',           'live',  'high',     'Promises made in email are current the moment they are sent.'),
  ('Calls',          'commitments',           'live',  'high',     'Verbal commitments on calls are only as good as the latest call.'),
  ('Billing',        'line items',            'months', 'high',     'Invoices are periodic; wrong amounts create revenue disputes.')
on conflict (source, artifact_type) do nothing;

-- Pre-filled declarations (the two systems-of-record from the standing brief).
-- Seeded as 'proposed' so the ratify-into-canon flow is demonstrable.
insert into declarations (statement, scope, author, status)
select 'The Renewals Sheet is the system of record for renewal dates.',
       'renewal dates', 'seed', 'proposed'
where not exists (
  select 1 from declarations
  where scope = 'renewal dates' and superseded_at is null
);

insert into declarations (statement, scope, author, status)
select 'The CRM is the system of record for ownership and deal stage.',
       'ownership and deal stage', 'seed', 'proposed'
where not exists (
  select 1 from declarations
  where scope = 'ownership and deal stage' and superseded_at is null
);

-- 0014_seed_freshness_for_all_conflict_attributes.sql
--
-- /conflicts derives each card's severity ("cost of being wrong") from the
-- freshness table's staleness tier. Five attributes can produce a conflict —
-- renewal date, ARR, owner, account status, tier — but 0005 only seeded rows
-- covering renewal dates and ownership, so the other three had no policy row to
-- read and silently fell back to a hardcoded default.
--
-- Seed the missing three so every conflict attribute is governed by an editable
-- row on /settings, which is what "severity = cost-of-staleness tier" means.
-- Values match the defaults that were previously hardcoded in
-- lib/conflicts/detect.ts, so this changes no behaviour on a fresh database.
-- Idempotent.

insert into freshness_table (source, artifact_type, volatility, staleness_tier, notes) values
  ('CRM', 'ARR',            'months', 'high', 'Contract value changes at renewal; a wrong number misprices the account.'),
  ('CRM', 'account status', 'days',   'high', 'Active vs churned drives everything downstream; being wrong here is embarrassing.'),
  ('CRM', 'tier',           'stable', 'low',  'Tier rarely moves and little depends on it directly.')
on conflict (source, artifact_type) do nothing;

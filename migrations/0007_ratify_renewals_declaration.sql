-- 0007_ratify_renewals_declaration.sql
-- Make the renewal-dates system-of-record declaration ACTUALLY govern.
--
-- The conflict arbitrator only lets a declaration override freshness once a
-- human has RATIFIED it into team canon (proposed declarations are opinions,
-- not yet the law of the land). The seed (0005) inserts the renewals SoR as
-- 'proposed'; ratifying it here is what makes Cobalt Ridge's renewal date
-- resolve to the Renewals Sheet by rule rather than by freshness alone.
--
-- We deliberately leave the *ownership* declaration 'proposed'. That is why the
-- Thornbury owner conflict resolves to the corroborated field value
-- (Sara Lindqvist across the sheet + the handoff email) instead of the stale
-- CRM value — a live demonstration that ratifying a declaration changes the
-- answer. Ratify ownership later from /settings to watch it flip.
--
-- Idempotent: only touches a still-proposed, current renewals declaration.

update declarations
   set status      = 'ratified',
       ratified_at = now(),
       ratified_by = 'seed'
 where scope = 'renewal dates'
   and status = 'proposed'
   and superseded_at is null;

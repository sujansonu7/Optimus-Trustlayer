// Server-only: reset the demo to a clean, pre-build state so /onboarding can be
// run again — live, in front of an audience — from scratch.
//
// This wipes only DERIVED data (everything the build produces): the fact ledger,
// the per-file ingest cache, the belief cache, the resolved-entity tables, and
// the decision log. It then restores the two seed declarations and reconnects
// all four sources, so the app is exactly where migration 0005/0007/0008 leave a
// fresh install — ready to ingest again.
//
// It NEVER drops tables and NEVER touches the fixture files or the freshness
// policy. Nothing here is irreversible at the schema level: re-running the build
// reconstructs every wiped row from the source documents.
import { getPool } from "@/lib/db";

export type ResetResult = {
  cleared: string[]; // human labels of what was wiped
};

export async function resetDemo(): Promise<ResetResult> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    // Wipe derived data. One TRUNCATE with CASCADE handles the FK graph
    // (decisions.fact_id -> facts, entity_members -> entities) in any order.
    await client.query(
      `truncate table facts, ingested_sources, answer_cache,
                      entities, entity_members, decisions
       restart identity cascade`
    );

    // Restore the canon to its seeded starting point (0005 + 0007): the renewals
    // system-of-record ratified, ownership left proposed. Delete-then-reseed so a
    // wizard-added declaration from a previous run doesn't linger.
    await client.query(`truncate table declarations restart identity cascade`);
    await client.query(
      `insert into declarations (statement, scope, author, status, ratified_at, ratified_by)
       values
         ('The Renewals Sheet is the system of record for renewal dates.',
          'renewal dates', 'seed', 'ratified', now(), 'seed'),
         ('The CRM is the system of record for ownership and deal stage.',
          'ownership and deal stage', 'seed', 'proposed', null, null)`
    );

    // Reconnect every source (undo any Beat-6 revocations from a prior run).
    await client.query(
      `update source_connections set connected = true, updated_at = now()`
    );

    await client.query("commit");
    return {
      cleared: [
        "fact ledger",
        "ingest cache",
        "belief cache",
        "resolved entities",
        "decision log",
      ],
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

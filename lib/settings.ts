import { getPool, query } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type DeclarationStatus = "proposed" | "ratified" | "rejected" | "superseded";

export type Declaration = {
  id: string;
  statement: string;
  scope: string | null;
  author: string | null;
  evidence_link: string | null;
  status: DeclarationStatus;
  ratified_at: string | null;
  ratified_by: string | null;
  recorded_at: string;
};

export type VolatilityClass = "live" | "days" | "months" | "stable";
export type StalenessTier = "critical" | "high" | "low";

export type FreshnessRow = {
  id: string;
  source: string;
  artifact_type: string;
  volatility: VolatilityClass;
  staleness_tier: StalenessTier;
  notes: string | null;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

/** Current (not-superseded) declarations, newest first. */
export async function loadDeclarations(): Promise<Declaration[]> {
  const { rows } = await query<Declaration>(
    `select id, statement, scope, author, evidence_link, status,
            ratified_at, ratified_by, recorded_at
       from declarations
      where superseded_at is null
      order by recorded_at desc`
  );
  return rows;
}

/** Freshness policy rows, grouped sensibly for display. */
export async function loadFreshness(): Promise<FreshnessRow[]> {
  const { rows } = await query<FreshnessRow>(
    `select id, source, artifact_type, volatility, staleness_tier, notes, updated_at
       from freshness_table
      order by source, artifact_type`
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Edit a declaration by SUPERSEDING it — never in place. We insert a new
 * current row carrying the edits and mark the old row superseded, pointing it
 * at its replacement. This keeps the full authorship/history trail intact
 * (standing rule #4), and returns the id of the new current row.
 */
export async function supersedeDeclaration(
  id: string,
  fields: {
    statement: string;
    scope: string | null;
    author: string | null;
    evidence_link: string | null;
    status: DeclarationStatus;
  }
): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const prev = await client.query(
      `select id from declarations where id = $1 and superseded_at is null for update`,
      [id]
    );
    if (prev.rowCount === 0) {
      throw new Error("Declaration not found or already superseded.");
    }

    const ratifying = fields.status === "ratified";
    const inserted = await client.query<{ id: string }>(
      `insert into declarations
         (statement, scope, author, evidence_link, status, ratified_at, ratified_by)
       values ($1, $2, $3, $4, $5,
               case when $5 = 'ratified' then now() else null end,
               case when $5 = 'ratified' then $3 else null end)
       returning id`,
      [
        fields.statement,
        fields.scope,
        fields.author,
        fields.evidence_link,
        fields.status,
      ]
    );
    const newId = inserted.rows[0].id;

    await client.query(
      `update declarations
          set superseded_at = now(), superseded_by = $2
        where id = $1`,
      [id, newId]
    );

    await client.query("commit");
    void ratifying;
    return newId;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Add a brand-new declaration (proposed by default). */
export async function addDeclaration(fields: {
  statement: string;
  scope: string | null;
  author: string | null;
  evidence_link: string | null;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `insert into declarations (statement, scope, author, evidence_link, status)
       values ($1, $2, $3, $4, 'proposed')
     returning id`,
    [fields.statement, fields.scope, fields.author, fields.evidence_link]
  );
  return rows[0].id;
}

/**
 * Freshness rows are POLICY, not facts, so they are edited in place (updated_at
 * bumped). One current row per (source, artifact_type).
 */
export async function updateFreshness(
  id: string,
  fields: { volatility: VolatilityClass; staleness_tier: StalenessTier; notes: string | null }
): Promise<void> {
  await query(
    `update freshness_table
        set volatility = $2, staleness_tier = $3, notes = $4, updated_at = now()
      where id = $1`,
    [id, fields.volatility, fields.staleness_tier, fields.notes]
  );
}

// Server-only: the pieces of the /onboarding flow that touch the database.
//
//   verifySheet()               — the Renewals Sheet "connects for real": we hit
//                                 Google live and report whether it answered.
//   SUGGESTED_DECLARATIONS      — the pre-filled defaults the wizard offers.
//   writeDeclarations(choices)  — write those choices as REAL declarations.
//   proofQuestions()            — mine the just-built graph for cross-source
//                                 joins and detected conflicts, then VERIFY each
//                                 is answerable (via retrieval, no model call)
//                                 before offering it. Every proof is a question
//                                 the graph can actually answer live.
import { getPool, query } from "@/lib/db";
import { loadRenewals } from "@/lib/renewals";
import { detectConflicts } from "@/lib/conflicts/detect";
import { entityKey, makeResolver, type CanonicalAttribute } from "@/lib/conflicts/normalize";
import { connectedTools } from "@/lib/ask/sources";
import { retrieve } from "@/lib/ask/retrieve";
import { SOURCE_LABEL, type SourceTool } from "@/lib/ask/types";

/* ------------------------------------------------------------------ */
/* Sheet — the one source that connects for real                      */
/* ------------------------------------------------------------------ */

export type SheetStatus = {
  live: boolean; // true == the live Google Sheet answered
  lastModified: string | null;
  rowCount: number;
  note?: string;
};

export async function verifySheet(): Promise<SheetStatus> {
  const r = await loadRenewals();
  return {
    live: r.source === "live",
    lastModified: r.lastModified,
    rowCount: r.table.rows.length,
    note: r.note,
  };
}

/* ------------------------------------------------------------------ */
/* Declaration wizard                                                 */
/* ------------------------------------------------------------------ */

export type SuggestedDeclaration = {
  scope: string;
  statement: string;
  sourceLabel: string;
  why: string;
  defaultRatify: boolean;
};

// The defaults the wizard pre-selects. Renewals is ratified by default (it is
// the demo's whole kill-shot); ownership is offered but left as a proposal so
// the corroboration path stays demonstrable — the owner can ratify it later.
export const SUGGESTED_DECLARATIONS: SuggestedDeclaration[] = [
  {
    scope: "renewal dates",
    statement: "The Renewals Sheet is the system of record for renewal dates.",
    sourceLabel: "the Renewals Sheet",
    why: "When the CRM and the Sheet disagree on a renewal date, trust the Sheet — RevOps edits it weekly, so it's the freshest and the agreed source of truth.",
    defaultRatify: true,
  },
  {
    scope: "ownership and deal stage",
    statement: "The CRM is the system of record for ownership and deal stage.",
    sourceLabel: "the CRM",
    why: "The CRM is where reps update who owns an account and where each deal sits. Ratify this to make the CRM win ownership disagreements outright.",
    defaultRatify: false,
  },
];

export type DeclarationChoice = { scope: string; statement: string; ratify: boolean };

/**
 * Write the wizard's choices as REAL declarations, one current row per scope.
 * If a current declaration already exists for a scope (e.g. the seed), it is
 * superseded — append-only, so the authorship trail survives. Returns a count.
 */
export async function writeDeclarations(
  choices: DeclarationChoice[]
): Promise<{ written: number }> {
  const client = await getPool().connect();
  let written = 0;
  try {
    await client.query("begin");
    for (const c of choices) {
      const status = c.ratify ? "ratified" : "proposed";
      const existing = await client.query<{ id: string; status: string }>(
        `select id, status from declarations
          where scope = $1 and superseded_at is null
          order by recorded_at desc limit 1`,
        [c.scope]
      );

      const cur = existing.rows[0];
      if (cur && cur.status === status) continue; // already in the desired state

      const inserted = await client.query<{ id: string }>(
        `insert into declarations
           (statement, scope, author, status, ratified_at, ratified_by)
         values ($1, $2, 'onboarding', $3,
                 case when $3 = 'ratified' then now() else null end,
                 case when $3 = 'ratified' then 'onboarding' else null end)
         returning id`,
        [c.statement, c.scope, status]
      );

      if (cur) {
        await client.query(
          `update declarations set superseded_at = now(), superseded_by = $2 where id = $1`,
          [cur.id, inserted.rows[0].id]
        );
      }
      written++;
    }
    await client.query("commit");
    return { written };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/* Proof questions — mined from the graph, then verified answerable    */
/* ------------------------------------------------------------------ */

export type ProofQuestion = {
  question: string;
  kind: "conflict" | "recall";
  headline: string; // short label of what it proves
  why: string; // one plain-English line
};

const ATTR_QUESTION: Record<CanonicalAttribute, (entity: string) => string> = {
  renewal_date: (e) => `When does ${e} renew?`,
  owner: (e) => `Who owns the ${e} account?`,
  status: (e) => `Is ${e} still an active customer?`,
  arr: (e) => `What is ${e}'s ARR?`,
  tier: (e) => `What tier is ${e}?`,
};

/** Verify a candidate is actually answerable from the connected graph — using
 *  retrieval only (no model call), so onboarding stays fast and free. */
async function isAnswerable(question: string, connected: SourceTool[]): Promise<boolean> {
  try {
    const r = await retrieve(question, connected);
    return r.matchedEntities.length > 0 && r.evidence.length > 0;
  } catch {
    return false;
  }
}

export async function proofQuestions(): Promise<ProofQuestion[]> {
  const connected = await connectedTools();
  if (connected.length === 0) return [];

  const out: ProofQuestion[] = [];
  const usedEntities = new Set<string>();

  /* --- Conflict proofs: real cross-source disagreements ------------- */
  const report = await detectConflicts();
  for (const c of report.conflicts) {
    if (out.length >= 3) break;
    const make = ATTR_QUESTION[c.attribute];
    if (!make) continue;
    const q = make(c.entityLabel);
    if (usedEntities.has(c.entityLabel.toLowerCase())) continue;
    if (!(await isAnswerable(q, connected))) continue;

    const basisWord =
      c.ruleBasis === "declaration"
        ? "your declared system of record"
        : c.ruleBasis === "corroboration"
        ? "corroboration across sources"
        : c.ruleBasis === "override"
        ? "your manual override"
        : "freshness";
    out.push({
      question: q,
      kind: "conflict",
      headline: "Two sources disagree",
      why: `Sources disagree on ${c.entityLabel}'s ${c.attributeLabel}. Watch it pick ${c.winnerDisplay} by ${basisWord} — and show both sides.`,
    });
    usedEntities.add(c.entityLabel.toLowerCase());
  }

  /* --- Recall proof: a commitment buried in email/calls ------------- */
  if (out.length < 3) {
    const recall = await recallProof(connected, usedEntities);
    if (recall) out.push(recall);
  }

  /* --- Backfill with more conflicts if recall wasn't available ------ */
  if (out.length < 3) {
    for (const c of report.conflicts) {
      if (out.length >= 3) break;
      const make = ATTR_QUESTION[c.attribute];
      if (!make) continue;
      const q = make(c.entityLabel);
      if (out.some((o) => o.question === q)) continue;
      if (!(await isAnswerable(q, connected))) continue;
      out.push({
        question: q,
        kind: "conflict",
        headline: "Cross-source answer",
        why: `Resolved ${c.entityLabel}'s ${c.attributeLabel} to ${c.winnerDisplay}, with every source shown.`,
      });
    }
  }

  return out.slice(0, 3);
}

/** Find an account whose facts include a commitment from email/calls that
 *  joins the structured record — the "buried discount" cross-source recall. */
async function recallProof(
  connected: SourceTool[],
  usedEntities: Set<string>
): Promise<ProofQuestion | null> {
  const commitTools = (["email", "calls"] as SourceTool[]).filter((t) => connected.includes(t));
  if (commitTools.length === 0) return null;

  // Canonical account universe from connected CRM + spreadsheet.
  const { rows: canonRows } = await query<{ entity_ref: string }>(
    `select distinct entity_ref from facts
      where superseded_at is null and source_tool in ('crm','spreadsheet')`
  );
  const canonicalKeys = new Set(canonRows.map((r) => entityKey(r.entity_ref)));
  const resolve = makeResolver(canonicalKeys);

  // A readable label per canonical key (longest structured name).
  const labelByKey = new Map<string, string>();
  for (const r of canonRows) {
    const k = entityKey(r.entity_ref);
    const prev = labelByKey.get(k);
    if (!prev || r.entity_ref.length > prev.length) labelByKey.set(k, r.entity_ref);
  }

  const { rows: commits } = await query<{ entity_ref: string; source_tool: SourceTool }>(
    `select entity_ref, source_tool from facts
      where superseded_at is null
        and source_tool = any($1::source_tool[])
        and (fact_type = 'commitment'
             or attribute ilike '%discount%'
             or value ilike '%discount%')
      order by source_tool`,
    [commitTools]
  );

  for (const c of commits) {
    const gk = resolve(entityKey(c.entity_ref));
    const label = labelByKey.get(gk);
    if (!label) continue; // the commitment doesn't join a known account
    if (usedEntities.has(label.toLowerCase())) continue;
    const q = `Is there anything I should know before the ${label} renewal?`;
    if (!(await isAnswerable(q, connected))) continue;
    usedEntities.add(label.toLowerCase());
    return {
      question: q,
      kind: "recall",
      headline: "Buried commitment surfaced",
      why: `A commitment in ${SOURCE_LABEL[c.source_tool]} that never reached the CRM or the Sheet — recalled and cited before the renewal.`,
    };
  }
  return null;
}

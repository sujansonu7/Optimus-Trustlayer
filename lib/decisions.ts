// Server-only: the decision log — materialize, read, revert, restore.
//
// TrustLayer makes three kinds of AUTOMATIC decision while building the graph.
// This module records each one (with its plain-English "why"), lets a human
// REVERT it, and — for merges and arbitrations — turns the reverted row into a
// standing override that lib/overrides.ts feeds back into retrieval + conflict
// detection, so dependent answers recompute.
//
//   merge          — alias names folded into one identity. Revert splits the
//                    alias back out (lib/overrides.splitKeys) and its facts stop
//                    joining the account.
//   classification — an email/call line the model typed as a fact. Revert
//                    supersedes that exact fact so it stops informing answers.
//   arbitration    — a source disagreement TrustLayer settled. Revert flips the
//                    answer to the rejected value (lib/overrides.arbOverrides).
//
// Materialization is idempotent: every decision has a stable dedup_key and is
// inserted ON CONFLICT DO NOTHING, so rebuilding after a re-ingest never
// duplicates a decision and never erases a revert a human already made.
import { getPool, query } from "@/lib/db";
import {
  entityKey,
  makeResolver,
  ATTR_LABEL,
  type CanonicalAttribute,
} from "@/lib/conflicts/normalize";
import { detectConflicts } from "@/lib/conflicts/detect";
import { SOURCE_LABEL, type SourceTool } from "@/lib/ask/types";

export type DecisionKind = "merge" | "classification" | "arbitration";

export type DecisionRow = {
  id: string;
  kind: DecisionKind;
  entity_key: string | null;
  entity_label: string | null;
  attribute: string | null;
  member_key: string | null;
  member_tool: SourceTool | null;
  member_raw: string | null;
  fact_id: string | null;
  classified_as: string | null;
  source_tool: SourceTool | null;
  source_doc: string | null;
  source_quote: string | null;
  winner_value: string | null;
  winner_canonical: string | null;
  loser_value: string | null;
  loser_canonical: string | null;
  basis: string | null;
  why: string;
  created_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
};

/* ------------------------------------------------------------------ */
/* Materialization                                                    */
/* ------------------------------------------------------------------ */

type FactRow = {
  id: string;
  entity_ref: string;
  attribute: string;
  value: string;
  source_tool: SourceTool;
  source_doc: string;
  source_quote: string | null;
  fact_type: string | null;
};

type PendingDecision = {
  kind: DecisionKind;
  dedup_key: string;
  entity_key?: string | null;
  entity_label?: string | null;
  attribute?: string | null;
  member_key?: string | null;
  member_tool?: SourceTool | null;
  member_raw?: string | null;
  fact_id?: string | null;
  classified_as?: string | null;
  source_tool?: SourceTool | null;
  source_doc?: string | null;
  source_quote?: string | null;
  winner_value?: string | null;
  winner_canonical?: string | null;
  loser_value?: string | null;
  loser_canonical?: string | null;
  basis?: string | null;
  why: string;
};

function sourceList(tools: SourceTool[]): string {
  const labels = Array.from(new Set(tools.map((t) => SOURCE_LABEL[t])));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * (Re)build the decision log from the current fact ledger. Safe to call any
 * number of times; existing decisions (including reverted ones) are preserved.
 * Returns how many NEW decisions were logged.
 */
export async function materializeDecisions(): Promise<{ logged: number; total: number }> {
  const { rows: facts } = await query<FactRow>(
    `select id, entity_ref, attribute, value, source_tool, source_doc,
            source_quote, fact_type
       from facts
      where superseded_at is null`
  );

  const pending: PendingDecision[] = [];

  /* --- Merges: alias names folded into a canonical account ---------- */
  // The CRM + spreadsheet names form the canonical universe; short names from
  // email/calls resolve INTO them (or stand alone). See makeResolver.
  const canonicalKeys = new Set<string>();
  for (const f of facts) {
    if (f.source_tool === "crm" || f.source_tool === "spreadsheet") {
      canonicalKeys.add(entityKey(f.entity_ref));
    }
  }
  const resolve = makeResolver(canonicalKeys);

  // Group raw names by resolved canonical key; track the tools each alias
  // appears in and the best display label for the group.
  type Group = { key: string; labels: Set<string>; aliasTools: Map<string, Set<SourceTool>> };
  const groups = new Map<string, Group>();
  for (const f of facts) {
    const rawKey = entityKey(f.entity_ref);
    const gk = resolve(rawKey);
    let g = groups.get(gk);
    if (!g) {
      g = { key: gk, labels: new Set(), aliasTools: new Map() };
      groups.set(gk, g);
    }
    g.labels.add(f.entity_ref);
    if (rawKey !== gk) {
      // A genuine alias fold (its own key differs from the canonical key).
      let t = g.aliasTools.get(rawKey);
      if (!t) {
        t = new Set();
        g.aliasTools.set(rawKey, t);
      }
      t.add(f.source_tool);
    }
  }

  for (const g of Array.from(groups.values())) {
    if (g.aliasTools.size === 0) continue;
    const label = Array.from(g.labels).sort((a, b) => b.length - a.length)[0];
    for (const [memberKey, tools] of Array.from(g.aliasTools.entries())) {
      // A representative raw spelling for this alias (the shortest label that
      // shares the alias key reads most like the nickname).
      const memberRaw =
        Array.from(g.labels)
          .filter((l) => entityKey(l) === memberKey)
          .sort((a, b) => a.length - b.length)[0] ?? memberKey;
      const toolList = Array.from(tools);
      pending.push({
        kind: "merge",
        dedup_key: `merge:${g.key}:${memberKey}`,
        entity_key: g.key,
        entity_label: label,
        member_key: memberKey,
        member_tool: toolList[0],
        member_raw: memberRaw,
        why:
          `“${memberRaw}” (from ${sourceList(toolList)}) was resolved into ${label} because its ` +
          `name is an unambiguous prefix of exactly one known account. Reverting splits it back out.`,
      });
    }
  }

  /* --- Classifications: model-typed lines from email/calls ---------- */
  for (const f of facts) {
    if (f.source_tool !== "email" && f.source_tool !== "calls") continue;
    if (!f.fact_type) continue;
    const gk = resolve(entityKey(f.entity_ref));
    pending.push({
      kind: "classification",
      dedup_key: `classification:${f.id}`,
      entity_key: gk,
      entity_label: f.entity_ref,
      attribute: f.attribute,
      fact_id: f.id,
      classified_as: f.fact_type,
      source_tool: f.source_tool,
      source_doc: f.source_doc,
      source_quote: f.source_quote,
      why:
        `Read as a ${f.fact_type} fact — ${f.attribute.replace(/_/g, " ")} = “${f.value}” — from ` +
        `${SOURCE_LABEL[f.source_tool]}. Reverting supersedes this fact so it stops informing answers.`,
    });
  }

  /* --- Arbitrations: settled source disagreements ------------------- */
  // Ask for the PRISTINE automatic decision (ignore any existing overrides), so
  // the logged winner/loser reflect what TrustLayer decided on its own.
  // Also deliberately UNFILTERED by connection state: the decision log is a
  // historical record of what was decided when the graph was built. Revoking a
  // source later does not un-make the decision that was taken.
  const report = await detectConflicts({ applyOverrides: false });
  for (const c of report.conflicts) {
    const winner = c.values.find((v) => v.isWinner) ?? c.values[0];
    const loser = c.values.find((v) => !v.isWinner);
    if (!loser) continue;
    pending.push({
      kind: "arbitration",
      dedup_key: `arbitration:${c.entityKey}::${c.attribute}`,
      entity_key: c.entityKey,
      entity_label: c.entityLabel,
      attribute: c.attribute, // canonical attribute key
      winner_value: winner.display,
      winner_canonical: winner.canonical,
      loser_value: loser.display,
      loser_canonical: loser.canonical,
      basis: c.ruleBasis,
      why: c.rule,
    });
  }

  /* --- Persist (idempotent) ---------------------------------------- */
  const client = await getPool().connect();
  let logged = 0;
  try {
    await client.query("begin");
    for (const d of pending) {
      const res = await client.query(
        `insert into decisions
           (kind, dedup_key, entity_key, entity_label, attribute,
            member_key, member_tool, member_raw,
            fact_id, classified_as, source_tool, source_doc, source_quote,
            winner_value, winner_canonical, loser_value, loser_canonical, basis, why)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         on conflict (dedup_key) do nothing`,
        [
          d.kind,
          d.dedup_key,
          d.entity_key ?? null,
          d.entity_label ?? null,
          d.attribute ?? null,
          d.member_key ?? null,
          d.member_tool ?? null,
          d.member_raw ?? null,
          d.fact_id ?? null,
          d.classified_as ?? null,
          d.source_tool ?? null,
          d.source_doc ?? null,
          d.source_quote ?? null,
          d.winner_value ?? null,
          d.winner_canonical ?? null,
          d.loser_value ?? null,
          d.loser_canonical ?? null,
          d.basis ?? null,
          d.why,
        ]
      );
      logged += res.rowCount ?? 0;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  const total = (await query<{ n: string }>(`select count(*)::text as n from decisions`)).rows[0];
  return { logged, total: Number(total.n) };
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export type DecisionView = DecisionRow & { attributeLabel: string | null };

/** All decisions, ordered for reading: merges + arbitrations (the interesting,
 *  revertable-with-visible-effect kinds) first, classifications after. */
export async function loadDecisions(): Promise<DecisionView[]> {
  const { rows } = await query<DecisionRow>(
    `select id, kind, entity_key, entity_label, attribute,
            member_key, member_tool, member_raw,
            fact_id, classified_as, source_tool, source_doc, source_quote,
            winner_value, winner_canonical, loser_value, loser_canonical, basis, why,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
            to_char(reverted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as reverted_at,
            reverted_by
       from decisions
      order by
        case kind when 'arbitration' then 0 when 'merge' then 1 else 2 end,
        entity_label nulls last, created_at`
  );
  return rows.map((r) => ({
    ...r,
    attributeLabel:
      r.kind === "arbitration" && r.attribute
        ? ATTR_LABEL[r.attribute as CanonicalAttribute] ?? r.attribute
        : null,
  }));
}

export async function decisionStats(): Promise<{
  total: number;
  reverted: number;
  byKind: Record<DecisionKind, number>;
} | null> {
  try {
    const { rows } = await query<{ kind: DecisionKind; n: string; rev: string }>(
      `select kind, count(*)::text as n,
              count(*) filter (where reverted_at is not null)::text as rev
         from decisions group by kind`
    );
    const byKind: Record<DecisionKind, number> = { merge: 0, classification: 0, arbitration: 0 };
    let total = 0;
    let reverted = 0;
    for (const r of rows) {
      byKind[r.kind] = Number(r.n);
      total += Number(r.n);
      reverted += Number(r.rev);
    }
    return { total, reverted, byKind };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Revert / Restore                                                   */
/* ------------------------------------------------------------------ */

/** Invalidate every live cached belief so dependent answers recompute against
 *  the new override state. Returns how many were invalidated. */
async function invalidateAllBeliefs(
  client: import("pg").PoolClient
): Promise<number> {
  const res = await client.query(
    `update answer_cache set invalidated_at = now() where invalidated_at is null`
  );
  return res.rowCount ?? 0;
}

/**
 * Revert an automatic decision. The effect depends on the kind:
 *   merge          — mark reverted; lib/overrides splits the alias back out.
 *   arbitration    — mark reverted; lib/overrides forces the rejected value.
 *   classification — supersede the underlying fact, then mark reverted.
 * In every case, all dependent cached answers are invalidated so the next ask
 * recomputes. Returns a short human summary of what changed.
 */
export async function revertDecision(
  id: string,
  by = "owner"
): Promise<{ ok: true; kind: DecisionKind; invalidated: number; summary: string }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<DecisionRow>(
      `select * from decisions where id = $1 for update`,
      [id]
    );
    const d = rows[0];
    if (!d) throw new Error("Decision not found.");
    if (d.reverted_at) throw new Error("This decision is already reverted.");

    if (d.kind === "classification" && d.fact_id) {
      await client.query(
        `update facts set superseded_at = now()
          where id = $1 and superseded_at is null`,
        [d.fact_id]
      );
    }

    await client.query(
      `update decisions set reverted_at = now(), reverted_by = $2 where id = $1`,
      [id, by]
    );

    const invalidated = await invalidateAllBeliefs(client);
    await client.query("commit");

    const summary =
      d.kind === "merge"
        ? `Split “${d.member_raw}” back out of ${d.entity_label}. ${invalidated} cached answer${invalidated === 1 ? "" : "s"} will recompute.`
        : d.kind === "arbitration"
        ? `Flipped ${d.entity_label}’s ${d.attribute} to ${d.loser_value}. ${invalidated} cached answer${invalidated === 1 ? "" : "s"} will recompute.`
        : `Dropped the ${d.classified_as} fact from ${d.entity_label}. ${invalidated} cached answer${invalidated === 1 ? "" : "s"} will recompute.`;

    return { ok: true, kind: d.kind, invalidated, summary };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Undo a revert — put the automatic decision back in force. */
export async function restoreDecision(
  id: string
): Promise<{ ok: true; kind: DecisionKind; invalidated: number; summary: string }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<DecisionRow>(
      `select * from decisions where id = $1 for update`,
      [id]
    );
    const d = rows[0];
    if (!d) throw new Error("Decision not found.");
    if (!d.reverted_at) throw new Error("This decision is not reverted.");

    if (d.kind === "classification" && d.fact_id) {
      // Bring the superseded fact back to currently-believed.
      await client.query(
        `update facts set superseded_at = null
          where id = $1 and superseded_by is null`,
        [d.fact_id]
      );
    }

    await client.query(
      `update decisions set reverted_at = null, reverted_by = null where id = $1`,
      [id]
    );

    const invalidated = await invalidateAllBeliefs(client);
    await client.query("commit");

    return {
      ok: true,
      kind: d.kind,
      invalidated,
      summary: `Restored TrustLayer’s automatic decision. ${invalidated} cached answer${invalidated === 1 ? "" : "s"} will recompute.`,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

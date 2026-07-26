// Server-only: the Gate-1 entity-resolution scoreboard.
//
// ── Why this file is allowed to open an answer key ──────────────────────────
// The standing rule is that the application never reads fixture/labeled_pairs.csv
// or fixture/planted_conflicts.md. Milestone 5 carves out exactly one exception:
// the Gate-1 scoreboard must "evaluate against fixture/labeled_pairs.csv" and
// display auto-merge precision. So this module reads the key to SCORE resolution
// AFTER the fact — never to inform it.
//
// The separation is structural, not a promise:
//   - Nothing here feeds the resolver. It calls entityKey/makeResolver exactly as
//     a caller would, and only compares the answers.
//   - The only consumer is <Gate1Scoreboard /> on /admin. Ask, /conflicts, the
//     agent tools and the graph export never import this module.
//   - app/api/source/route.ts still refuses to serve either answer key over HTTP.
//
// ── What "precision" means here ─────────────────────────────────────────────
// The gate measures AUTO-MERGE PRECISION: of the pairs the resolver decided are
// the same entity, how many really are. That is the number that matters, because
// a wrong merge silently corrupts every downstream answer, while a missed merge
// merely leaves knowledge on the table. Recall is reported alongside it for
// honesty, but it is NOT what the gate is set on.
import { query } from "@/lib/db";
import { readCsvFile } from "@/lib/fixture";
import { entityKey, makeResolver } from "@/lib/conflicts/normalize";

/** The build guide's stop-test: do not proceed below this. */
export const GATE1_PRECISION_BAR = 0.98;

export type PairVerdict = {
  a: string;
  b: string;
  /** What the answer key says. */
  actualSame: boolean;
  /** What the resolver did. */
  predictedSame: boolean;
  difficulty: string;
  note: string;
  /** The key both sides landed on, when the resolver merged them. */
  mergedKey?: string;
};

export type Gate1Report = {
  /** Pairs actually graded (rows with both records present). */
  evaluated: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  /** null when the resolver merged nothing at all — precision is undefined. */
  precision: number | null;
  recall: number | null;
  /** The pairs it got wrong in the direction the gate cares about: over-merges. */
  overMerges: PairVerdict[];
  /** Pairs it should have merged and didn't. Recall, not precision. */
  missedMerges: PairVerdict[];
  /** The deliberate traps: confusingly-similar but genuinely different companies. */
  nearMiss: { total: number; keptSeparate: number; collapsed: PairVerdict[] };
  /** The full gate: precision at/above the bar AND every near-miss kept apart. */
  passes: boolean;
};

/** Labels in the key carry a provenance tag — "Acme Inc. [CRM]". Drop it. */
function stripSourceTag(label: string): string {
  return label.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

/**
 * Grade the live resolver against the labeled-pair answer key.
 *
 * The canonical universe is rebuilt the same way every runtime call site builds
 * it — from the CRM + spreadsheet entity_refs currently in the ledger
 * (lib/conflicts/detect.ts, lib/ask/retrieve.ts, lib/decisions.ts) — so this
 * scores the resolver the product is actually running, not a copy of it.
 *
 * Human overrides (a reverted merge) are deliberately NOT applied: the gate
 * measures the quality of the AUTOMATIC decision, the same reason the decision
 * log records pristine arbitrations.
 *
 * Returns null when the ledger is empty (nothing to resolve against yet).
 */
export async function gradeGate1(): Promise<Gate1Report | null> {
  const { rows: factRows } = await query<{ entity_ref: string }>(
    `select distinct entity_ref
       from facts
      where superseded_at is null
        and source_tool in ('crm', 'spreadsheet')`
  );
  if (factRows.length === 0) return null;

  const canonicalKeys = new Set<string>();
  for (const r of factRows) canonicalKeys.add(entityKey(r.entity_ref));
  const resolve = makeResolver(canonicalKeys);

  const table = readCsvFile("labeled_pairs.csv");
  if (table.rows.length === 0) return null;

  const col = (name: string) => table.headers.indexOf(name);
  const iA = col("record_a");
  const iB = col("record_b");
  const iSame = col("same_entity");
  const iDiff = col("difficulty");
  const iNote = col("note");
  if (iA < 0 || iB < 0 || iSame < 0) return null;

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const overMerges: PairVerdict[] = [];
  const missedMerges: PairVerdict[] = [];
  const nearMissCollapsed: PairVerdict[] = [];
  let nearMissTotal = 0;
  let evaluated = 0;

  for (const row of table.rows) {
    const rawA = (row[iA] ?? "").trim();
    const rawB = (row[iB] ?? "").trim();
    if (!rawA || !rawB) continue;

    const a = stripSourceTag(rawA);
    const b = stripSourceTag(rawB);
    const actualSame = (row[iSame] ?? "").trim().toLowerCase() === "yes";
    const difficulty = (row[iDiff] ?? "").trim();
    const note = (row[iNote] ?? "").trim();

    const keyA = resolve(entityKey(a));
    const keyB = resolve(entityKey(b));
    const predictedSame = keyA === keyB && keyA !== "";

    evaluated++;
    const verdict: PairVerdict = {
      a: rawA,
      b: rawB,
      actualSame,
      predictedSame,
      difficulty,
      note,
      ...(predictedSame ? { mergedKey: keyA } : {}),
    };

    const isNearMiss = /near.?miss/i.test(note);
    if (isNearMiss) {
      nearMissTotal++;
      if (predictedSame) nearMissCollapsed.push(verdict);
    }

    if (predictedSame && actualSame) tp++;
    else if (predictedSame && !actualSame) {
      fp++;
      overMerges.push(verdict);
    } else if (!predictedSame && actualSame) {
      fn++;
      missedMerges.push(verdict);
    } else tn++;
  }

  const merged = tp + fp;
  const precision = merged === 0 ? null : tp / merged;
  const shouldMerge = tp + fn;
  const recall = shouldMerge === 0 ? null : tp / shouldMerge;
  const keptSeparate = nearMissTotal - nearMissCollapsed.length;

  return {
    evaluated,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision,
    recall,
    overMerges,
    missedMerges,
    nearMiss: { total: nearMissTotal, keptSeparate, collapsed: nearMissCollapsed },
    passes:
      precision !== null &&
      precision >= GATE1_PRECISION_BAR &&
      nearMissCollapsed.length === 0,
  };
}

// Server-only: read the ACTIVE human overrides out of the decision log.
//
// A decision in `decisions` with reverted_at set is not merely history — it is a
// standing instruction that the retriever (lib/ask/retrieve.ts) and the conflict
// detector (lib/conflicts/detect.ts) must honour on every question:
//
//   * a reverted MERGE       -> keep member_key OUT of its canonical group
//                               (the alias is split back into its own entity).
//   * a reverted ARBITRATION -> force loser_canonical to win for
//                               (entity_key, attribute) — a manual override.
//
// (A reverted CLASSIFICATION needs nothing here: reverting it supersedes the
// underlying fact, which the ledger already hides.)
//
// This module is deliberately dependency-light (only the DB) so both the
// retriever and the detector can import it without an import cycle through
// lib/decisions.ts.
import { query } from "@/lib/db";

export type DecisionOverrides = {
  /** Alias keys that must NOT be folded into a canonical account (split merges). */
  splitKeys: Set<string>;
  /** `${entity_key}::${canonical_attribute}` -> forced winning canonical value. */
  arbOverrides: Map<string, string>;
  /**
   * Alias key -> canonical key, approved by a human on /review. The resolver is
   * conservative by design and leaves real aliases unlinked ("SLG",
   * "silverlinelogistics.io"); these are the ones someone has since confirmed.
   */
  mergeKeys: Map<string, string>;
};

const EMPTY: DecisionOverrides = {
  splitKeys: new Set(),
  arbOverrides: new Map(),
  mergeKeys: new Map(),
};

/** Human-approved merges from /review. Separate query so a missing table (not
 *  yet migrated) degrades to "no approved merges" rather than failing the page. */
async function loadApprovedMerges(): Promise<Map<string, string>> {
  try {
    const { rows } = await query<{ alias_key: string; canonical_key: string }>(
      `select alias_key, canonical_key from resolution_reviews where verdict = 'merge'`
    );
    return new Map(rows.map((r) => [r.alias_key, r.canonical_key]));
  } catch {
    return new Map();
  }
}

export async function loadDecisionOverrides(): Promise<DecisionOverrides> {
  try {
    const { rows } = await query<{
      kind: "merge" | "classification" | "arbitration";
      member_key: string | null;
      entity_key: string | null;
      attribute: string | null;
      loser_canonical: string | null;
    }>(
      `select kind, member_key, entity_key, attribute, loser_canonical
         from decisions
        where reverted_at is not null
          and kind in ('merge','arbitration')`
    );

    const splitKeys = new Set<string>();
    const arbOverrides = new Map<string, string>();
    for (const r of rows) {
      if (r.kind === "merge" && r.member_key) {
        splitKeys.add(r.member_key);
      } else if (r.kind === "arbitration" && r.entity_key && r.attribute && r.loser_canonical) {
        arbOverrides.set(`${r.entity_key}::${r.attribute}`, r.loser_canonical);
      }
    }
    return { splitKeys, arbOverrides, mergeKeys: await loadApprovedMerges() };
  } catch {
    // decisions table not migrated yet — behave as if there are no overrides.
    return EMPTY;
  }
}

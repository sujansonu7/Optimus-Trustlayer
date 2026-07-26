// Server-only: the borderline-pair review queue behind /review.
//
// Why a queue exists at all. The resolver only merges an unambiguous token
// prefix, which is why auto-merge precision is 1.00 on the Gate-1 scoreboard —
// and why recall is low. Names like "SLG", "SLG-West" and
// "silverlinelogistics.io" are real aliases that no prefix rule can catch, so
// they sit unlinked. Those are exactly the calls a human can make in a second,
// and this queue is where they surface.
//
// The scoring here NEVER auto-merges anything. It only ranks candidates for a
// human. Every merge on /review is an explicit click, recorded in
// resolution_reviews and honoured thereafter by every retrieval path
// (lib/overrides.ts -> mergeKeys).
import { query } from "@/lib/db";
import { loadEntityGraph } from "./groups";
import type { SourceTool } from "@/lib/ask/types";

export type ReviewCandidate = {
  aliasKey: string;
  aliasRaw: string;
  aliasTools: SourceTool[];
  aliasFactCount: number;
  canonicalKey: string;
  canonicalLabel: string;
  /** 0–1, higher = more likely the same entity. Ranking only. */
  score: number;
  /** Plain-English account of what matched and what didn't. */
  why: string;
};

export type ReviewVerdict = "merge" | "separate";

export type DecidedPair = {
  aliasKey: string;
  canonicalKey: string;
  verdict: ReviewVerdict;
  decidedAt: string;
};

function tokensOf(key: string): string[] {
  return key.split(" ").filter(Boolean);
}

/** Longest common prefix length of two strings, ignoring spaces. */
function charOverlap(a: string, b: string): number {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i / Math.max(x.length, y.length, 1);
}

/**
 * Score one unresolved key against one canonical key. Deliberately explainable —
 * an initialism check, a shared-token check, and a prefix check — because the
 * reviewer is shown the reason, not the number.
 */
function scorePair(aliasKey: string, canonicalKey: string): { score: number; why: string } | null {
  const aTok = tokensOf(aliasKey);
  const cTok = tokensOf(canonicalKey);
  if (aTok.length === 0 || cTok.length === 0) return null;

  const reasons: string[] = [];
  let score = 0;

  // Shared significant tokens ("silverline logistics" vs "silverline").
  const shared = aTok.filter((t) => cTok.includes(t));
  if (shared.length > 0) {
    score += 0.45 * (shared.length / Math.min(aTok.length, cTok.length));
    reasons.push(`shares the word${shared.length > 1 ? "s" : ""} “${shared.join("”, “")}”`);
  }

  // Initialism: "slg" vs "silverline logistics group".
  const initials = cTok.map((t) => t[0]).join("");
  const aliasFlat = aTok.join("");
  if (aliasFlat.length >= 2 && aliasFlat === initials) {
    score += 0.5;
    reasons.push(`“${aliasKey.toUpperCase()}” is the initials of “${canonicalKey}”`);
  } else if (aliasFlat.length >= 3 && initials.startsWith(aliasFlat)) {
    score += 0.3;
    reasons.push(`reads like an abbreviation of “${canonicalKey}”`);
  }

  // Domain-ish: "silverlinelogisticsio" vs "silverline logistics group".
  const canonFlat = cTok.join("");
  if (aliasFlat.length >= 6 && (canonFlat.startsWith(aliasFlat) || aliasFlat.startsWith(canonFlat))) {
    score += 0.4;
    reasons.push("the run-together spelling matches (looks like a domain or handle)");
  } else {
    const ov = charOverlap(aliasKey, canonicalKey);
    if (ov >= 0.6) {
      score += 0.25 * ov;
      reasons.push(`${Math.round(ov * 100)}% of the spelling matches from the start`);
    }
  }

  // A hyphenated regional variant: "slg-west" vs "slg" tokens.
  if (aliasKey.includes("-")) {
    const stem = aliasKey.split("-")[0];
    if (stem && (initials.startsWith(stem) || cTok.some((t) => t.startsWith(stem)))) {
      score += 0.25;
      reasons.push(`“${stem}” looks like a regional or business-unit suffix on the same name`);
    }
  }

  if (score < 0.35 || reasons.length === 0) return null;

  // What did NOT match — the reviewer needs the case against, too.
  const missing = cTok.filter((t) => !aTok.includes(t));
  if (missing.length > 0 && shared.length > 0) {
    reasons.push(`but “${missing.join(" ")}” appears only on the account side`);
  }

  return { score: Math.min(score, 0.99), why: reasons.join("; ") };
}

/** Verdicts already recorded, so decided pairs leave the queue. */
export async function loadDecidedPairs(): Promise<DecidedPair[]> {
  try {
    const { rows } = await query<{
      alias_key: string;
      canonical_key: string;
      verdict: string;
      decided_at: string;
    }>(
      `select alias_key, canonical_key, verdict,
              to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at
         from resolution_reviews
        order by decided_at desc`
    );
    return rows.map((r) => ({
      aliasKey: r.alias_key,
      canonicalKey: r.canonical_key,
      verdict: r.verdict as ReviewVerdict,
      decidedAt: r.decided_at,
    }));
  } catch {
    return []; // table not migrated yet
  }
}

export type ReviewQueue = { candidates: ReviewCandidate[]; decided: DecidedPair[] };

/**
 * Build the queue: every unresolved name, paired with its best-scoring canonical
 * account, minus anything already decided. Highest score first.
 */
export async function loadReviewQueue(limit = 40): Promise<ReviewQueue> {
  const graph = await loadEntityGraph();
  const decided = await loadDecidedPairs();
  const settled = new Set(decided.map((d) => `${d.aliasKey}::${d.canonicalKey}`));
  const settledAlias = new Set(decided.map((d) => d.aliasKey));

  const labelFor = new Map<string, string>();
  for (const e of graph.entities) labelFor.set(e.key, e.label);

  const candidates: ReviewCandidate[] = [];
  for (const [aliasKey, info] of Array.from(graph.unresolvedKeys.entries())) {
    // Once an alias has any verdict, stop proposing it — the human has spoken.
    if (settledAlias.has(aliasKey)) continue;

    let best: { canonicalKey: string; score: number; why: string } | null = null;
    for (const canonicalKey of Array.from(graph.canonicalKeys)) {
      if (canonicalKey === aliasKey) continue;
      if (settled.has(`${aliasKey}::${canonicalKey}`)) continue;
      const s = scorePair(aliasKey, canonicalKey);
      if (s && (!best || s.score > best.score)) best = { canonicalKey, ...s };
    }
    if (!best) continue;

    candidates.push({
      aliasKey,
      aliasRaw: info.raw,
      aliasTools: info.tools,
      aliasFactCount: info.factCount,
      canonicalKey: best.canonicalKey,
      canonicalLabel: labelFor.get(best.canonicalKey) ?? best.canonicalKey,
      score: best.score,
      why: best.why,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.aliasFactCount - a.aliasFactCount);
  return { candidates: candidates.slice(0, limit), decided };
}

/** Record a verdict. Re-deciding the same pair overwrites it. */
export async function recordReview(
  aliasKey: string,
  canonicalKey: string,
  verdict: ReviewVerdict
): Promise<void> {
  await query(
    `insert into resolution_reviews (alias_key, canonical_key, verdict)
     values ($1, $2, $3)
     on conflict (alias_key, canonical_key)
     do update set verdict = excluded.verdict, decided_at = now()`,
    [aliasKey, canonicalKey, verdict]
  );
}

/** Undo a verdict, putting the pair back in the queue. */
export async function clearReview(aliasKey: string, canonicalKey: string): Promise<void> {
  await query(`delete from resolution_reviews where alias_key = $1 and canonical_key = $2`, [
    aliasKey,
    canonicalKey,
  ]);
}

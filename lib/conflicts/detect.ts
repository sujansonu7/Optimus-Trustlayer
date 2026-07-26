// Server-only: the conflict detector + arbitrator.
//
// Pipeline (all reads, no writes — detection is a pure view over the ledger):
//   1. Load every CURRENTLY-BELIEVED fact (superseded_at IS NULL). A value a
//      source later replaced is history, not a conflict — the bitemporal ledger
//      already hides it for us.
//   2. Resolve each fact's entity to a canonical account and fold its attribute
//      onto a canonical attribute (see normalize.ts).
//   3. Per (entity, attribute), canonicalize values. A conflict exists only when
//      >= 2 DISTINCT canonical values are asserted across >= 2 DISTINCT sources.
//   4. Arbitrate a winner — declarations first, then corroboration, then
//      freshness — WITHOUT ever hiding the loser. Every value is kept and shown.
//   5. Phrase the governing rule as one plain-English sentence, and grade the
//      run against the planted-conflict oracle for the /admin yield counter.
import { query } from "@/lib/db";
import {
  canonicalAttribute,
  entityKey,
  makeResolver,
  normalizeValue,
  displayValue,
  ATTR_LABEL,
  type CanonicalAttribute,
} from "./normalize";
import { EXPECTED_CONFLICTS, expectedFor } from "./expected";
import { loadDecisionOverrides } from "@/lib/overrides";

export type SourceTool = "crm" | "spreadsheet" | "email" | "calls";

// The fixture's "today". Every planted staleness is anchored here, so ages read
// the way the answer key intends ("4 days before the snapshot", "8 months old").
export const SNAPSHOT = new Date("2026-03-15T00:00:00Z");

type RawFact = {
  entity_ref: string;
  attribute: string;
  value: string;
  source_tool: SourceTool;
  source_doc: string;
  doc_timestamp: string | null;
};

/* ------------------------------------------------------------------ */
/* Per-attribute policy (aligned with the freshness_table seeds)      */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "high" | "low";

type AttrMeta = {
  severity: Severity; // fallback when the freshness table has no matching row
  volatility: string; // fallback, as above
  scopeKeyword: string | null; // which declaration scope can govern it
  scopeLabel: string | null; // how that scope reads in a sentence
  artifactType: string; // the freshness_table artifact_type this maps to
};

// Severity and volatility are POLICY, and policy lives in freshness_table (which
// /settings edits). These literals are only the fallback for a database whose
// freshness rows are missing — before, they were the sole source of truth, so
// editing the staleness tier on /settings changed nothing on /conflicts.
const ATTR_META: Record<CanonicalAttribute, AttrMeta> = {
  renewal_date: { severity: "critical", volatility: "days", scopeKeyword: "renewal", scopeLabel: "renewal dates", artifactType: "renewal dates" },
  arr: { severity: "high", volatility: "months", scopeKeyword: null, scopeLabel: null, artifactType: "ARR" },
  owner: { severity: "high", volatility: "months", scopeKeyword: "ownership", scopeLabel: "ownership", artifactType: "ownership" },
  status: { severity: "high", volatility: "days", scopeKeyword: null, scopeLabel: null, artifactType: "account status" },
  tier: { severity: "low", volatility: "stable", scopeKeyword: null, scopeLabel: null, artifactType: "tier" },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, low: 1 };

/**
 * Per-attribute policy as it currently stands in freshness_table, falling back
 * to ATTR_META where no row exists. When several sources declare the same
 * artifact type, the most severe tier wins — the cost of being wrong is set by
 * the worst case, not an average.
 */
async function loadAttrPolicy(): Promise<Record<CanonicalAttribute, AttrMeta>> {
  const out = { ...ATTR_META };
  try {
    const { rows } = await query<{ artifact_type: string; volatility: string; staleness_tier: string }>(
      `select artifact_type, volatility, staleness_tier from freshness_table`
    );
    const byType = new Map<string, { severity: Severity; volatility: string }>();
    for (const r of rows) {
      const key = r.artifact_type.trim().toLowerCase();
      const severity = r.staleness_tier as Severity;
      if (!SEVERITY_RANK[severity]) continue;
      const prev = byType.get(key);
      if (!prev || SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity]) {
        byType.set(key, { severity, volatility: r.volatility });
      }
    }
    for (const attr of Object.keys(out) as CanonicalAttribute[]) {
      const hit = byType.get(out[attr].artifactType.toLowerCase());
      if (hit) out[attr] = { ...out[attr], severity: hit.severity, volatility: hit.volatility };
    }
  } catch {
    /* freshness table unavailable — the hardcoded fallback stands */
  }
  return out;
}

const SOURCE_LABEL: Record<SourceTool, string> = {
  crm: "the CRM",
  spreadsheet: "the Renewals Sheet",
  email: "email",
  calls: "a call transcript",
};

// Which source a declaration names as the system of record. Read from the
// declaration's own words so /settings edits stay authoritative.
function sorToolFromStatement(statement: string): SourceTool | null {
  const s = statement.toLowerCase();
  if (s.includes("renewals sheet") || s.includes("renewal sheet") || s.includes("spreadsheet")) return "spreadsheet";
  if (s.includes("crm")) return "crm";
  if (s.includes("email")) return "email";
  if (s.includes("call") || s.includes("gong")) return "calls";
  return null;
}

/* ------------------------------------------------------------------ */
/* Output shape                                                       */
/* ------------------------------------------------------------------ */

export type ConflictSource = {
  tool: SourceTool;
  label: string;
  sourceDoc: string;
  docTimestamp: string | null;
  age: string; // human age vs the snapshot
};

export type ConflictValue = {
  canonical: string;
  display: string;
  raw: string; // one representative raw spelling
  sources: ConflictSource[];
  sourceCount: number; // distinct source tools asserting this value
  newest: string | null; // newest doc_timestamp among its sources
  isWinner: boolean;
};

export type Conflict = {
  id: string; // stable-ish key: entityKey::attribute
  entityKey: string;
  entityLabel: string;
  attribute: CanonicalAttribute;
  attributeLabel: string;
  values: ConflictValue[];
  winnerDisplay: string;
  ruleBasis: "declaration" | "corroboration" | "freshness" | "override";
  rule: string; // one plain-English sentence
  severity: Severity;
  planted: string | null; // matched answer-key section, if any
  winnerCorrect: boolean | null; // vs oracle (null when not a planted item)
};

export type ConflictReport = {
  conflicts: Conflict[];
  yield: {
    expected: number; // planted value-conflicts we should catch
    caught: number; // of those, how many we caught
    missed: { planted: string; entityLabel: string; attribute: string }[];
    junk: number; // detected conflicts NOT in the oracle (must be 0)
    winnersCorrect: number; // caught planted conflicts whose winner matches
    total: number; // total conflicts detected
  };
};

/* ------------------------------------------------------------------ */
/* Age phrasing                                                       */
/* ------------------------------------------------------------------ */

function humaneAge(ts: string | null): string {
  if (!ts) return "at an unknown time";
  const d = new Date(ts);
  const days = Math.round((SNAPSHOT.getTime() - d.getTime()) / 86_400_000);
  if (days < 0) return `dated ${ts.slice(0, 10)}`;
  if (days === 0) return "the day of the snapshot";
  if (days === 1) return "1 day before the snapshot";
  if (days < 45) return `${days} days before the snapshot`;
  const months = Math.round(days / 30);
  return `~${months} month${months === 1 ? "" : "s"} old`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function sourceList(sources: ConflictSource[]): string {
  const labels = Array.from(new Set(sources.map((s) => s.label)));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* The run                                                            */
/* ------------------------------------------------------------------ */

export async function detectConflicts(
  opts?: { applyOverrides?: boolean; connected?: SourceTool[] }
): Promise<ConflictReport> {
  // Human overrides from the decision log (a reverted merge splits an alias out;
  // a reverted arbitration flips the winner). Materialization asks for the
  // pristine automatic decision by passing applyOverrides:false.
  const { splitKeys, arbOverrides, mergeKeys } =
    opts?.applyOverrides === false
      ? {
          splitKeys: new Set<string>(),
          arbOverrides: new Map<string, string>(),
          mergeKeys: new Map<string, string>(),
        }
      : await loadDecisionOverrides();

  // Trust is revocable: when the caller passes the connected tools, a
  // disconnected source is excluded at the SQL boundary — not filtered out of
  // the rendered card afterwards. Its values, its name, and its dates cannot
  // reach arbitration, the rule sentence, or the model. Omitting `connected`
  // keeps the unfiltered view, which is what the /admin yield counter and the
  // decision log want: both grade what was built, independent of who can
  // currently see it.
  const connected = opts?.connected;
  const { rows } = await query<RawFact>(
    // Cast the timestamp to a stable ISO string here — the pg driver otherwise
    // hands back a JS Date, and everything downstream expects a string.
    `select entity_ref, attribute, value, source_tool, source_doc,
            to_char(doc_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as doc_timestamp
       from facts
      where superseded_at is null${connected ? `
        and source_tool = any($1::source_tool[])` : ""}`,
    connected ? [connected] : []
  );

  // Ratified declarations only — a proposed declaration is an opinion, not yet
  // the law of the land, so it does not override field data.
  const decls = await query<{ statement: string; scope: string | null }>(
    `select statement, scope from declarations
      where status = 'ratified' and superseded_at is null`
  );

  // Severity + volatility as currently declared on /settings.
  const attrPolicy = await loadAttrPolicy();

  // The CRM + spreadsheet names form the canonical account universe; email/call
  // short-names resolve into them (or stand alone). See makeResolver.
  const canonicalKeys = new Set<string>();
  for (const r of rows) {
    if (r.source_tool === "crm" || r.source_tool === "spreadsheet") {
      canonicalKeys.add(entityKey(r.entity_ref));
    }
  }
  const resolve = makeResolver(canonicalKeys);

  const keyFor = (raw: string): string => {
    const rk = entityKey(raw);
    // A human split always wins; then a human-approved merge from /review; then
    // the automatic resolver.
    if (splitKeys.has(rk)) return rk;
    return mergeKeys.get(rk) ?? resolve(rk);
  };

  // Per entity, the canonical owner values a STRUCTURED source (CRM / Renewals
  // Sheet) asserts. Owner is an explicit field in those sources; an "owner"
  // pulled from free-text email/calls is noisy — the extractor may grab a
  // recipient, the vendor's own name, or a passing mention. So an email/call
  // owner value is trusted ONLY when it CORROBORATES a structured value.
  // Unanchored ones are extraction noise, dropped below — this is what keeps the
  // false positives out (e.g. Prairie Point) while preserving real corroborated
  // conflicts (e.g. an email confirming the Sheet's reassigned owner).
  const structuredOwners = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.source_tool !== "crm" && r.source_tool !== "spreadsheet") continue;
    if (canonicalAttribute(r.attribute) !== "owner") continue;
    const cv = normalizeValue("owner", r.value);
    if (!cv) continue;
    const ek = keyFor(r.entity_ref);
    let set = structuredOwners.get(ek);
    if (!set) {
      set = new Set<string>();
      structuredOwners.set(ek, set);
    }
    set.add(cv);
  }

  // Bucket facts by (entity, canonical attribute, canonical value).
  type Bucket = {
    entityKey: string;
    labels: Set<string>;
    attribute: CanonicalAttribute;
    byValue: Map<string, { raw: string; sources: Map<SourceTool, ConflictSource> }>;
  };
  const buckets = new Map<string, Bucket>();

  for (const r of rows) {
    const attr = canonicalAttribute(r.attribute);
    if (!attr) continue;
    const canonical = normalizeValue(attr, r.value);
    if (canonical === null || canonical === "") continue; // non-comparable → ignore

    // A split alias (a reverted merge) is pulled out of its canonical group and
    // stands on its own key, so its facts no longer join the account.
    const rawKey = entityKey(r.entity_ref);
    const ek = splitKeys.has(rawKey) ? rawKey : mergeKeys.get(rawKey) ?? resolve(rawKey);

    // Anchoring: an owner value seen only in free-text email/calls must
    // corroborate a structured (CRM/Sheet) owner value for this account, or it
    // is dropped as extraction noise (a recipient, the vendor name, a passing
    // mention) rather than allowed to raise a false ownership conflict.
    if (
      (r.source_tool === "email" || r.source_tool === "calls") &&
      attr === "owner" &&
      !structuredOwners.get(ek)?.has(canonical)
    ) {
      continue;
    }

    const bkey = `${ek}::${attr}`;
    let b = buckets.get(bkey);
    if (!b) {
      b = { entityKey: ek, labels: new Set(), attribute: attr, byValue: new Map() };
      buckets.set(bkey, b);
    }
    b.labels.add(r.entity_ref);

    let v = b.byValue.get(canonical);
    if (!v) {
      v = { raw: r.value, sources: new Map() };
      b.byValue.set(canonical, v);
    }
    // Keep the newest doc for each (value, source) pair, so freshness is honest.
    const existing = v.sources.get(r.source_tool);
    const cand: ConflictSource = {
      tool: r.source_tool,
      label: SOURCE_LABEL[r.source_tool],
      sourceDoc: r.source_doc,
      docTimestamp: r.doc_timestamp,
      age: humaneAge(r.doc_timestamp),
    };
    if (!existing || (r.doc_timestamp ?? "") > (existing.docTimestamp ?? "")) {
      v.sources.set(r.source_tool, cand);
    }
  }

  const conflicts: Conflict[] = [];

  for (const b of Array.from(buckets.values())) {
    const sourcesUnion = new Set<SourceTool>();
    for (const v of Array.from(b.byValue.values()))
      for (const s of Array.from(v.sources.keys())) sourcesUnion.add(s);
    // A conflict needs >= 2 distinct values AND >= 2 distinct sources.
    if (b.byValue.size < 2 || sourcesUnion.size < 2) continue;

    const meta = attrPolicy[b.attribute];
    const entityLabel = Array.from(b.labels).sort((a, c) => c.length - a.length)[0];

    const values: ConflictValue[] = Array.from(b.byValue.entries()).map(([canonical, v]) => {
      const sources = Array.from(v.sources.values());
      const newest = sources
        .map((s) => s.docTimestamp)
        .filter(Boolean)
        .sort()
        .pop() ?? null;
      return {
        canonical,
        // Names/tiers read best in their original casing; money and status get
        // a canonical display ("$365,000", "Churned").
        display:
          b.attribute === "owner" || b.attribute === "tier"
            ? v.raw
            : displayValue(b.attribute, canonical),
        raw: v.raw,
        sources,
        sourceCount: sources.length,
        newest,
        isWinner: false,
      };
    });

    const forced = arbOverrides.get(`${b.entityKey}::${b.attribute}`) ?? null;
    const decision = arbitrate(b.attribute, meta, values, decls.rows, forced);
    for (const val of values) val.isWinner = val.canonical === decision.winner.canonical;

    const oracle = expectedFor(b.entityKey, b.attribute);
    conflicts.push({
      id: `${b.entityKey}::${b.attribute}`,
      entityKey: b.entityKey,
      entityLabel,
      attribute: b.attribute,
      attributeLabel: ATTR_LABEL[b.attribute],
      values: values.sort((a, c) => Number(c.isWinner) - Number(a.isWinner)),
      winnerDisplay: decision.winner.display,
      ruleBasis: decision.basis,
      rule: decision.rule,
      severity: meta.severity,
      planted: oracle?.planted ?? null,
      winnerCorrect: oracle ? decision.winner.canonical === oracle.winner : null,
    });
  }

  // Severity, then whether it's a planted find, for a sensible reading order.
  const rank: Record<Severity, number> = { critical: 0, high: 1, low: 2 };
  conflicts.sort(
    (a, c) => rank[a.severity] - rank[c.severity] || Number(!!c.planted) - Number(!!a.planted)
  );

  return { conflicts, yield: gradeYield(conflicts) };
}

/* ------------------------------------------------------------------ */
/* Arbitration                                                        */
/* ------------------------------------------------------------------ */

function arbitrate(
  attr: CanonicalAttribute,
  meta: AttrMeta,
  values: ConflictValue[],
  decls: { statement: string; scope: string | null }[],
  forcedCanonical?: string | null
): { winner: ConflictValue; basis: Conflict["ruleBasis"]; rule: string } {
  const label = ATTR_LABEL[attr];

  // 0) Human override — a reverted arbitration in the decision log forces a
  //    specific value to win, regardless of the automatic rules.
  if (forcedCanonical) {
    const forced = values.find((v) => v.canonical === forcedCanonical);
    if (forced) {
      const others = values.filter((v) => v !== forced);
      const otherText = others.map((o) => `${sourceList(o.sources)}'s ${o.display}`).join(" and ");
      const rule =
        `Showing ${forced.display} — you overrode this decision in the log, choosing it over ` +
        `${otherText || "the alternative"}. TrustLayer's automatic pick has been set aside.`;
      return { winner: forced, basis: "override", rule };
    }
  }

  // 1) Declaration — a ratified system-of-record wins outright for its scope.
  if (meta.scopeKeyword) {
    const gov = decls.find((d) => (d.scope ?? "").toLowerCase().includes(meta.scopeKeyword!));
    const sorTool = gov ? sorToolFromStatement(gov.statement) : null;
    if (sorTool) {
      const winner = values.find((v) => v.sources.some((s) => s.tool === sorTool));
      if (winner) {
        const others = values.filter((v) => v !== winner);
        const winSrc = winner.sources.find((s) => s.tool === sorTool)!;
        const otherText = capitalize(
          others
            .map((o) => `${sourceList(o.sources)} show${o.sources.length === 1 ? "s" : ""} ${o.display}`)
            .join("; ")
        );
        const rule =
          `Showing ${winner.display} from ${SOURCE_LABEL[sorTool]} — your ratified system of record ` +
          `for ${meta.scopeLabel ?? label} (${winSrc.age}). ${otherText}, but the declared source governs.`;
        return { winner, basis: "declaration", rule };
      }
    }
  }

  // 2) Corroboration — the value the most independent sources agree on wins.
  const byCorrob = [...values].sort((a, c) => c.sourceCount - a.sourceCount);
  if (byCorrob[0].sourceCount > byCorrob[1].sourceCount) {
    const winner = byCorrob[0];
    const others = values.filter((v) => v !== winner);
    const otherText = others
      .map((o) => `${sourceList(o.sources)}'s ${o.display}`)
      .join(" and ");
    const rule =
      `${winner.sourceCount} independent sources agree on ${winner.display} ` +
      `(${sourceList(winner.sources)}); ${otherText} stands alone.`;
    return { winner, basis: "corroboration", rule };
  }

  // 3) Freshness — newest value wins, read against its volatility window.
  const byFresh = [...values].sort((a, c) => (c.newest ?? "").localeCompare(a.newest ?? ""));
  const winner = byFresh[0];
  const loser = byFresh[byFresh.length - 1];
  const winSrc = winner.sources.slice().sort((a, c) => (c.docTimestamp ?? "").localeCompare(a.docTimestamp ?? ""))[0];
  const loseSrc = loser.sources.slice().sort((a, c) => (c.docTimestamp ?? "").localeCompare(a.docTimestamp ?? ""))[0];
  const rule =
    `Showing ${winner.display} from ${sourceList(winner.sources)}, ${winSrc.age}; ` +
    `${sourceList(loser.sources)}'s ${loser.display} is ${loseSrc.age} — ` +
    `past the "${meta.volatility}" freshness window for ${label}.`;
  return { winner, basis: "freshness", rule };
}

/* ------------------------------------------------------------------ */
/* Grading against the planted-conflict oracle                        */
/* ------------------------------------------------------------------ */

function gradeYield(conflicts: Conflict[]): ConflictReport["yield"] {
  const caughtKeys = new Set(conflicts.filter((c) => c.planted).map((c) => `${c.entityKey}::${c.attribute}`));
  const missed = EXPECTED_CONFLICTS.filter(
    (e) => !caughtKeys.has(`${e.entity}::${e.attribute}`)
  ).map((e) => ({ planted: e.planted, entityLabel: e.entityLabel, attribute: e.attribute }));

  return {
    expected: EXPECTED_CONFLICTS.length,
    caught: EXPECTED_CONFLICTS.length - missed.length,
    missed,
    junk: conflicts.filter((c) => !c.planted).length,
    winnersCorrect: conflicts.filter((c) => c.winnerCorrect === true).length,
    total: conflicts.length,
  };
}

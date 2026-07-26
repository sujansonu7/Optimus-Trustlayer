// Server-only: the Ask retrieval step.
//
// Given a natural-language question, gather ONLY the evidence needed to answer
// it — from Postgres, and ONLY from currently-connected sources. Everything the
// synthesizer and the envelope see comes from here:
//   * evidence   — the exact source passages (one per fact), each citable by id
//   * resolved   — per (entity, attribute) the arbitrated current value + rule
//   * conflicts  — the subset of resolved facts where sources disagree
//   * freshness  — one badge per contributing source (the Sheet uses REAL mtime)
//   * declarations touched, and whether a declared system-of-record is offline
//   * evidenceHash — the belief-cache key (folds in the connected-source set)
//
// Disconnected sources are excluded at the SQL level (source_tool = any($conn)),
// so their content is structurally unreachable here — no trace can survive into
// an answer. Retrieval is all reads; it never writes.
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { SNAPSHOT } from "@/lib/conflicts/detect";
import {
  canonicalAttribute,
  normalizeValue,
  displayValue,
  entityKey,
  makeResolver,
  ATTR_LABEL,
  type CanonicalAttribute,
} from "@/lib/conflicts/normalize";
import { loadRenewals } from "@/lib/renewals";
import { loadDecisionOverrides } from "@/lib/overrides";
import {
  SOURCE_LABEL,
  type SourceTool,
  type EvidenceItem,
  type ConflictBlock,
  type ConflictValueView,
  type FreshnessBadge,
} from "./types";

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */

const MAX_ENTITIES = 4; // bound how many accounts one question pulls in
const MAX_EVIDENCE = 60; // hard ceiling on passages sent to the model

// source_tool -> the freshness_table `source` name.
const FRESHNESS_SOURCE: Record<SourceTool, string> = {
  crm: "CRM",
  spreadsheet: "Renewals Sheet",
  email: "Email",
  calls: "Calls",
};

// Which declaration scope can govern each canonical attribute, and how that
// scope reads in a sentence. Mirrors lib/conflicts/detect.ts ATTR_META.
const SCOPE_FOR: Record<CanonicalAttribute, { keyword: string | null; label: string | null }> = {
  renewal_date: { keyword: "renewal", label: "renewal dates" },
  arr: { keyword: null, label: null },
  owner: { keyword: "ownership", label: "ownership" },
  status: { keyword: null, label: null },
  tier: { keyword: null, label: null },
};

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type RawFact = {
  entity_ref: string;
  attribute: string;
  value: string;
  source_tool: SourceTool;
  source_doc: string;
  doc_timestamp: string | null;
  content_hash: string;
  source_quote: string | null;
  source_offset: number | null;
};

export type ResolvedFact = {
  entity: string;
  attributeLabel: string;
  currentValue: string;
  basis: "single" | "declaration" | "corroboration" | "freshness" | "override";
  conflicted: boolean;
};

export type Retrieval = {
  question: string;
  connectedTools: SourceTool[];
  matchedEntities: string[];
  evidence: EvidenceItem[];
  resolved: ResolvedFact[];
  conflicts: ConflictBlock[];
  freshness: FreshnessBadge[];
  declarations: { statement: string; scope: string | null; status: string }[];
  /** A declared system-of-record that is currently DISCONNECTED and governs a
   *  scope this answer touches — drives the honest degraded banner. */
  degraded: string | null;
  evidenceHash: string;
};

/* ------------------------------------------------------------------ */
/* Age phrasing (fixture provenance is aged vs the fixture snapshot)   */
/* ------------------------------------------------------------------ */

function humaneAge(ts: string | null, ref: Date): string {
  if (!ts) return "at an unknown time";
  const d = new Date(ts);
  const days = Math.round((ref.getTime() - d.getTime()) / 86_400_000);
  if (days < 0) return `dated ${ts.slice(0, 10)}`;
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `~${months} month${months === 1 ? "" : "s"} old`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ------------------------------------------------------------------ */
/* Question → matched entities                                        */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "of", "for",
  "to", "in", "on", "at", "and", "or", "with", "what", "who", "when", "where",
  "why", "how", "which", "whats", "whos", "renew", "renews", "renewal", "owner",
  "owns", "own", "arr", "status", "active", "churned", "contact", "primary",
  "account", "customer", "still", "should", "know", "before", "anything", "me",
  "our", "their", "his", "her", "its", "about", "tell", "value", "worth", "price",
  "pricing", "discount", "date", "dates", "much",
]);

function qtokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/&/g, " and ")
    .split(/\s+/)
    .filter(Boolean);
}

// Score how well an entity group (its labels + key) matches the question.
function scoreEntity(qTokenSet: Set<string>, qJoined: string, keyTokens: string[], keyStr: string): number {
  // Exact substring of the whole key in the question is the strongest signal.
  if (keyStr && qJoined.includes(keyStr)) return 100 + keyStr.length;
  const meaningful = keyTokens.filter((t) => !STOPWORDS.has(t));
  if (meaningful.length === 0) return 0;
  const hits = meaningful.filter((t) => qTokenSet.has(t)).length;
  // Require the distinctive first token and at least ~half the name.
  const firstOk = qTokenSet.has(meaningful[0]);
  if (!firstOk) return 0;
  if (hits < Math.min(2, meaningful.length)) return 0;
  return hits;
}

/* ------------------------------------------------------------------ */
/* Arbitration (self-contained; mirrors the /conflicts three-tier rule)*/
/* ------------------------------------------------------------------ */

type ValueGroup = {
  canonical: string;
  display: string;
  raw: string;
  // newest doc per source tool
  sources: Map<SourceTool, { doc: string; ts: string | null }>;
};

function sourceList(tools: SourceTool[]): string {
  const labels = Array.from(new Set(tools.map((t) => SOURCE_LABEL[t])));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function sorToolFromStatement(statement: string): SourceTool | null {
  const s = statement.toLowerCase();
  if (s.includes("renewals sheet") || s.includes("renewal sheet") || s.includes("spreadsheet")) return "spreadsheet";
  if (s.includes("crm")) return "crm";
  if (s.includes("email")) return "email";
  if (s.includes("call") || s.includes("gong")) return "calls";
  return null;
}

/* ------------------------------------------------------------------ */
/* The retrieval run                                                  */
/* ------------------------------------------------------------------ */

export async function retrieve(
  question: string,
  connected: SourceTool[]
): Promise<Retrieval> {
  const connectedSet = new Set(connected);

  // No connected sources at all → nothing is knowable.
  if (connected.length === 0) {
    return emptyRetrieval(question, connected);
  }

  // Human overrides from the decision log: a reverted merge splits an alias out
  // of its account; a reverted arbitration forces a specific winner.
  const { splitKeys, arbOverrides } = await loadDecisionOverrides();

  // 1) Load every currently-believed fact from CONNECTED sources only. The
  //    disconnected tools are excluded right here, at the SQL boundary.
  const { rows } = await query<RawFact>(
    `select entity_ref, attribute, value, source_tool, source_doc,
            to_char(doc_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as doc_timestamp,
            content_hash, source_quote, source_offset
       from facts
      where superseded_at is null
        and source_tool = any($1::source_tool[])`,
    [connected]
  );

  // 2) Build the canonical account universe (from connected CRM + spreadsheet)
  //    and a resolver so email/call short-names fold into their account.
  const canonicalKeys = new Set<string>();
  for (const r of rows) {
    if (r.source_tool === "crm" || r.source_tool === "spreadsheet") {
      canonicalKeys.add(entityKey(r.entity_ref));
    }
  }
  const resolve = makeResolver(canonicalKeys);

  // 3) Group raw facts by resolved entity key; track display labels per group.
  type Group = { key: string; labels: Set<string>; facts: RawFact[] };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const rawKey = entityKey(r.entity_ref);
    // A split alias (a reverted merge) stands on its own key instead of folding
    // into its canonical account — so its facts stop joining that account.
    const gk = splitKeys.has(rawKey) ? rawKey : resolve(rawKey);
    let g = groups.get(gk);
    if (!g) {
      g = { key: gk, labels: new Set(), facts: [] };
      groups.set(gk, g);
    }
    g.labels.add(r.entity_ref);
    g.facts.push(r);
  }

  // 4) Match the question to entity groups.
  const qtoks = qtokens(question);
  const qset = new Set(qtoks);
  const qjoined = " " + qtoks.join(" ") + " ";
  const scored: { g: Group; score: number }[] = [];
  for (const g of Array.from(groups.values())) {
    let best = scoreEntity(qset, qjoined, g.key.split(" "), g.key);
    for (const label of Array.from(g.labels)) {
      const k = entityKey(label);
      best = Math.max(best, scoreEntity(qset, qjoined, k.split(" "), k));
    }
    if (best > 0) scored.push({ g, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored.slice(0, MAX_ENTITIES).map((s) => s.g);

  // Pick a display label for a group: the longest raw label (usually the CRM
  // legal name), which reads best.
  const displayLabel = (g: Group) =>
    Array.from(g.labels).sort((a, b) => b.length - a.length)[0];

  // 5) Load ratified + relevant declarations.
  const declRows = await query<{ statement: string; scope: string | null; status: string }>(
    `select statement, scope, status from declarations
      where superseded_at is null
      order by (status = 'ratified') desc, recorded_at desc`
  );
  const ratified = declRows.rows.filter((d) => d.status === "ratified");

  // 6) Build evidence + arbitrate per (entity, canonical attribute).
  const evidence: EvidenceItem[] = [];
  const resolved: ResolvedFact[] = [];
  const conflicts: ConflictBlock[] = [];
  const contributingTools = new Set<SourceTool>();
  const touchedScopes = new Set<string>(); // canonical scope labels this answer touches
  let degraded: string | null = null;

  let nextId = 0;
  const pushEvidence = (r: RawFact, entity: string, status: EvidenceItem["status"]): number => {
    if (evidence.length >= MAX_EVIDENCE) return -1;
    const attr = canonicalAttribute(r.attribute);
    const id = nextId++;
    evidence.push({
      id,
      entity,
      attribute: r.attribute,
      attributeLabel: attr ? ATTR_LABEL[attr] : r.attribute.replace(/_/g, " "),
      value: r.value,
      display: attr ? displayValue(attr, normalizeValue(attr, r.value) ?? r.value) : r.value,
      sourceTool: r.source_tool,
      sourceLabel: SOURCE_LABEL[r.source_tool],
      sourceDoc: r.source_doc,
      docTimestamp: r.doc_timestamp,
      ageText: humaneAge(r.doc_timestamp, SNAPSHOT),
      contentHash: r.content_hash,
      sourceQuote: r.source_quote,
      sourceOffset: r.source_offset,
      status,
    });
    contributingTools.add(r.source_tool);
    return id;
  };

  for (const g of chosen) {
    const entity = displayLabel(g);

    // Bucket this group's facts by canonical attribute (for arbitration) and by
    // raw attribute (so non-canonical fields still become evidence).
    const canonBuckets = new Map<CanonicalAttribute, Map<string, ValueGroup>>();
    const canonFacts = new Map<CanonicalAttribute, RawFact[]>();
    const otherFacts: RawFact[] = [];

    for (const r of g.facts) {
      const attr = canonicalAttribute(r.attribute);
      if (!attr) {
        otherFacts.push(r);
        continue;
      }
      const canonical = normalizeValue(attr, r.value);
      if (canonical === null || canonical === "") {
        // Non-comparable value for a canonical attribute (e.g. "end of month")
        // — keep it as context evidence, but it can't compete as a value.
        otherFacts.push(r);
        continue;
      }
      (canonFacts.get(attr) ?? canonFacts.set(attr, []).get(attr)!).push(r);
      let byVal = canonBuckets.get(attr);
      if (!byVal) {
        byVal = new Map();
        canonBuckets.set(attr, byVal);
      }
      let vg = byVal.get(canonical);
      if (!vg) {
        vg = {
          canonical,
          display: attr === "owner" || attr === "tier" ? r.value : displayValue(attr, canonical),
          raw: r.value,
          sources: new Map(),
        };
        byVal.set(canonical, vg);
      }
      const prev = vg.sources.get(r.source_tool);
      if (!prev || (r.doc_timestamp ?? "") > (prev.ts ?? "")) {
        vg.sources.set(r.source_tool, { doc: r.source_doc, ts: r.doc_timestamp });
      }
    }

    // Arbitrate each canonical attribute; mark evidence winner/superseded.
    for (const [attr, byVal] of Array.from(canonBuckets.entries())) {
      const facts = canonFacts.get(attr) ?? [];
      const values = Array.from(byVal.values());
      const forced = arbOverrides.get(`${g.key}::${attr}`) ?? null;
      const decision = arbitrate(attr, values, ratified, forced);
      const conflicted = values.length >= 2 && distinctSources(values) >= 2;

      // Emit evidence for this attribute's facts, tagged by arbitration outcome.
      const winnerCanon = decision.winner.canonical;
      for (const r of facts) {
        const c = normalizeValue(attr, r.value);
        const status: EvidenceItem["status"] = !conflicted
          ? "current"
          : c === winnerCanon
          ? "winner"
          : "superseded";
        pushEvidence(r, entity, status);
      }

      resolved.push({
        entity,
        attributeLabel: ATTR_LABEL[attr],
        currentValue: decision.winner.display,
        basis: conflicted ? decision.basis : "single",
        conflicted,
      });

      // Track touched governed scope + detect an offline system-of-record.
      const scope = SCOPE_FOR[attr];
      if (scope.label) {
        touchedScopes.add(scope.label);
        const gov = ratified.find((d) => (d.scope ?? "").toLowerCase().includes(scope.keyword ?? "\0"));
        const sorTool = gov ? sorToolFromStatement(gov.statement) : null;
        if (sorTool && !connectedSet.has(sorTool)) {
          degraded =
            `${capitalize(SOURCE_LABEL[sorTool])} — your declared system of record for ${scope.label} — ` +
            `is disconnected. Answering from the remaining sources, and lowering confidence accordingly.`;
        }
      }

      if (conflicted) {
        conflicts.push(buildConflictBlock(entity, attr, values, decision));
      }
    }

    // Emit the non-canonical / context facts (primary_contact, industry, deal
    // fields, commitments, etc.) as plain current evidence.
    for (const r of otherFacts) pushEvidence(r, entity, "current");
  }

  // 7) Freshness badges — one per contributing source.
  const freshness = await buildFreshness(Array.from(contributingTools), evidence, connectedSet);

  // 8) Declarations to display: those whose scope this answer touched.
  const declsShown = declRows.rows.filter((d) => {
    const sc = (d.scope ?? "").toLowerCase();
    for (const scope of Array.from(touchedScopes)) {
      if (sc.includes(scope.split(" ")[0])) return true;
    }
    return false;
  });

  // 9) Evidence hash — the belief-cache key. Folds in the normalized question,
  //    the connected-source set, the exact passages, and the governing
  //    declarations. Any change to any of these changes the key.
  const evidenceHash = hashEvidence(question, connected, evidence, declsShown);

  return {
    question,
    connectedTools: connected,
    matchedEntities: chosen.map(displayLabel),
    evidence,
    resolved,
    conflicts,
    freshness,
    declarations: declsShown,
    degraded,
    evidenceHash,
  };
}

/* ------------------------------------------------------------------ */
/* Arbitration helpers                                                */
/* ------------------------------------------------------------------ */

function distinctSources(values: ValueGroup[]): number {
  const s = new Set<SourceTool>();
  for (const v of values) for (const t of Array.from(v.sources.keys())) s.add(t);
  return s.size;
}

function arbitrate(
  attr: CanonicalAttribute,
  values: ValueGroup[],
  ratified: { statement: string; scope: string | null }[],
  forcedCanonical?: string | null
): { winner: ValueGroup; basis: "declaration" | "corroboration" | "freshness" | "override" } {
  // Single value → it wins trivially (basis unused when not conflicted).
  if (values.length === 1) return { winner: values[0], basis: "corroboration" };

  // 0) Human override — a reverted arbitration in the decision log forces a
  //    specific value to win, regardless of the automatic rules.
  if (forcedCanonical) {
    const forced = values.find((v) => v.canonical === forcedCanonical);
    if (forced) return { winner: forced, basis: "override" };
  }

  const scope = SCOPE_FOR[attr];

  // 1) Declaration — a ratified system-of-record wins outright for its scope.
  if (scope.keyword) {
    const gov = ratified.find((d) => (d.scope ?? "").toLowerCase().includes(scope.keyword!));
    const sorTool = gov ? sorToolFromStatement(gov.statement) : null;
    if (sorTool) {
      const winner = values.find((v) => v.sources.has(sorTool));
      if (winner) return { winner, basis: "declaration" };
    }
  }

  // 2) Corroboration — the value the most independent sources agree on.
  const byCorrob = [...values].sort((a, b) => b.sources.size - a.sources.size);
  if (byCorrob[0].sources.size > (byCorrob[1]?.sources.size ?? 0)) {
    return { winner: byCorrob[0], basis: "corroboration" };
  }

  // 3) Freshness — newest value wins.
  const newestOf = (v: ValueGroup) =>
    Array.from(v.sources.values()).map((s) => s.ts ?? "").sort().pop() ?? "";
  const byFresh = [...values].sort((a, b) => newestOf(b).localeCompare(newestOf(a)));
  return { winner: byFresh[0], basis: "freshness" };
}

function buildConflictBlock(
  entity: string,
  attr: CanonicalAttribute,
  values: ValueGroup[],
  decision: { winner: ValueGroup; basis: "declaration" | "corroboration" | "freshness" | "override" }
): ConflictBlock {
  const label = ATTR_LABEL[attr];
  const views: ConflictValueView[] = values
    .map((v) => {
      const srcs = Array.from(v.sources.entries()).map(([tool, s]) => ({
        tool,
        label: SOURCE_LABEL[tool],
        doc: s.doc,
        date: s.ts,
        age: humaneAge(s.ts, SNAPSHOT),
      }));
      return { display: v.display, sources: srcs, isWinner: v === decision.winner };
    })
    .sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  const winnerTools = Array.from(decision.winner.sources.keys());
  const losers = values.filter((v) => v !== decision.winner);
  const scope = SCOPE_FOR[attr];

  let rule: string;
  if (decision.basis === "override") {
    const otherText = losers
      .map((o) => `${sourceList(Array.from(o.sources.keys()))}'s ${o.display}`)
      .join(" and ");
    rule =
      `Showing ${decision.winner.display} — you overrode this decision in the log, ` +
      `choosing it over ${otherText || "the alternative"}. TrustLayer's automatic pick has been set aside.`;
  } else if (decision.basis === "declaration") {
    const sorTool = winnerTools.find((t) => t === "spreadsheet") ?? winnerTools[0];
    const winAge = humaneAge(
      Array.from(decision.winner.sources.values()).map((s) => s.ts ?? "").sort().pop() ?? null,
      SNAPSHOT
    );
    const otherText = capitalize(
      losers
        .map((o) => `${sourceList(Array.from(o.sources.keys()))} shows ${o.display}`)
        .join("; ")
    );
    rule =
      `Showing ${decision.winner.display} from ${SOURCE_LABEL[sorTool]} — your ratified system of record ` +
      `for ${scope.label ?? label} (edited ${winAge}). ${otherText}, but the declared source governs.`;
  } else if (decision.basis === "corroboration") {
    const otherText = losers
      .map((o) => `${sourceList(Array.from(o.sources.keys()))}'s ${o.display}`)
      .join(" and ");
    rule =
      `${decision.winner.sources.size} independent sources agree on ${decision.winner.display} ` +
      `(${sourceList(winnerTools)}); ${otherText} stands alone.`;
  } else {
    const winAge = humaneAge(
      Array.from(decision.winner.sources.values()).map((s) => s.ts ?? "").sort().pop() ?? null,
      SNAPSHOT
    );
    const loser = losers[0];
    const loseAge = loser
      ? humaneAge(Array.from(loser.sources.values()).map((s) => s.ts ?? "").sort().pop() ?? null, SNAPSHOT)
      : "older";
    rule =
      `Showing ${decision.winner.display} from ${sourceList(winnerTools)} (${winAge}); ` +
      `${loser ? sourceList(Array.from(loser.sources.keys())) : "the other source"}'s ` +
      `${loser?.display ?? ""} is ${loseAge}.`;
  }

  return {
    entity,
    attributeLabel: label,
    winnerDisplay: decision.winner.display,
    basis: decision.basis,
    rule,
    values: views,
  };
}

/* ------------------------------------------------------------------ */
/* Freshness badges                                                   */
/* ------------------------------------------------------------------ */

type FreshRow = {
  source: string;
  artifact_type: string;
  volatility: FreshnessBadge["volatility"];
  staleness_tier: FreshnessBadge["tier"];
};

function freshnessState(volatility: FreshnessBadge["volatility"], ageDays: number): FreshnessBadge["state"] {
  if (ageDays < 0) return "fresh";
  switch (volatility) {
    case "live":
      return ageDays < 2 ? "fresh" : ageDays < 14 ? "aging" : "stale";
    case "days":
      return ageDays < 14 ? "fresh" : ageDays < 45 ? "aging" : "stale";
    case "months":
      return ageDays < 120 ? "fresh" : ageDays < 240 ? "aging" : "stale";
    case "stable":
      return "fresh";
  }
}

async function buildFreshness(
  tools: SourceTool[],
  evidence: EvidenceItem[],
  connectedSet: Set<SourceTool>
): Promise<FreshnessBadge[]> {
  if (tools.length === 0) return [];
  const { rows: policy } = await query<FreshRow>(
    `select source, artifact_type, volatility, staleness_tier from freshness_table`
  );

  // The Sheet badge is computed from its REAL last-modified time (Drive
  // metadata), aged vs real wall-clock — not the fixture snapshot.
  let sheetModified: string | null = null;
  let sheetLive = false;
  if (tools.includes("spreadsheet") && connectedSet.has("spreadsheet")) {
    try {
      const r = await loadRenewals();
      sheetModified = r.lastModified;
      sheetLive = r.source === "live";
    } catch {
      /* fall back to snapshot-aged badge below */
    }
  }

  const badges: FreshnessBadge[] = [];
  const order: SourceTool[] = ["spreadsheet", "crm", "email", "calls"];
  for (const tool of order.filter((t) => tools.includes(t))) {
    // Pick the freshness policy row for this source that best matches the
    // attributes this answer touched.
    const touchedAttrs = new Set(evidence.filter((e) => e.sourceTool === tool).map((e) => e.attributeLabel));
    const rowsForSource = policy.filter((p) => p.source === FRESHNESS_SOURCE[tool]);
    const row =
      rowsForSource.find((p) => Array.from(touchedAttrs).some((a) => p.artifact_type.includes(a.split(" ")[0]))) ??
      rowsForSource[0];

    const volatility = row?.volatility ?? (tool === "spreadsheet" ? "days" : "months");
    const tier = row?.staleness_tier ?? "high";
    const artifact = row?.artifact_type ?? "records";

    if (tool === "spreadsheet" && sheetModified) {
      const ageDays = Math.round((Date.now() - new Date(sheetModified).getTime()) / 86_400_000);
      badges.push({
        sourceTool: tool,
        sourceLabel: SOURCE_LABEL[tool],
        artifact,
        ageText: realAge(sheetModified),
        tier,
        volatility,
        state: freshnessState(volatility, ageDays),
        real: true,
        note: sheetLive ? "read live from Google Sheets" : "from the cached sheet copy",
      });
      continue;
    }

    // Other sources: age from the newest contributing passage vs the snapshot.
    // Ignore timestamps in the FUTURE relative to the snapshot — those are event
    // dates (e.g. a deal's close_date), not edit-recency signals, and would make
    // a stale source read as fresh.
    const snapIso = SNAPSHOT.toISOString();
    const newest = evidence
      .filter((e) => e.sourceTool === tool)
      .map((e) => e.docTimestamp)
      .filter((t): t is string => Boolean(t) && (t as string) <= snapIso)
      .sort()
      .pop() as string | undefined;
    const ageDays =
      newest != null ? Math.round((SNAPSHOT.getTime() - new Date(newest).getTime()) / 86_400_000) : -1;
    badges.push({
      sourceTool: tool,
      sourceLabel: SOURCE_LABEL[tool],
      artifact,
      ageText: newest ? humaneAge(newest, SNAPSHOT) : "undated",
      tier,
      volatility,
      state: freshnessState(volatility, ageDays),
      real: false,
    });
  }
  return badges;
}

// Age of a REAL timestamp vs real wall-clock (used only for the live Sheet).
function realAge(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 0) return `edited ${iso.slice(0, 10)}`;
  if (days === 0) return "edited today";
  if (days === 1) return "edited yesterday";
  if (days < 45) return `edited ${days} days ago`;
  const months = Math.round(days / 30);
  return `edited ~${months} month${months === 1 ? "" : "s"} ago`;
}

/* ------------------------------------------------------------------ */
/* Evidence hash + empty result                                       */
/* ------------------------------------------------------------------ */

function hashEvidence(
  question: string,
  connected: SourceTool[],
  evidence: EvidenceItem[],
  declarations: { statement: string; status: string }[]
): string {
  const payload = JSON.stringify({
    q: question.trim().toLowerCase().replace(/\s+/g, " "),
    connected: [...connected].sort(),
    ev: evidence.map((e) => e.contentHash).sort(),
    decl: declarations.map((d) => `${d.status}:${d.statement}`).sort(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function emptyRetrieval(question: string, connected: SourceTool[]): Retrieval {
  return {
    question,
    connectedTools: connected,
    matchedEntities: [],
    evidence: [],
    resolved: [],
    conflicts: [],
    freshness: [],
    declarations: [],
    degraded:
      connected.length === 0
        ? "Every source is disconnected. Reconnect at least one source on /admin to answer questions."
        : null,
    evidenceHash: hashEvidence(question, connected, [], []),
  };
}

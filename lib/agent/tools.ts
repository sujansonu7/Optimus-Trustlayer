// Server-only: the agent's toolset and the session-local evidence pool.
//
// FOUR TOOLS, all READ-ONLY over knowledge (they never write a fact, declaration,
// or conflict — the agent cannot change what TrustLayer knows, only read it and
// draft from it):
//
//   * query_graph          — the workhorse. Wraps the Ask retrieval so a sub-query
//                            returns the SAME envelope: arbitrated current values,
//                            the exact citable passages, conflicts, freshness, and
//                            governing declarations. Always envelope-carrying.
//   * read_source_passage  — read the raw text of one email/transcript to ground
//                            exact wording. Context only; not a new citation.
//   * list_conflicts       — discovery: which accounts have disagreements right now.
//   * draft_document       — TERMINAL. Assemble the brief. Every claim must cite
//                            evidence ids the run actually pulled; uncited claims
//                            and dangling ids are dropped in code (same discipline
//                            as lib/ask/synthesize.ts). Produces the work product.
//
// The evidence pool is the run's memory of citable facts. It lives only for the
// duration of one agent run (in this object), keyed by content hash so the same
// fact pulled by two queries keeps one stable, session-global citation id. When
// the run ends, this object is discarded — no knowledge state survives here.
import fs from "node:fs";
import path from "node:path";
import { retrieve } from "@/lib/ask/retrieve";
import { detectConflicts } from "@/lib/conflicts/detect";
import { SOURCE_SHORT } from "@/lib/ask/types";
import type {
  EvidenceItem,
  ConflictBlock,
  FreshnessBadge,
  SourceTool,
  WorkProduct,
  BriefSection,
} from "./types";

const FIXTURE_DIR = path.join(process.cwd(), "fixture");

/* ------------------------------------------------------------------ */
/* The run's evidence pool + envelope accumulators                     */
/* ------------------------------------------------------------------ */

export class Session {
  readonly connected: SourceTool[];
  readonly disconnected: SourceTool[];

  // Citable evidence, keyed by content hash -> a stable session-global id.
  private byHash = new Map<string, EvidenceItem>();
  private ordered: EvidenceItem[] = [];
  private nextId = 0;

  // Envelope accumulators, deduped as tools run.
  private conflicts = new Map<string, ConflictBlock>();
  private freshness = new Map<SourceTool, FreshnessBadge>();
  private declarations = new Map<string, { statement: string; scope: string | null; status: string }>();

  constructor(connected: SourceTool[], disconnected: SourceTool[]) {
    this.connected = connected;
    this.disconnected = disconnected;
  }

  /** Merge one retrieved evidence item, returning its stable session id. */
  private mergeEvidence(e: EvidenceItem): number {
    const existing = this.byHash.get(e.contentHash);
    if (existing) return existing.id;
    const item: EvidenceItem = { ...e, id: this.nextId++ };
    this.byHash.set(e.contentHash, item);
    this.ordered.push(item);
    return item.id;
  }

  mergeConflict(c: ConflictBlock): void {
    this.conflicts.set(`${c.entity}::${c.attributeLabel}`, c);
  }

  mergeFreshness(f: FreshnessBadge): void {
    if (!this.freshness.has(f.sourceTool)) this.freshness.set(f.sourceTool, f);
  }

  mergeDeclaration(d: { statement: string; scope: string | null; status: string }): void {
    this.declarations.set(d.statement, d);
  }

  /** All citable evidence pulled so far, in id order. */
  evidence(): EvidenceItem[] {
    return this.ordered.slice();
  }

  hasEvidenceId(id: number): boolean {
    return id >= 0 && id < this.ordered.length;
  }

  /** Fold a full Retrieval into the pool + accumulators; return the new ids. */
  absorb(r: {
    evidence: EvidenceItem[];
    conflicts: ConflictBlock[];
    freshness: FreshnessBadge[];
    declarations: { statement: string; scope: string | null; status: string }[];
  }): number[] {
    const ids = r.evidence.map((e) => this.mergeEvidence(e));
    r.conflicts.forEach((c) => this.mergeConflict(c));
    r.freshness.forEach((f) => this.mergeFreshness(f));
    r.declarations.forEach((d) => this.mergeDeclaration(d));
    return ids;
  }

  envelope(): Pick<
    WorkProduct,
    "evidence" | "conflicts" | "freshness" | "declarations" | "connectedTools" | "disconnectedTools"
  > {
    return {
      evidence: this.evidence(),
      conflicts: Array.from(this.conflicts.values()),
      freshness: Array.from(this.freshness.values()),
      declarations: Array.from(this.declarations.values()),
      connectedTools: this.connected,
      disconnectedTools: this.disconnected,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Tool schemas (Anthropic tool-use format)                            */
/* ------------------------------------------------------------------ */

export const AGENT_TOOLS = [
  {
    name: "query_graph",
    description:
      "Ask the knowledge graph a focused sub-question and get back the grounded envelope: the arbitrated current values, the exact citable source passages (each with an evidence id), any conflicts, freshness, and governing declarations. Use this to gather the facts you need. Only currently-connected sources are readable. Call it several times with narrow queries (one account/topic each) rather than one broad query.",
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "A focused natural-language query, e.g. 'Silverline renewal date and owner' or 'Nova Materials ARR'. Name the account.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_source_passage",
    description:
      "Read the raw text of one source document (an email or a call transcript) to check exact wording or surrounding context. Use the sourceDoc value shown in an evidence item (e.g. 'emails/2026-02-05_terranova_01_renewal.txt'). This is for grounding your wording; cite facts by their evidence id from query_graph, not this.",
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        doc: {
          type: "string",
          description: "The document path, e.g. 'emails/xxx.txt' or 'transcripts/xxx.txt'.",
        },
        contains: {
          type: ["string", "null"],
          description: "Optional: a phrase to locate; the window around it is returned instead of the whole file.",
        },
      },
      required: ["doc"],
    },
  },
  {
    name: "list_conflicts",
    description:
      "List the accounts that currently have unresolved source disagreements (renewal date, ARR, owner, etc.), with the arbitrated winner and the governing rule. Use it to discover what to flag. Optionally filter to one account.",
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        entity: {
          type: ["string", "null"],
          description: "Optional account name to filter to, e.g. 'Silverline'. Null lists the whole book.",
        },
      },
      required: [],
    },
  },
  {
    name: "draft_document",
    description:
      "FINISH the task by assembling the work product. Provide a FLAT list of claims — each claim has a section label, its text, and the evidence id(s) from query_graph that support it. Claims are grouped into sections by their label. EVERY claim must cite at least one evidence id — a claim with no citation is dropped. Add plain-English risk flags for anything uncertain or conflicting. Call this exactly once, at the end, with the COMPLETE brief filled in — never an empty or placeholder draft.",
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Short brief title, e.g. 'Silverline renewal — call prep'." },
        entity: { type: ["string", "null"], description: "The primary account the brief is about, or null." },
        summary: {
          type: "string",
          description: "A 1–2 sentence executive summary the reader sees first.",
        },
        claims: {
          type: "array",
          description:
            "A FLAT list of the brief's atomic claims. Each claim names the section it belongs to, its text, and the evidence ids that support it. Claims sharing a section label are grouped together, in first-seen order.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              section: {
                type: "string",
                description: "The section heading this claim belongs under, e.g. 'Account basics' or 'Risks'.",
              },
              text: { type: "string", description: "one atomic statement" },
              evidence: {
                type: "array",
                items: { type: "integer" },
                description: "evidence ids from query_graph that directly support this statement",
              },
            },
            required: ["section", "text", "evidence"],
          },
        },
        risks: {
          type: "array",
          items: { type: "string" },
          description: "Plain-English flags: conflicts, stale sources, disconnected systems of record.",
        },
      },
      required: ["title", "summary", "claims"],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Executors                                                           */
/* ------------------------------------------------------------------ */

export type ToolOutcome = {
  /** JSON/text handed back to the model as the tool_result. */
  modelResult: string;
  /** One-line human summary streamed to the screen. */
  summary: string;
  /** Present only for draft_document — the assembled work product ends the run. */
  workProduct?: WorkProduct;
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: Session,
  request: string,
  generatedAt: string
): Promise<ToolOutcome> {
  switch (name) {
    case "query_graph":
      return queryGraph(input, ctx);
    case "read_source_passage":
      return readSourcePassage(input);
    case "list_conflicts":
      return listConflicts(input);
    case "draft_document":
      return draftDocument(input, ctx, request, generatedAt);
    default:
      return { modelResult: `Unknown tool "${name}".`, summary: `Unknown tool "${name}"` };
  }
}

function trimQuote(s: string | null, max = 220): string {
  if (!s) return "";
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

async function queryGraph(input: Record<string, unknown>, ctx: Session): Promise<ToolOutcome> {
  const query = String(input.query ?? "").trim();
  if (!query) return { modelResult: "Provide a non-empty query.", summary: "query_graph: empty query" };

  const r = await retrieve(query, ctx.connected);
  const ids = ctx.absorb(r);

  // Render an id-keyed view for the model. ids[i] is the session-global id of
  // r.evidence[i]; show that id so the model cites the pool, not local indices.
  const evLines = r.evidence.map((e, i) => {
    const tag = e.status === "winner" ? " [WINNER]" : e.status === "superseded" ? " [SUPERSEDED]" : "";
    return {
      id: ids[i],
      about: e.entity,
      attribute: e.attributeLabel,
      value: e.display + tag,
      source: SOURCE_SHORT[e.sourceTool],
      doc: e.sourceDoc,
      dated: e.docTimestamp ? e.docTimestamp.slice(0, 10) : null,
      passage: trimQuote(e.sourceQuote),
    };
  });

  const resolved = r.resolved.map((rf) => ({
    about: rf.entity,
    attribute: rf.attributeLabel,
    current: rf.currentValue,
    conflicted: rf.conflicted,
  }));

  const payload = {
    matchedEntities: r.matchedEntities,
    resolvedCurrentValues: resolved,
    evidence: evLines,
    conflicts: r.conflicts.map((c) => ({
      about: c.entity,
      attribute: c.attributeLabel,
      winner: c.winnerDisplay,
      basis: c.basis,
      rule: c.rule,
    })),
    freshness: r.freshness.map((f) => ({ source: SOURCE_SHORT[f.sourceTool], artifact: f.artifact, age: f.ageText, state: f.state })),
    declarations: r.declarations.map((d) => ({ statement: d.statement, status: d.status })),
    degraded: r.degraded,
    note:
      r.evidence.length === 0
        ? "No matching evidence in the connected sources for this query."
        : "Cite facts by their evidence id.",
  };

  const entityText = r.matchedEntities.length ? r.matchedEntities.join(", ") : "no match";
  const conflictText = r.conflicts.length ? ` · ${r.conflicts.length} conflict${r.conflicts.length === 1 ? "" : "s"}` : "";
  const summary = `query_graph "${query}" → ${r.evidence.length} fact${r.evidence.length === 1 ? "" : "s"} on ${entityText}${conflictText}`;

  return { modelResult: JSON.stringify(payload, null, 2), summary };
}

async function readSourcePassage(input: Record<string, unknown>): Promise<ToolOutcome> {
  const doc = String(input.doc ?? "").trim();
  const contains = typeof input.contains === "string" ? input.contains.trim() : "";

  // Same allowlist as /api/source: only verbatim-quote sources, no traversal.
  const m = doc.match(/^(emails|transcripts)\/([A-Za-z0-9._-]+\.txt)$/);
  if (!m || m[2].includes("..")) {
    return {
      modelResult: `Cannot read "${doc}". Only emails/<name>.txt and transcripts/<name>.txt are readable.`,
      summary: `read_source_passage: refused "${doc}"`,
    };
  }
  const full = path.join(FIXTURE_DIR, m[1], m[2]);
  if (!full.startsWith(FIXTURE_DIR + path.sep)) {
    return { modelResult: `Cannot read "${doc}".`, summary: `read_source_passage: refused "${doc}"` };
  }

  let text: string;
  try {
    text = fs.readFileSync(full, "utf8");
  } catch {
    return { modelResult: `Document "${doc}" not found.`, summary: `read_source_passage: not found "${doc}"` };
  }

  let excerpt = text;
  let window = "";
  if (contains) {
    const idx = text.toLowerCase().indexOf(contains.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 300);
      const end = Math.min(text.length, idx + contains.length + 300);
      excerpt = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
      window = ` around "${contains}"`;
    }
  }
  // Bound the payload.
  if (excerpt.length > 4000) excerpt = excerpt.slice(0, 4000) + "\n…(truncated)";

  return {
    modelResult: `${doc}:\n\n${excerpt}`,
    summary: `read_source_passage: ${doc}${window} (${text.length.toLocaleString()} chars)`,
  };
}

async function listConflicts(input: Record<string, unknown>): Promise<ToolOutcome> {
  const filter = typeof input.entity === "string" ? input.entity.trim().toLowerCase() : "";
  const report = await detectConflicts();
  let conflicts = report.conflicts;
  if (filter) {
    conflicts = conflicts.filter(
      (c) => c.entityLabel.toLowerCase().includes(filter) || c.entityKey.includes(filter)
    );
  }

  const payload = conflicts.map((c) => ({
    about: c.entityLabel,
    attribute: c.attributeLabel,
    winner: c.winnerDisplay,
    basis: c.ruleBasis,
    rule: c.rule,
    severity: c.severity,
    values: c.values.map((v) => ({ value: v.display, sources: v.sources.map((s) => SOURCE_SHORT[s.tool]), isWinner: v.isWinner })),
  }));

  const summary =
    conflicts.length === 0
      ? filter
        ? `list_conflicts: none for "${input.entity}"`
        : "list_conflicts: no open conflicts"
      : `list_conflicts → ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}: ${conflicts
          .slice(0, 4)
          .map((c) => `${c.entityLabel} ${c.attributeLabel}`)
          .join(", ")}${conflicts.length > 4 ? "…" : ""}`;

  return {
    modelResult: JSON.stringify(
      { conflicts: payload, note: "To cite these facts in the brief, pull the account with query_graph." },
      null,
      2
    ),
    summary,
  };
}

// Tool inputs arrive as JSON, but models sometimes hand a nested array back as a
// JSON-ENCODED STRING (e.g. sections: "[{...}]") instead of a real array. Accept
// both so a well-populated draft is never wrongly rejected as empty.
// Models occasionally HTML-escape text in tool inputs (e.g. "Owner &amp; Renewal"),
// which would then render literally. Decode the handful of common entities so the
// brief reads cleanly.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function draftDocument(
  input: Record<string, unknown>,
  ctx: Session,
  request: string,
  generatedAt: string
): ToolOutcome {
  const title = decodeEntities(String(input.title ?? "Untitled brief").trim()) || "Untitled brief";
  const entity = typeof input.entity === "string" && input.entity.trim() ? decodeEntities(input.entity.trim()) : null;
  const summary = decodeEntities(String(input.summary ?? "").trim());
  const risks = asArray(input.risks)
    .map((x) => decodeEntities(String(x).trim()))
    .filter(Boolean);

  // Ground the brief in CODE: keep only claims whose citations point at real
  // evidence the run actually pulled. Uncited claims are dropped. Claims arrive
  // as a FLAT list; group them into sections by their label, first-seen order.
  const rawClaims = asArray(input.claims);
  const bySection = new Map<string, BriefSection["claims"]>();
  const sectionOrder: string[] = [];
  let keptClaims = 0;
  let droppedClaims = 0;
  for (const rc of rawClaims) {
    const c = rc as { section?: unknown; text?: unknown; evidence?: unknown };
    const text = decodeEntities(String(c.text ?? "").trim());
    if (!text) continue;
    const section = decodeEntities(String(c.section ?? "").trim()) || "Details";
    const evidence = Array.from(
      new Set(
        asArray(c.evidence)
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && ctx.hasEvidenceId(n))
      )
    );
    if (evidence.length === 0) {
      droppedClaims++;
      continue; // an uncited claim never makes it into the brief
    }
    if (!bySection.has(section)) {
      bySection.set(section, []);
      sectionOrder.push(section);
    }
    bySection.get(section)!.push({ text, evidence });
    keptClaims++;
  }
  const sections: BriefSection[] = sectionOrder
    .map((heading) => ({ heading, claims: bySection.get(heading)! }))
    .filter((s) => s.claims.length > 0);

  // An empty brief is never saved. Reject it and ask the model to try again with
  // real, cited claims — so a bad first draft can't become the delivered product.
  if (sections.length === 0) {
    return {
      modelResult: `The draft had no valid cited claims${
        droppedClaims > 0 ? ` (${droppedClaims} claim(s) cited no real evidence id and were dropped)` : ""
      }, so nothing was saved. Call draft_document again with sections whose claims cite the evidence ids returned by query_graph.`,
      summary: `draft_document → rejected: no cited claims${droppedClaims > 0 ? ` (dropped ${droppedClaims})` : ""}`,
    };
  }

  const env = ctx.envelope();
  const workProduct: WorkProduct = {
    title,
    entity,
    request,
    summary,
    sections,
    risks,
    ...env,
    generatedAt,
  };

  const dropNote = droppedClaims > 0 ? ` (dropped ${droppedClaims} uncited)` : "";
  return {
    modelResult: `Work product "${title}" assembled with ${keptClaims} cited claim${keptClaims === 1 ? "" : "s"} across ${sections.length} section${sections.length === 1 ? "" : "s"}${dropNote}. It has been saved to the Library. You are done — reply with a one-line confirmation.`,
    summary: `draft_document → "${title}": ${sections.length} section${sections.length === 1 ? "" : "s"}, ${keptClaims} cited claim${keptClaims === 1 ? "" : "s"}${dropNote}`,
    workProduct,
  };
}

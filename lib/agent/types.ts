// Shared agent types. Like lib/ask/types.ts, this file is free of server-only
// imports (no pg, fs, anthropic) so client components can `import type` from it.
//
// The agent reuses the Ask envelope's atoms — EvidenceItem, ConflictBlock,
// FreshnessBadge — so a work product's citations render exactly like an Ask
// answer's. A brief is just a longer, multi-section, enveloped answer.

import type {
  EvidenceItem,
  ConflictBlock,
  FreshnessBadge,
  SourceTool,
} from "@/lib/ask/types";

export type { EvidenceItem, ConflictBlock, FreshnessBadge, SourceTool };

/** The tools the agent can pick from. */
export type AgentToolName =
  | "query_graph"
  | "read_source_passage"
  | "list_conflicts"
  | "execute_python"
  | "draft_document";

/** One streamed step of visible work. */
export type StepKind = "thought" | "tool_call" | "tool_result" | "final" | "error";

export type AgentStep = {
  seq: number;
  kind: StepKind;
  toolName?: AgentToolName | null;
  input?: unknown; // tool inputs, shown verbatim on tool_call
  summary: string; // the one-line human-readable summary shown live
  // For an execute_python tool_result: what the code printed and the charts it
  // drew, shown inline in the live timeline. Emitted to the browser but NOT
  // persisted to agent_steps — the durable copy lives on the work product's
  // computations.
  stdout?: string;
  charts?: ChartImage[];
};

/** A chart image (base64 PNG/JPEG) rendered inline as a data URI. */
export type ChartImage = {
  mime: string; // "image/png"
  base64: string; // raw base64, no data: prefix
};

/**
 * One code run the agent did: the Python it wrote, what it printed, any error,
 * the charts it drew, and the evidence ids whose numbers it computed over. This
 * is what makes compute auditable — code, output, and every number's source are
 * all on the work product.
 */
export type Computation = {
  label: string; // short human label, e.g. "Pipeline by stage"
  runner: string; // which sandbox ran it, e.g. "E2B"
  code: string; // the exact Python the agent ran
  stdout: string; // everything it printed
  stderr: string; // warnings / stderr, if any
  error: string | null; // a Python traceback, when the run failed
  charts: ChartImage[]; // figures it produced
  evidenceIds: number[]; // evidence pool ids backing the numbers it used
  durationMs: number; // wall-clock of the sandbox run
};

/** One cited statement inside a brief — same shape as an Ask claim. */
export type BriefClaim = {
  text: string;
  evidence: number[]; // ids into WorkProduct.evidence
};

export type BriefSection = {
  heading: string;
  claims: BriefClaim[];
};

/**
 * A work product: a formatted brief whose every claim carries envelope
 * citations. Saved to /library. This is what draft_document produces and what
 * the work-product page renders.
 */
export type WorkProduct = {
  title: string;
  entity: string | null;
  request: string; // the original request
  summary: string; // 1–2 sentence executive summary
  sections: BriefSection[];
  computations: Computation[]; // code the agent ran + its output and charts
  risks: string[]; // plain-English flags ("sources disagree on the renewal date")
  // The shared envelope, accumulated across the run:
  evidence: EvidenceItem[]; // the citable pool (session-global ids)
  conflicts: ConflictBlock[]; // conflicts touched by the brief
  freshness: FreshnessBadge[]; // freshness of contributing sources
  declarations: { statement: string; scope: string | null; status: string }[];
  connectedTools: SourceTool[];
  disconnectedTools: SourceTool[];
  generatedAt: string; // ISO timestamp the brief was assembled
};

/** A saved library row (list + detail views). */
export type WorkProductRow = {
  id: string;
  title: string;
  entity: string | null;
  request: string;
  createdAt: string;
  body: WorkProduct;
};

/** Classification of an incoming request. */
export type AskMode = "simple" | "work";

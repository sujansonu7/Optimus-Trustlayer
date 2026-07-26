// Shared /crew types. Like lib/ask/types.ts and lib/agent/types.ts, this file is
// free of server-only imports (no pg, fs, anthropic) so client components can
// `import type` from it.
//
// A crew RUN is one delegated brain-dump. Triage splits it into WORKSTREAMS —
// each either answered INLINE (trivial, no agent) or dispatched as a governed
// BRIEF. The brief reuses the Ask/agent envelope atoms (EvidenceItem, Conflict,
// Freshness) so its cited context renders exactly like an answer's.

import type {
  EvidenceItem,
  ConflictBlock,
  FreshnessBadge,
  SourceTool,
  BriefClaim,
} from "@/lib/agent/types";

export type { EvidenceItem, ConflictBlock, FreshnessBadge, SourceTool, BriefClaim };

/** Where a card sits on the ledger board. */
export type CrewStatus =
  | "queued" // triaged, waiting to be dispatched
  | "running" // an agent session is working it right now
  | "needs_input" // finished with no deliverable / blocked — a human must step in
  | "review" // a brief was produced; awaiting the owner's brief-quality tap
  | "done" // delivered and rated
  | "inline"; // trivial — answered at triage, no agent

export type CrewKind = "workstream" | "inline";

/** The one-tap brief-quality signal. */
export type BriefQuality = "no_correction" | "correction";

/**
 * What triage proposes for one item, before any dispatch. `depends_on` holds the
 * seqs of workstreams that must finish first (so the QBR agenda waits on the
 * renewal prep it summarizes).
 */
export type TriageItem = {
  title: string;
  goal: string;
  kind: CrewKind;
  inlineAnswer: string | null; // set only when kind === 'inline'
  constraints: string[];
  doneCriteria: string[];
  dependsOn: number[]; // seqs (indices) of prerequisite workstreams
};

export type TriageResult = {
  items: TriageItem[];
  note: string | null; // triage's one-line reading of the brain-dump
};

/**
 * The assembled brief — THE PRODUCT of the assembly step. Goal + the arbitrated
 * relevant context (each line cited to source passages) + constraints +
 * done-criteria, carrying the full envelope so citations, conflicts, freshness,
 * and governing canon render inline.
 */
export type CrewBrief = {
  goal: string;
  /** Arbitrated relevant context, each line cited (same shape as a brief claim). */
  context: BriefClaim[];
  constraints: string[];
  doneCriteria: string[];
  matchedEntities: string[];
  // The shared envelope backing the citations above:
  evidence: EvidenceItem[];
  conflicts: ConflictBlock[];
  freshness: FreshnessBadge[];
  declarations: { statement: string; scope: string | null; status: string }[];
  connectedTools: SourceTool[];
  disconnectedTools: SourceTool[];
  /** A caveat when the graph had nothing to say about this workstream. */
  note: string | null;
};

/** One card on the ledger board (list + detail). */
export type CrewWorkstream = {
  id: string;
  runId: string;
  seq: number;
  title: string;
  goal: string;
  kind: CrewKind;
  inlineAnswer: string | null;
  constraints: string[];
  doneCriteria: string[];
  dependsOn: number[];
  brief: CrewBrief | null;
  status: CrewStatus;
  sessionId: string | null;
  workProductId: string | null;
  quality: BriefQuality | null;
  error: string | null;
};

/** A full run with its board. */
export type CrewRun = {
  id: string;
  brainDump: string;
  status: "triaged" | "dispatching" | "done";
  createdAt: string;
  workstreams: CrewWorkstream[];
};

/** Running brief-quality instrumentation, shown on /admin. */
export type BriefQualityStats = {
  rated: number; // briefs the owner tapped a verdict on
  noCorrection: number; // of those, how many needed no correction
  correction: number; // of those, how many needed correction
  pct: number | null; // noCorrection / rated * 100, or null when nothing rated yet
};

/** The five ledger columns, in board order. */
export const BOARD_COLUMNS: { status: CrewStatus; label: string }[] = [
  { status: "queued", label: "Queued" },
  { status: "running", label: "Running" },
  { status: "needs_input", label: "Needs input" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

/** Max concurrent agent sessions when the Parallel toggle is on. */
export const MAX_PARALLEL = 2;

/** The no-correction rate (%) parallel dispatch requires. */
export const PARALLEL_QUALITY_BAR = 80;

/** How many rated briefs make the quality signal "sustained" — the sample size
 *  behind the bar. Enforces the rollout rule: run enough real delegations before
 *  trusting the percentage. */
export const PARALLEL_MIN_RATED = 10;

/**
 * The parallel-dispatch gate: enable ONLY at a sustained ≥ bar. Both conditions
 * must hold — a big enough sample (≥ PARALLEL_MIN_RATED rated briefs) AND a
 * no-correction rate at or above the bar. This is the single source of truth the
 * toggle (client) and the action (server) both check.
 */
export function parallelUnlocked(stats: BriefQualityStats): boolean {
  return stats.rated >= PARALLEL_MIN_RATED && stats.pct != null && stats.pct >= PARALLEL_QUALITY_BAR;
}

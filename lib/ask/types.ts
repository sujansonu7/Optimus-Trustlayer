// Shared Ask types. Deliberately free of server-only imports (no pg, fs,
// anthropic) so client components can `import type` from here safely.

export type SourceTool = "crm" | "spreadsheet" | "email" | "calls";

/** One retrieved source passage — the atomic unit a claim can cite. */
export type EvidenceItem = {
  id: number; // stable index within one answer, used by claim citations
  entity: string; // the account/person the fact is about (as displayed)
  attribute: string; // raw attribute key
  attributeLabel: string; // human label
  value: string; // value as stored
  display: string; // value the way a human reads it
  sourceTool: SourceTool;
  sourceLabel: string; // "the CRM", "the Renewals Sheet", …
  sourceDoc: string; // the specific document
  docTimestamp: string | null; // ISO date of the source document
  ageText: string; // "4 days before the snapshot", "~8 months old"
  contentHash: string; // hash of the exact passage (feeds the evidence hash)
  sourceQuote: string | null; // the exact passage
  sourceOffset: number | null; // char offset of the passage in its document
  status: "current" | "winner" | "superseded"; // arbitration outcome for its (entity, attribute)
};

/** One atomic, supported statement the answer makes, with its citations. */
export type Claim = {
  text: string;
  evidence: number[]; // ids into EvidenceItem[]
};

/** A freshness badge for one contributing source. */
export type FreshnessBadge = {
  sourceTool: SourceTool;
  sourceLabel: string;
  artifact: string; // e.g. "renewal dates"
  ageText: string; // human age
  tier: "critical" | "high" | "low"; // cost-of-staleness
  volatility: "live" | "days" | "months" | "stable";
  state: "fresh" | "aging" | "stale"; // age vs the volatility window
  real: boolean; // true when computed from a REAL last-modified time (the Sheet)
  note?: string; // e.g. "read live from Google, edited 2 days ago"
};

export type ConflictValueView = {
  display: string;
  sources: {
    tool: SourceTool;
    label: string;
    doc: string;
    date: string | null;
    age: string;
  }[];
  isWinner: boolean;
};

/** An inline conflict block — shown calm/collapsed, proof one click away. */
export type ConflictBlock = {
  entity: string;
  attributeLabel: string;
  winnerDisplay: string;
  basis: "declaration" | "corroboration" | "freshness" | "override";
  rule: string; // one plain-English governing sentence
  values: ConflictValueView[];
};

export type ConfidenceLabel = "High" | "Medium" | "Low";

/** The full answer envelope rendered by the Ask UI. */
export type AskEnvelope = {
  question: string;
  answerable: boolean;
  answer: string; // clean prose synthesis
  claims: Claim[];
  evidence: EvidenceItem[];
  conflicts: ConflictBlock[];
  freshness: FreshnessBadge[];
  declarations: { statement: string; scope: string | null; status: string }[];
  confidence: number; // 0..1
  confidenceLabel: ConfidenceLabel;
  connectedTools: SourceTool[];
  disconnectedTools: SourceTool[];
  degraded: string | null; // banner when a declared system-of-record is disconnected
  note: string | null; // caveats / what could not be answered
  cached: boolean; // served from the belief cache?
  evidenceHash: string; // the cache key that produced this
};

export const SOURCE_LABEL: Record<SourceTool, string> = {
  crm: "the CRM",
  spreadsheet: "the Renewals Sheet",
  email: "email",
  calls: "a call transcript",
};

export const SOURCE_SHORT: Record<SourceTool, string> = {
  crm: "CRM",
  spreadsheet: "Sheet",
  email: "Email",
  calls: "Calls",
};

export const ALL_TOOLS: SourceTool[] = ["crm", "spreadsheet", "email", "calls"];

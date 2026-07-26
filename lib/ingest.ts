// Server-only: the ingestion orchestrator.
//
// Reads every in-scope source, turns each into facts, and writes them to the
// facts ledger with full provenance. Two paths:
//   * CSV / spreadsheet rows  -> mapped to facts DIRECTLY (no LLM, no cost).
//   * emails / transcripts     -> sent to the Anthropic API (see lib/extract).
//
// It is a streaming generator: it yields a progress event for every file and
// every fact, so the /admin page can render the build live. It is also the
// visible "build" reused by onboarding.
//
// Guarantees:
//   * Content-hash cache: a file whose contents are unchanged since the last
//     successful ingest is skipped entirely (no LLM call, no re-write).
//   * Budget guard: LLM extraction stops before cumulative spend exceeds the
//     cap (default $3). CSV mapping is free and always runs.
//   * Append-only: re-ingesting a file supersedes that file's previous facts
//     (never deletes) and inserts fresh ones.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getPool } from "./db";
import { parseCsv, type CsvTable } from "./fixture";
import { loadRenewals } from "./renewals";
import {
  extractFacts,
  usageCost,
  type ExtractedFact,
  type FactType,
} from "./extract";

const FIXTURE_DIR = path.join(process.cwd(), "fixture");
export const DEFAULT_BUDGET_USD = 3.0;

export type SourceTool = "crm" | "spreadsheet" | "email" | "calls";

// A fact ready to be stored. Same shape as an extracted fact, but source_offset
// may be null (CSV rows have no meaningful character offset in a file).
type StoredFact = Omit<ExtractedFact, "source_offset"> & {
  source_offset: number | null;
  doc_timestamp: string | null;
};

export type IngestEvent =
  | { type: "start"; totalDocs: number; budgetUsd: number }
  | { type: "file_start"; doc: string; tool: SourceTool; kind: "csv" | "llm" }
  | { type: "file_skip"; doc: string; tool: SourceTool; factCount: number }
  | {
      type: "fact";
      doc: string;
      entity: string;
      attribute: string;
      value: string;
      factType: FactType;
    }
  | {
      type: "file_done";
      doc: string;
      tool: SourceTool;
      extracted: number;
      rejected: number;
      costUsd: number;
    }
  | { type: "budget_reached"; spentUsd: number; skipped: string[] }
  | {
      type: "done";
      totals: {
        docs: number;
        facts: number;
        rejected: number;
        skippedFiles: number;
        costUsd: number;
      };
    }
  | { type: "error"; doc?: string; message: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** A readable, deterministic one-line rendering of a CSV row = its passage. */
function rowPassage(headers: string[], cells: string[]): string {
  return headers.map((h, i) => `${h}=${cells[i] ?? ""}`).join(" | ");
}

function toIso(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function readTextFile(rel: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, rel), "utf8");
}

function listDir(rel: string): string[] {
  try {
    return fs
      .readdirSync(path.join(FIXTURE_DIR, rel))
      .filter((f) => f.endsWith(".txt"))
      .sort();
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* CSV / spreadsheet -> facts (deterministic, no LLM)                 */
/* ------------------------------------------------------------------ */

type ColFact = {
  col: string;
  attribute: string;
  factType: FactType;
  normalize?: (row: Record<string, string>) => unknown | null;
};

// Turn a parsed table into facts using a per-column spec. entity_name comes
// from `entityCol`; the passage is the whole row; the doc timestamp comes from
// `tsCol` (freshness signal for that record).
function mapCsvTable(
  table: CsvTable,
  opts: { entityCol: string; tsCol: string; specs: ColFact[] }
): StoredFact[] {
  const { headers, rows } = table;
  const idx = (name: string) => headers.indexOf(name);
  const out: StoredFact[] = [];

  for (const cells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));

    const entity = (row[opts.entityCol] ?? "").trim();
    if (!entity) continue;
    const passage = rowPassage(headers, cells);
    const docTs = toIso(row[opts.tsCol]);

    for (const spec of opts.specs) {
      if (idx(spec.col) === -1) continue;
      const value = (row[spec.col] ?? "").trim();
      if (!value) continue;
      out.push({
        fact_type: spec.factType,
        entity_name: entity,
        attribute: spec.attribute,
        value,
        value_json: spec.normalize ? spec.normalize(row) : null,
        source_quote: passage,
        source_offset: null,
        doc_timestamp: docTs,
      });
    }
  }
  return out;
}

function crmAccountsFacts(text: string): StoredFact[] {
  return mapCsvTable(parseCsv(text), {
    entityCol: "account_name",
    tsCol: "last_activity_date",
    specs: [
      { col: "account_owner", attribute: "owner", factType: "account" },
      { col: "tier", attribute: "tier", factType: "account" },
      { col: "industry", attribute: "industry", factType: "account" },
      { col: "status", attribute: "status", factType: "account" },
      {
        col: "arr_usd",
        attribute: "arr_usd",
        factType: "pricing",
        normalize: (r) => ({ amount_usd: Number(r.arr_usd) || r.arr_usd }),
      },
      {
        col: "renewal_date",
        attribute: "renewal_date",
        factType: "renewal",
        normalize: (r) => ({ date: r.renewal_date }),
      },
      {
        col: "primary_contact",
        attribute: "primary_contact",
        factType: "person",
        normalize: (r) => ({
          title: r.primary_contact_title || null,
          email: r.primary_contact_email || null,
        }),
      },
    ],
  });
}

function crmDealsFacts(text: string): StoredFact[] {
  return mapCsvTable(parseCsv(text), {
    entityCol: "account_name",
    tsCol: "close_date",
    specs: [
      { col: "deal_name", attribute: "deal_name", factType: "deal" },
      { col: "deal_stage", attribute: "deal_stage", factType: "deal" },
      { col: "deal_owner", attribute: "deal_owner", factType: "deal" },
      { col: "product", attribute: "product", factType: "deal" },
      {
        col: "amount_usd",
        attribute: "deal_amount_usd",
        factType: "pricing",
        normalize: (r) => ({ amount_usd: Number(r.amount_usd) || r.amount_usd }),
      },
      {
        col: "close_date",
        attribute: "close_date",
        factType: "deal",
        normalize: (r) => ({ date: r.close_date }),
      },
    ],
  });
}

function renewalsFacts(table: CsvTable): StoredFact[] {
  return mapCsvTable(table, {
    entityCol: "account",
    tsCol: "last_edited",
    specs: [
      {
        col: "renewal_date",
        attribute: "renewal_date",
        factType: "renewal",
        normalize: (r) => ({ date: r.renewal_date }),
      },
      { col: "account_owner", attribute: "owner", factType: "account" },
      { col: "tier", attribute: "tier", factType: "account" },
      { col: "status", attribute: "status", factType: "account" },
      {
        col: "arr_usd",
        attribute: "arr_usd",
        factType: "pricing",
        normalize: (r) => ({ amount_usd: Number(r.arr_usd) || r.arr_usd }),
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

// Write one document's facts atomically: supersede whatever this document
// contributed before, insert the fresh facts, and update the ingest cache.
// Returns nothing; append-only — old facts are marked superseded, never deleted.
async function persistDoc(
  doc: string,
  tool: SourceTool,
  contentHash: string,
  facts: StoredFact[]
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    // Supersede this document's currently-believed facts.
    await client.query(
      `update facts set superseded_at = now()
        where source_doc = $1 and superseded_at is null`,
      [doc]
    );

    for (const f of facts) {
      await client.query(
        `insert into facts
           (entity_ref, attribute, value, value_json,
            source_tool, source_doc, doc_timestamp, content_hash,
            source_quote, source_offset, fact_type)
         values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
        [
          f.entity_name,
          f.attribute,
          f.value,
          f.value_json === null ? null : JSON.stringify(f.value_json),
          tool,
          doc,
          f.doc_timestamp,
          sha256(f.source_quote),
          f.source_quote,
          f.source_offset,
          f.fact_type,
        ]
      );
    }

    await client.query(
      `insert into ingested_sources (source_doc, source_tool, content_hash, fact_count, ingested_at)
         values ($1,$2,$3,$4, now())
       on conflict (source_doc) do update
         set content_hash = excluded.content_hash,
             source_tool  = excluded.source_tool,
             fact_count   = excluded.fact_count,
             ingested_at  = now()`,
      [doc, tool, contentHash, facts.length]
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Content hashes we already ingested, so we can skip unchanged files. */
async function loadCache(): Promise<Map<string, { hash: string; count: number }>> {
  const { rows } = await getPool().query<{
    source_doc: string;
    content_hash: string;
    fact_count: number;
  }>(`select source_doc, content_hash, fact_count from ingested_sources`);
  return new Map(
    rows.map((r) => [r.source_doc, { hash: r.content_hash, count: r.fact_count }])
  );
}

/* ------------------------------------------------------------------ */
/* The run                                                            */
/* ------------------------------------------------------------------ */

type Job =
  | { kind: "csv"; doc: string; tool: SourceTool; text: string; build: (t: string) => StoredFact[] }
  | { kind: "sheet"; doc: string; tool: SourceTool; table: CsvTable; build: (t: CsvTable) => StoredFact[] }
  | { kind: "llm"; doc: string; tool: SourceTool; kindLabel: "email" | "calls"; text: string };

/**
 * Run a full ingest, yielding progress events. `force` re-ingests even
 * unchanged files (ignores the content-hash cache).
 */
export async function* runIngest(opts?: {
  budgetUsd?: number;
  force?: boolean;
}): AsyncGenerator<IngestEvent> {
  const budgetUsd = opts?.budgetUsd ?? DEFAULT_BUDGET_USD;
  const force = opts?.force ?? false;

  // Assemble the work list. CSV/spreadsheet first (free), then LLM docs.
  const jobs: Job[] = [];

  jobs.push({
    kind: "csv",
    doc: "crm_accounts.csv",
    tool: "crm",
    text: readTextFile("crm_accounts.csv"),
    build: crmAccountsFacts,
  });
  jobs.push({
    kind: "csv",
    doc: "crm_deals.csv",
    tool: "crm",
    text: readTextFile("crm_deals.csv"),
    build: crmDealsFacts,
  });

  // Live Google Sheet (falls back to the cached CSV inside loadRenewals).
  const renewals = await loadRenewals();
  jobs.push({
    kind: "sheet",
    doc: "renewals_tracker",
    tool: "spreadsheet",
    table: renewals.table,
    build: renewalsFacts,
  });

  for (const f of listDir("emails")) {
    jobs.push({
      kind: "llm",
      doc: `emails/${f}`,
      tool: "email",
      kindLabel: "email",
      text: readTextFile(`emails/${f}`),
    });
  }
  for (const f of listDir("transcripts")) {
    jobs.push({
      kind: "llm",
      doc: `transcripts/${f}`,
      tool: "calls",
      kindLabel: "calls",
      text: readTextFile(`transcripts/${f}`),
    });
  }

  yield { type: "start", totalDocs: jobs.length, budgetUsd };

  const cache = await loadCache();
  let spentUsd = 0;
  let budgetHit = false;
  const skippedForBudget: string[] = [];
  const totals = { docs: 0, facts: 0, rejected: 0, skippedFiles: 0, costUsd: 0 };

  for (const job of jobs) {
    // Determine the file's content hash to check the cache.
    const contentHash =
      job.kind === "sheet"
        ? sha256(JSON.stringify(job.table))
        : sha256(job.text);

    const cached = cache.get(job.doc);
    if (!force && cached && cached.hash === contentHash) {
      totals.skippedFiles++;
      yield {
        type: "file_skip",
        doc: job.doc,
        tool: job.tool,
        factCount: cached.count,
      };
      continue;
    }

    // Budget guard applies only to the paid (LLM) path.
    if (job.kind === "llm" && spentUsd >= budgetUsd) {
      budgetHit = true;
      skippedForBudget.push(job.doc);
      continue;
    }

    yield {
      type: "file_start",
      doc: job.doc,
      tool: job.tool,
      kind: job.kind === "llm" ? "llm" : "csv",
    };

    try {
      let facts: StoredFact[] = [];
      let rejected = 0;
      let costUsd = 0;

      if (job.kind === "csv") {
        facts = job.build(job.text);
      } else if (job.kind === "sheet") {
        facts = job.build(job.table);
      } else {
        const docTs = extractDocTimestamp(job.kindLabel, job.text);
        const res = await extractFacts({ kind: job.kindLabel, text: job.text });
        costUsd = usageCost(res.usage);
        spentUsd += costUsd;
        rejected = res.rejected;
        facts = res.facts.map((f) => ({ ...f, doc_timestamp: docTs }));
      }

      await persistDoc(job.doc, job.tool, contentHash, facts);
      cache.set(job.doc, { hash: contentHash, count: facts.length });

      for (const f of facts) {
        yield {
          type: "fact",
          doc: job.doc,
          entity: f.entity_name,
          attribute: f.attribute,
          value: f.value,
          factType: f.fact_type,
        };
      }

      totals.docs++;
      totals.facts += facts.length;
      totals.rejected += rejected;
      totals.costUsd += costUsd;

      yield {
        type: "file_done",
        doc: job.doc,
        tool: job.tool,
        extracted: facts.length,
        rejected,
        costUsd,
      };
    } catch (err) {
      yield {
        type: "error",
        doc: job.doc,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (budgetHit) {
    yield { type: "budget_reached", spentUsd, skipped: skippedForBudget };
  }

  yield { type: "done", totals };
}

// Pull the document's own timestamp from its header (for provenance/freshness).
function extractDocTimestamp(kind: "email" | "calls", text: string): string | null {
  if (kind === "email") {
    const m = text.match(/^Date:\s?(.*)$/m);
    return m ? toIso(m[1].trim()) : null;
  }
  const m = text.match(/^Date:\s?(.*)$/m);
  return m ? toIso(m[1].trim()) : null;
}

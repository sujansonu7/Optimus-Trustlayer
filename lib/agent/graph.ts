// Server-only: the typed JSON export of the knowledge graph the sandbox computes
// against.
//
// This is the DATA the execute_python tool hands to the sandbox — and ONLY the
// data. No connection string, no secret, no live handle ever crosses the
// boundary: the agent's Python sees a plain JSON snapshot of accounts and deals,
// already arbitrated, with EVERY value tagged by the evidence id that backs it.
// So a number the code charts can always be traced to its source passage on the
// work-product page.
//
// The export is a VIEW over the same ledger the Ask path reads. It reuses the
// exact arbitration the rest of TrustLayer uses (detectConflicts) so a renewal
// date the calendar plots is the same winner /conflicts would show — never a
// second, divergent opinion. Building it also folds the evidence (and the
// conflict blocks it touched) into the run's evidence pool, so citations and the
// "Conflicts noted" section light up for free.
import { query } from "@/lib/db";
import { detectConflicts, SNAPSHOT, type Conflict } from "@/lib/conflicts/detect";
import {
  canonicalAttribute,
  normalizeValue,
  displayValue,
  entityKey,
  makeResolver,
  ATTR_LABEL,
  type CanonicalAttribute,
} from "@/lib/conflicts/normalize";
import { loadDecisionOverrides } from "@/lib/overrides";
import { SOURCE_LABEL, type SourceTool, type EvidenceItem } from "@/lib/ask/types";
import type { Session } from "./tools";

/* ------------------------------------------------------------------ */
/* The exported shape (this is the JSON the sandbox sees)             */
/* ------------------------------------------------------------------ */

/** A single graph value, carrying the evidence id that grounds it. Every number
 *  or date the code uses is one of these — cite `evidence_id` in the brief. */
export type GraphField = {
  /** Human-readable form: "$84,000", "2026-08-15", "Marcus Ohene". */
  display: string;
  /** Machine form: a number for money, an ISO "YYYY-MM-DD" for dates, else text. */
  value: string | number | null;
  /** Id into the run's evidence pool — the passage this value came from. */
  evidence_id: number;
  /** True when sources disagreed and arbitration picked this value. */
  contested: boolean;
};

export type GraphAccount = {
  name: string;
  key: string;
  industry: GraphField | null;
  tier: GraphField | null;
  status: GraphField | null;
  owner: GraphField | null;
  arr: GraphField | null; // value is a number (USD)
  renewal_date: GraphField | null; // value is "YYYY-MM-DD"
  primary_contact: GraphField | null;
};

export type GraphDeal = {
  account: string;
  account_key: string;
  name: string | null;
  stage: string | null; // e.g. "Closed Won", "Renewal — Negotiation"
  owner: string | null;
  product: string | null;
  amount: number | null; // USD
  amount_display: string | null;
  close_date: string | null; // "YYYY-MM-DD" when parseable
  evidence_id: number;
};

export type GraphExport = {
  generated_at: string;
  /** The fixture's "today". Anchor relative windows ("next quarter") to THIS,
   *  not the wall clock, so calendars line up with the demo narrative. */
  snapshot_date: string;
  connected_tools: SourceTool[];
  disconnected_tools: SourceTool[];
  accounts: GraphAccount[];
  deals: GraphDeal[];
  /** A note the code (and its author) can read for orientation. */
  readme: string;
};

/** What buildGraphExport returns: the JSON for the sandbox, plus the evidence
 *  and conflict blocks it merged into the run so the work product can cite. */
export type GraphExportResult = {
  graph: GraphExport;
  /** Count of distinct source passages the export drew on (for the summary). */
  evidenceCount: number;
  /** Conflicts the export surfaced (renewal-date etc.), for the summary line. */
  conflictCount: number;
};

/* ------------------------------------------------------------------ */
/* Internal fact row                                                  */
/* ------------------------------------------------------------------ */

type RawFact = {
  entity_ref: string;
  attribute: string;
  value: string;
  value_json: { amount_usd?: number | string; date?: string } | null;
  source_tool: SourceTool;
  source_doc: string;
  doc_timestamp: string | null;
  content_hash: string;
  source_quote: string | null;
  source_offset: number | null;
};

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

/* ------------------------------------------------------------------ */
/* The build                                                          */
/* ------------------------------------------------------------------ */

/**
 * Read the ledger once, arbitrate, and produce the typed JSON export the sandbox
 * runs against. Side effect: merges every referenced passage (and the conflict
 * blocks it touched) into `ctx`, so the resulting evidence ids are valid to cite
 * in the brief and the conflicts render on the work product.
 */
export async function buildGraphExport(ctx: Session): Promise<GraphExportResult> {
  const connected = ctx.connected;
  const generatedAt = new Date().toISOString();

  if (connected.length === 0) {
    const empty: GraphExport = {
      generated_at: generatedAt,
      snapshot_date: SNAPSHOT.toISOString().slice(0, 10),
      connected_tools: [],
      disconnected_tools: ctx.disconnected,
      accounts: [],
      deals: [],
      readme: "No sources are connected, so the graph is empty.",
    };
    return { graph: empty, evidenceCount: 0, conflictCount: 0 };
  }

  const { splitKeys } = await loadDecisionOverrides();

  // 1) Every currently-believed fact from CONNECTED sources only. Disconnected
  //    tools are excluded at the SQL boundary — they can't leak into compute.
  const { rows } = await query<RawFact>(
    `select entity_ref, attribute, value, value_json,
            source_tool, source_doc,
            to_char(doc_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as doc_timestamp,
            content_hash, source_quote, source_offset
       from facts
      where superseded_at is null
        and source_tool = any($1::source_tool[])`,
    [connected]
  );

  // 2) Canonical account universe (CRM + spreadsheet), and a resolver so
  //    email/call short-names fold into their account.
  const canonicalKeys = new Set<string>();
  for (const r of rows) {
    if (r.source_tool === "crm" || r.source_tool === "spreadsheet") {
      canonicalKeys.add(entityKey(r.entity_ref));
    }
  }
  const resolve = makeResolver(canonicalKeys);

  type Group = { key: string; labels: Set<string>; facts: RawFact[] };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const rawKey = entityKey(r.entity_ref);
    const gk = splitKeys.has(rawKey) ? rawKey : resolve(rawKey);
    let g = groups.get(gk);
    if (!g) {
      g = { key: gk, labels: new Set(), facts: [] };
      groups.set(gk, g);
    }
    g.labels.add(r.entity_ref);
    g.facts.push(r);
  }

  // 3) The arbitrated winners for every conflicted (entity, attribute), from the
  //    SAME detector the /conflicts page and Ask use — one source of truth.
  const report = await detectConflicts();
  const conflictByKey = new Map<string, Conflict>();
  for (const c of report.conflicts) conflictByKey.set(`${c.entityKey}::${c.attribute}`, c);

  // Slots let us assign evidence ids AFTER merging: each slot remembers which
  // field/deal it backs and which draft EvidenceItem it built.
  const evidence: EvidenceItem[] = [];
  type Slot = { evIndex: number; assign: (id: number) => void };
  const slots: Slot[] = [];

  const pushEvidence = (
    r: RawFact,
    entity: string,
    attributeLabel: string,
    display: string,
    status: EvidenceItem["status"],
    assign: (id: number) => void
  ) => {
    const evIndex = evidence.length;
    evidence.push({
      id: evIndex, // provisional; overwritten by the pool on absorb()
      entity,
      attribute: r.attribute,
      attributeLabel,
      value: r.value,
      display,
      sourceTool: r.source_tool,
      sourceLabel: SOURCE_LABEL[r.source_tool],
      sourceDoc: r.source_doc,
      docTimestamp: r.doc_timestamp,
      ageText: humaneAge(r.doc_timestamp),
      contentHash: r.content_hash,
      sourceQuote: r.source_quote,
      sourceOffset: r.source_offset,
      status,
    });
    slots.push({ evIndex, assign });
  };

  const accounts: GraphAccount[] = [];
  const deals: GraphDeal[] = [];

  const newestFirst = (a: RawFact, b: RawFact) => (b.doc_timestamp ?? "").localeCompare(a.doc_timestamp ?? "");

  for (const g of Array.from(groups.values())) {
    // Skip groups that are only email/call fragments (no canonical anchor):
    // they aren't real accounts to summarize.
    const hasStructured = g.facts.some((f) => f.source_tool === "crm" || f.source_tool === "spreadsheet");
    if (!hasStructured) continue;

    const entity = Array.from(g.labels).sort((a, b) => b.length - a.length)[0];

    // Build one arbitrated GraphField for a canonical attribute.
    const canonicalField = (attr: CanonicalAttribute): GraphField | null => {
      const conflict = conflictByKey.get(`${g.key}::${attr}`);
      const facts = g.facts.filter((f) => canonicalAttribute(f.attribute) === attr);
      if (facts.length === 0) return null;

      if (conflict) {
        // Cite the winning source's passage. Prefer a fact from a winning tool
        // whose value canonicalizes to the winner.
        const winner = conflict.values.find((v) => v.isWinner)!;
        const winnerTools = new Set(winner.sources.map((s) => s.tool));
        const winFact =
          facts
            .filter((f) => normalizeValue(attr, f.value) === winner.canonical && winnerTools.has(f.source_tool))
            .sort(newestFirst)[0] ??
          facts.filter((f) => normalizeValue(attr, f.value) === winner.canonical).sort(newestFirst)[0] ??
          facts.sort(newestFirst)[0];

        // We record only that the value is `contested` and cite the winning
        // passage. The full conflict block is NOT force-merged here — it would
        // dump every account's conflicts onto a single-account brief. Conflicts
        // surface in "Conflicts noted" the same way they always do: through the
        // agent's own query_graph calls for the accounts it actually cares about.
        const field: GraphField = {
          display: winner.display,
          value: fieldValue(attr, winner.canonical),
          evidence_id: -1,
          contested: true,
        };
        pushEvidence(winFact, entity, ATTR_LABEL[attr], winner.display, "winner", (id) => (field.evidence_id = id));
        return field;
      }

      // No conflict: the newest current fact is the value.
      const f = facts.slice().sort(newestFirst)[0];
      const canonical = normalizeValue(attr, f.value);
      const display =
        attr === "owner" || attr === "tier"
          ? f.value
          : canonical !== null
          ? displayValue(attr, canonical)
          : f.value;
      const field: GraphField = {
        display,
        value: fieldValue(attr, canonical),
        evidence_id: -1,
        contested: false,
      };
      pushEvidence(f, entity, ATTR_LABEL[attr], display, "current", (id) => (field.evidence_id = id));
      return field;
    };

    // A plain (non-arbitrated) single-source field, e.g. industry / contact.
    const plainField = (rawAttr: string): GraphField | null => {
      const f = g.facts.filter((x) => x.attribute === rawAttr).sort(newestFirst)[0];
      if (!f) return null;
      const field: GraphField = { display: f.value, value: f.value, evidence_id: -1, contested: false };
      pushEvidence(f, entity, rawAttr.replace(/_/g, " "), f.value, "current", (id) => (field.evidence_id = id));
      return field;
    };

    accounts.push({
      name: entity,
      key: g.key,
      industry: plainField("industry"),
      tier: canonicalField("tier"),
      status: canonicalField("status"),
      owner: canonicalField("owner"),
      arr: canonicalField("arr"),
      renewal_date: canonicalField("renewal_date"),
      primary_contact: plainField("primary_contact"),
    });

    // Deals: group this account's deal facts by their row (content hash), since
    // every field of one CRM deal row shares the row passage.
    const dealRows = new Map<string, RawFact[]>();
    for (const f of g.facts) {
      if (!f.attribute.startsWith("deal_") && f.attribute !== "close_date" && f.attribute !== "product") continue;
      // Only rows that carry a deal_name/deal_stage are real deals.
      const arr = dealRows.get(f.content_hash) ?? [];
      arr.push(f);
      dealRows.set(f.content_hash, arr);
    }
    for (const dealFacts of Array.from(dealRows.values())) {
      const get = (a: string) => dealFacts.find((f) => f.attribute === a);
      const nameF = get("deal_name");
      const stageF = get("deal_stage");
      if (!nameF && !stageF) continue; // not a deal row
      const amountF = get("deal_amount_usd");
      const amount =
        amountF?.value_json?.amount_usd != null
          ? Number(amountF.value_json.amount_usd)
          : amountF
          ? Number(String(amountF.value).replace(/[^0-9.]/g, "")) || null
          : null;
      const closeF = get("close_date");
      const closeDate = closeF?.value_json?.date ?? (closeF ? isoDay(closeF.value) : null);

      const anchor = amountF ?? nameF ?? stageF!;
      const deal: GraphDeal = {
        account: entity,
        account_key: g.key,
        name: nameF?.value ?? null,
        stage: stageF?.value ?? null,
        owner: get("deal_owner")?.value ?? null,
        product: get("product")?.value ?? null,
        amount,
        amount_display: amount != null ? `$${amount.toLocaleString("en-US")}` : null,
        close_date: closeDate,
        evidence_id: -1,
      };
      const label = amount != null ? `$${amount.toLocaleString("en-US")}` : nameF?.value ?? "deal";
      pushEvidence(anchor, entity, "deal", label, "current", (id) => (deal.evidence_id = id));
      deals.push(deal);
    }
  }

  // 4) Fold the evidence into the run's pool in ONE pass; back-fill ids. (No
  //    conflicts/freshness here — those enter the envelope through the agent's
  //    own query_graph calls, keeping "Conflicts noted" scoped to the brief.)
  const ids = ctx.absorb({ evidence, conflicts: [], freshness: [], declarations: [] });
  for (const s of slots) s.assign(ids[s.evIndex]);

  accounts.sort((a, b) => a.name.localeCompare(b.name));
  deals.sort((a, b) => a.account.localeCompare(b.account));

  const graph: GraphExport = {
    generated_at: generatedAt,
    snapshot_date: SNAPSHOT.toISOString().slice(0, 10),
    connected_tools: connected,
    disconnected_tools: ctx.disconnected,
    accounts,
    deals,
    readme:
      "Typed export of TrustLayer's knowledge graph. Every account field and deal " +
      "carries an `evidence_id` — the id of the source passage it came from — so any " +
      "number you compute can be cited. `arr` values are USD numbers; `renewal_date` " +
      "and `close_date` are 'YYYY-MM-DD'. `contested: true` means sources disagreed and " +
      "the value shown is the arbitrated winner. Treat `snapshot_date` as 'today' for " +
      "any relative window like 'next quarter'.",
  };

  const uniqueEvidence = new Set(ids).size;
  const contestedCount = accounts.reduce(
    (n, a) =>
      n +
      [a.arr, a.renewal_date, a.owner, a.status, a.tier].filter((f) => f?.contested).length,
    0
  );
  return { graph, evidenceCount: uniqueEvidence, conflictCount: contestedCount };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// Machine value per attribute: a number for money, an ISO day for dates, text
// otherwise. Keeps the JSON easy for pandas to consume.
function fieldValue(attr: CanonicalAttribute, canonical: string | null): string | number | null {
  if (canonical === null) return null;
  if (attr === "arr") return Number(canonical);
  return canonical; // renewal_date is already YYYY-MM-DD; owner/status/tier are text
}

function isoDay(v: string): string | null {
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

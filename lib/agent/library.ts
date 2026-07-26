// Server-only: persistence for agent runs and the Library.
//
// agent_sessions + agent_steps are DISPOSABLE run logs. work_products is the
// Library — delivered briefs that survive their session's deletion (the FK is
// ON DELETE SET NULL). None of this is knowledge: the fact ledger, declarations,
// and conflicts are untouched here. clearAgentSessions() proves it — it wipes
// every run log and leaves the product's knowledge (and the Library) intact.
import { query } from "@/lib/db";
import type { AgentStep, AskMode, WorkProduct, WorkProductRow } from "./types";

export async function createSession(question: string, mode: AskMode): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `insert into agent_sessions (question, mode, status) values ($1, $2, 'running') returning id`,
    [question, mode]
  );
  return rows[0].id;
}

export async function recordStep(sessionId: string, step: AgentStep): Promise<void> {
  // Insert the step ONLY if its session still exists. If the session row was
  // deleted mid-run (someone cleared run logs, or a race), this becomes a clean
  // no-op instead of throwing an FK violation (agent_steps_session_id_fkey) — the
  // guard and the insert are one atomic statement, so there is no TOCTOU window.
  // Steps that DO land are durable and survive a page reload (see loadSteps).
  await query(
    `insert into agent_steps (session_id, seq, kind, tool_name, input_json, summary)
     select $1, $2, $3, $4, $5::jsonb, $6
     where exists (select 1 from agent_sessions where id = $1)
     on conflict (session_id, seq) do nothing`,
    [
      sessionId,
      step.seq,
      step.kind,
      step.toolName ?? null,
      step.input === undefined ? null : JSON.stringify(step.input),
      step.summary,
    ]
  );
}

/** Load a session's persisted step log, in order — used to rehydrate a run view
 *  after a page reload. stdout/charts are not persisted (they live on the work
 *  product's computations), so a reloaded timeline shows the steps without them. */
export async function loadSteps(sessionId: string): Promise<AgentStep[]> {
  const map = await loadStepsForSessions([sessionId]);
  return map[sessionId] ?? [];
}

/** Batch variant: persisted steps for many sessions at once, keyed by session id.
 *  Lets the crew board rehydrate every card's step log in a single query. */
export async function loadStepsForSessions(
  sessionIds: string[]
): Promise<Record<string, AgentStep[]>> {
  const ids = Array.from(new Set(sessionIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { rows } = await query<{
    session_id: string;
    seq: number;
    kind: string;
    tool_name: string | null;
    input_json: unknown;
    summary: string;
  }>(
    `select session_id, seq, kind, tool_name, input_json, summary
       from agent_steps
      where session_id = any($1::uuid[])
      order by session_id, seq`,
    [ids]
  );
  const out: Record<string, AgentStep[]> = {};
  for (const r of rows) {
    (out[r.session_id] ??= []).push({
      seq: r.seq,
      kind: r.kind as AgentStep["kind"],
      toolName: (r.tool_name as AgentStep["toolName"]) ?? null,
      input: r.input_json ?? undefined,
      summary: r.summary,
    });
  }
  return out;
}

export async function finishSession(
  sessionId: string,
  status: "done" | "error",
  error?: string
): Promise<void> {
  await query(
    `update agent_sessions set status = $2, error = $3, finished_at = now() where id = $1`,
    [sessionId, status, error ?? null]
  );
}

export async function saveWorkProduct(sessionId: string, wp: WorkProduct): Promise<string> {
  // Resolve session_id through a lookup so that if the session was cleared
  // mid-run the product is still saved with a null session (matching the FK's
  // ON DELETE SET NULL) rather than failing on the FK. A delivered brief must
  // always reach the Library, regardless of run state.
  const { rows } = await query<{ id: string }>(
    `insert into work_products (session_id, title, entity, request, body_json)
     values ((select id from agent_sessions where id = $1), $2, $3, $4, $5::jsonb) returning id`,
    [sessionId, wp.title, wp.entity, wp.request, JSON.stringify(wp)]
  );
  return rows[0].id;
}

export async function loadWorkProducts(): Promise<WorkProductRow[]> {
  const { rows } = await query<{
    id: string;
    title: string;
    entity: string | null;
    request: string;
    created_at: string;
    body_json: WorkProduct;
  }>(
    `select id, title, entity, request,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
            body_json
       from work_products
      order by created_at desc`
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    entity: r.entity,
    request: r.request,
    createdAt: r.created_at,
    body: r.body_json,
  }));
}

export async function loadWorkProduct(id: string): Promise<WorkProductRow | null> {
  const { rows } = await query<{
    id: string;
    title: string;
    entity: string | null;
    request: string;
    created_at: string;
    body_json: WorkProduct;
  }>(
    `select id, title, entity, request,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
            body_json
       from work_products where id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, title: r.title, entity: r.entity, request: r.request, createdAt: r.created_at, body: r.body_json };
}

/**
 * Wipe every agent run log. Proves standing rule #5: the engine holds no durable
 * knowledge. We DELETE (not TRUNCATE) so Postgres honors the referential actions:
 * agent_steps cascade away, and each work_products.session_id is SET NULL — so
 * delivered briefs stay in the Library. (TRUNCATE ... CASCADE would ignore SET
 * NULL and wipe work_products too — exactly what must NOT happen.) Facts,
 * declarations, and conflicts are never referenced here — nothing about the
 * product's knowledge changes.
 *
 * A session that is still 'running' is NEVER deleted: pulling its row out from
 * under a live run is the main cause of the FK step errors this fix eliminates.
 * Those are left in place; everything terminal (done/error) is wiped. Returns how
 * many sessions were removed and how many running sessions were kept.
 */
export async function clearAgentSessions(): Promise<{ sessions: number; skipped: number }> {
  const { rows } = await query<{ n: string }>(
    `select count(*)::text as n from agent_sessions where status = 'running'`
  );
  const skipped = Number(rows[0]?.n ?? 0);
  const { rowCount } = await query(`delete from agent_sessions where status <> 'running'`);
  return { sessions: rowCount ?? 0, skipped };
}

/** How many work products are in the Library right now (for the /admin count). */
export async function countWorkProducts(): Promise<number> {
  const { rows } = await query<{ n: string }>(`select count(*)::text as n from work_products`);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Empty the Library — delete every delivered work product. This removes the
 * saved BRIEFS (the formatted deliverables), nothing else: the fact ledger,
 * declarations, conflicts, and the facts a brief filed back into the graph all
 * survive (a filed-back fact is knowledge in its own right, keyed by content
 * hash — it does not point at the work product). Any crew card that linked to a
 * cleared product keeps its row; its work_product_id is set null by the FK.
 * Returns how many products were removed.
 */
export async function clearWorkProducts(): Promise<{ products: number }> {
  const { rowCount } = await query(`delete from work_products`);
  return { products: rowCount ?? 0 };
}

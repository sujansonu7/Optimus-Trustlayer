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
  await query(
    `insert into agent_steps (session_id, seq, kind, tool_name, input_json, summary)
     values ($1, $2, $3, $4, $5::jsonb, $6)
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
  const { rows } = await query<{ id: string }>(
    `insert into work_products (session_id, title, entity, request, body_json)
     values ($1, $2, $3, $4, $5::jsonb) returning id`,
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
 * product's knowledge changes. Returns how many sessions were removed.
 */
export async function clearAgentSessions(): Promise<{ sessions: number }> {
  const { rowCount } = await query(`delete from agent_sessions`);
  return { sessions: rowCount ?? 0 };
}

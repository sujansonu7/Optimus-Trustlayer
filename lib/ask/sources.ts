// Server-only: the per-source connection switch + belief-cache invalidation.
//
// This is the enforcement point for DEMO_SCRIPT Beat 6. A DISCONNECTED source
// is filtered out of every Ask retrieval query (see retrieve.ts), so its facts
// never reach the model, the answer, or the cache — it becomes structurally
// unreachable. Flipping a source also invalidates exactly the cached answers
// that depended on it, so the next ask recomputes from the remaining evidence.
import { getPool, query } from "@/lib/db";
import { ALL_TOOLS, type SourceTool } from "./types";

export type ConnectionState = { source_tool: SourceTool; connected: boolean; updated_at: string };

/** Current connection state for all four tools (defaults to connected if the
 *  table hasn't been seeded yet). */
export async function loadConnections(): Promise<ConnectionState[]> {
  const { rows } = await query<ConnectionState>(
    `select source_tool, connected,
            to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
       from source_connections`
  );
  const byTool = new Map(rows.map((r) => [r.source_tool, r]));
  // Ensure every tool has a row in the returned view, connected by default.
  return ALL_TOOLS.map(
    (t) => byTool.get(t) ?? { source_tool: t, connected: true, updated_at: "" }
  );
}

/** The set of tools currently CONNECTED — the only tools any retrieval may read. */
export async function connectedTools(): Promise<SourceTool[]> {
  const conns = await loadConnections();
  return conns.filter((c) => c.connected).map((c) => c.source_tool);
}

/**
 * Flip one source on/off. On any change we invalidate every still-live cached
 * answer that DEPENDED on that tool (evidence_sources @> {tool}) so those
 * beliefs are recomputed on the next ask. Returns how many were invalidated —
 * the /admin toggle surfaces that count. Idempotent per state.
 */
export async function setConnected(
  tool: SourceTool,
  connected: boolean
): Promise<{ invalidated: number }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into source_connections (source_tool, connected, updated_at)
         values ($1, $2, now())
       on conflict (source_tool)
         do update set connected = excluded.connected, updated_at = now()`,
      [tool, connected]
    );

    // Invalidate dependent beliefs. When DISCONNECTING, any answer that drew on
    // this tool is now built on evidence it may no longer see. When RECONNECTING,
    // any answer that touched this tool's subject area may now have more evidence
    // available. In both cases the safe move is to drop the dependent beliefs and
    // let them recompute — so we invalidate on either transition.
    const res = await client.query(
      `update answer_cache
          set invalidated_at = now()
        where invalidated_at is null
          and $1 = any(evidence_sources)`,
      [tool]
    );

    await client.query("commit");
    return { invalidated: res.rowCount ?? 0 };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

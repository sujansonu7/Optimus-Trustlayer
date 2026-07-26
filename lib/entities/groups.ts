// Server-only: resolved entity groups, for /entities and /review.
//
// Entity resolution in TrustLayer is COMPUTED, not stored — the `entities` table
// exists in the schema but is never written, because resolution is recomputed
// from the fact ledger on every request (see lib/conflicts/normalize.ts). This
// module assembles the same grouping the retriever and the conflict detector
// use, and returns it in a shape a page can render.
import { query } from "@/lib/db";
import { entityKey, makeResolver } from "@/lib/conflicts/normalize";
import { loadDecisionOverrides } from "@/lib/overrides";
import type { SourceTool } from "@/lib/ask/types";

export type EntityMember = {
  /** The name exactly as this source writes it. */
  raw: string;
  tools: SourceTool[];
  factCount: number;
  /** True for the canonical (CRM / spreadsheet) spelling that anchors the group. */
  canonical: boolean;
  /** Plain-English reason this member is in the group. */
  why: string;
};

export type ResolvedEntity = {
  key: string;
  /** Longest raw label — usually the CRM legal name. */
  label: string;
  members: EntityMember[];
  factCount: number;
  /** Distinct source tools contributing to this entity. */
  tools: SourceTool[];
  /** True when at least one member was folded in (an actual resolution). */
  resolved: boolean;
};

type Row = { entity_ref: string; source_tool: SourceTool; n: string };

/** Every currently-believed entity name with its source and fact count. */
async function loadNames(): Promise<Row[]> {
  const { rows } = await query<Row>(
    `select entity_ref, source_tool, count(*)::text as n
       from facts
      where superseded_at is null
        and source_tool in ('crm','spreadsheet','email','calls')
      group by entity_ref, source_tool`
  );
  return rows;
}

export type EntityGraph = {
  entities: ResolvedEntity[];
  /** Canonical keys, for the review queue's candidate matching. */
  canonicalKeys: Set<string>;
  /** Keys that resolved to nothing and aren't canonical — the recall misses. */
  unresolvedKeys: Map<string, { raw: string; tools: SourceTool[]; factCount: number }>;
};

export async function loadEntityGraph(): Promise<EntityGraph> {
  const rows = await loadNames();
  const { splitKeys, mergeKeys } = await loadDecisionOverrides();

  // The canonical universe: exactly how detect.ts and retrieve.ts build it.
  const canonicalKeys = new Set<string>();
  for (const r of rows) {
    if (r.source_tool === "crm" || r.source_tool === "spreadsheet") {
      canonicalKeys.add(entityKey(r.entity_ref));
    }
  }
  const resolve = makeResolver(canonicalKeys);

  type Acc = {
    key: string;
    labels: Set<string>;
    byRaw: Map<string, { tools: Set<SourceTool>; n: number; key: string }>;
    n: number;
  };
  const groups = new Map<string, Acc>();
  const unresolvedKeys = new Map<string, { raw: string; tools: SourceTool[]; factCount: number }>();

  for (const r of rows) {
    const rawKey = entityKey(r.entity_ref);
    const gk = splitKeys.has(rawKey) ? rawKey : mergeKeys.get(rawKey) ?? resolve(rawKey);

    let g = groups.get(gk);
    if (!g) {
      g = { key: gk, labels: new Set(), byRaw: new Map(), n: 0 };
      groups.set(gk, g);
    }
    g.labels.add(r.entity_ref);
    g.n += Number(r.n) || 0;

    let m = g.byRaw.get(r.entity_ref);
    if (!m) {
      m = { tools: new Set(), n: 0, key: rawKey };
      g.byRaw.set(r.entity_ref, m);
    }
    m.tools.add(r.source_tool);
    m.n += Number(r.n) || 0;

    // An unresolved key: not canonical, and it stayed on its own key.
    if (!canonicalKeys.has(rawKey) && gk === rawKey) {
      const prev = unresolvedKeys.get(rawKey);
      unresolvedKeys.set(rawKey, {
        raw: r.entity_ref,
        tools: prev ? Array.from(new Set([...prev.tools, r.source_tool])) : [r.source_tool],
        factCount: (prev?.factCount ?? 0) + (Number(r.n) || 0),
      });
    }
  }

  const entities: ResolvedEntity[] = Array.from(groups.values()).map((g) => {
    const label = Array.from(g.labels).sort((a, b) => b.length - a.length)[0];
    const members: EntityMember[] = Array.from(g.byRaw.entries()).map(([raw, m]) => {
      const isCanonical = canonicalKeys.has(m.key);
      const folded = m.key !== g.key;
      const manual = mergeKeys.get(m.key) === g.key;
      return {
        raw,
        tools: Array.from(m.tools),
        factCount: m.n,
        canonical: isCanonical,
        why: !folded
          ? isCanonical
            ? "The account's own spelling in a structured source — this is what anchors the group."
            : "Stands on its own key; nothing folded into it."
          : manual
            ? `You approved this merge on /review — "${raw}" is treated as ${label}.`
            : `Folded in automatically: "${raw}" is an unambiguous prefix of exactly one known account.`,
      };
    });
    members.sort((a, b) => Number(b.canonical) - Number(a.canonical) || b.factCount - a.factCount);
    const tools = Array.from(new Set(members.flatMap((m) => m.tools)));
    return {
      key: g.key,
      label,
      members,
      factCount: g.n,
      tools,
      resolved: members.length > 1,
    };
  });

  // Resolved groups first (they're the interesting ones), then by size.
  entities.sort(
    (a, b) =>
      Number(b.resolved) - Number(a.resolved) ||
      b.members.length - a.members.length ||
      b.factCount - a.factCount
  );

  return { entities, canonicalKeys, unresolvedKeys };
}

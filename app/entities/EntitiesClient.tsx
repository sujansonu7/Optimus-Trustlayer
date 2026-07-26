"use client";

// Entity cards. One per resolved identity, showing every source spelling and the
// plain-English reason it belongs — the "why" the build guide asks for.
import { useMemo, useState } from "react";
import type { ResolvedEntity } from "@/lib/entities/groups";
import type { SourceTool } from "@/lib/ask/types";

const TOOL_LABEL: Record<SourceTool, string> = {
  crm: "CRM",
  spreadsheet: "Renewals Sheet",
  email: "Email",
  calls: "Calls",
};

const TOOL_CHIP: Record<SourceTool, string> = {
  crm: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  spreadsheet: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  email: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  calls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
};

export default function EntitiesClient({
  entities,
  resolvedCount,
}: {
  entities: ResolvedEntity[];
  resolvedCount: number;
}) {
  const [q, setQ] = useState("");
  const [onlyResolved, setOnlyResolved] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entities.filter((e) => {
      if (onlyResolved && !e.resolved) return false;
      if (!needle) return true;
      return (
        e.label.toLowerCase().includes(needle) ||
        e.members.some((m) => m.raw.toLowerCase().includes(needle))
      );
    });
  }, [entities, q, onlyResolved]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {entities.length} entities
        </span>
        <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {resolvedCount} with more than one name
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a name or alias…"
          className="ml-auto w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          <input
            type="checkbox"
            checked={onlyResolved}
            onChange={(e) => setOnlyResolved(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Only merged
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          Nothing matches that.
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((e) => (
            <EntityCard key={e.key} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntityCard({ e }: { e: ResolvedEntity }) {
  const [open, setOpen] = useState(e.resolved);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold tracking-tight">{e.label}</h2>
        {e.resolved && (
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {e.members.length} names resolved into one
          </span>
        )}
        <span className="flex flex-wrap items-center gap-1">
          {e.tools.map((t) => (
            <span
              key={t}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TOOL_CHIP[t]}`}
            >
              {TOOL_LABEL[t]}
            </span>
          ))}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          {open ? "Hide names ▲" : `Show ${e.members.length} name${e.members.length === 1 ? "" : "s"} ▼`}
        </button>
      </div>

      <p className="mt-1 text-xs text-neutral-400">
        {e.factCount} fact{e.factCount === 1 ? "" : "s"} · key <code>{e.key}</code>
      </p>

      {open && (
        <ul className="mt-3 space-y-2">
          {e.members.map((m) => (
            <li
              key={m.raw}
              className="rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  “{m.raw}”
                </span>
                {m.canonical && (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    anchor
                  </span>
                )}
                {m.tools.map((t) => (
                  <span
                    key={t}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TOOL_CHIP[t]}`}
                  >
                    {TOOL_LABEL[t]}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-neutral-400">
                  {m.factCount} fact{m.factCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {m.why}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

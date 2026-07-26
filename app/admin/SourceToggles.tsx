"use client";

import { useState, useTransition } from "react";
import { toggleSource } from "./actions";
import { ALL_TOOLS, SOURCE_LABEL, SOURCE_SHORT, type SourceTool } from "@/lib/ask/types";

type Conn = { source_tool: SourceTool; connected: boolean };

const TOOL_DESC: Record<SourceTool, string> = {
  crm: "Salesforce/HubSpot-style account & deal export.",
  spreadsheet: "The RevOps Renewals Sheet (system of record for renewal dates).",
  email: "Sales email threads.",
  calls: "Gong-style call transcripts.",
};

const TOOL_DOT: Record<SourceTool, string> = {
  crm: "bg-violet-500",
  spreadsheet: "bg-emerald-500",
  email: "bg-blue-500",
  calls: "bg-amber-500",
};

export default function SourceToggles({ initial }: { initial: Conn[] }) {
  const byTool = new Map(initial.map((c) => [c.source_tool, c.connected]));
  const [state, setState] = useState<Record<SourceTool, boolean>>(
    () =>
      Object.fromEntries(ALL_TOOLS.map((t) => [t, byTool.get(t) ?? true])) as Record<SourceTool, boolean>
  );
  const [pending, startTransition] = useTransition();
  const [busyTool, setBusyTool] = useState<SourceTool | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function flip(tool: SourceTool) {
    const next = !state[tool];
    setState((s) => ({ ...s, [tool]: next })); // optimistic
    setBusyTool(tool);
    startTransition(async () => {
      try {
        const { invalidated } = await toggleSource(tool, next);
        setFlash(
          next
            ? `Reconnected ${SOURCE_SHORT[tool]}. ${invalidated} cached answer${invalidated === 1 ? "" : "s"} invalidated — they’ll recompute on next ask.`
            : `Disconnected ${SOURCE_SHORT[tool]}. Its facts are now unreachable to Ask; ${invalidated} dependent cached answer${invalidated === 1 ? "" : "s"} invalidated.`
        );
      } catch (err) {
        setState((s) => ({ ...s, [tool]: !next })); // rollback
        setFlash(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyTool(null);
      }
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Trust is revocable. Disconnect a source and Ask stops seeing its facts entirely — dependent
        answers are invalidated and recompute at reduced confidence from what’s left. Nothing is
        deleted; reconnect to restore it.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {ALL_TOOLS.map((tool) => {
          const on = state[tool];
          const busy = pending && busyTool === tool;
          return (
            <li
              key={tool}
              className={
                "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition-colors " +
                (on
                  ? "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                  : "border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900")
              }
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={"h-2 w-2 rounded-full " + (on ? TOOL_DOT[tool] : "bg-neutral-300 dark:bg-neutral-600")} />
                  <span className={"text-sm font-semibold " + (on ? "" : "text-neutral-400")}>
                    {SOURCE_LABEL[tool].replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())}
                  </span>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase " +
                      (on
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
                    }
                  >
                    {on ? "connected" : "disconnected"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">{TOOL_DESC[tool]}</p>
              </div>

              <button
                onClick={() => flip(tool)}
                disabled={busy}
                role="switch"
                aria-checked={on}
                aria-label={`${on ? "Disconnect" : "Connect"} ${SOURCE_SHORT[tool]}`}
                className={
                  "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
                  (on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
                    (on ? "translate-x-5" : "translate-x-0.5")
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>

      {flash && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          {flash}
        </div>
      )}
    </div>
  );
}

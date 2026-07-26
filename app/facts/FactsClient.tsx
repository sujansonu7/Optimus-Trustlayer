"use client";

import { useMemo, useState } from "react";
import type { FactRow } from "@/lib/facts";

type Tool = "crm" | "spreadsheet" | "email" | "calls";

const TOOL_STYLE: Record<string, { label: string; cls: string }> = {
  crm: { label: "CRM", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  spreadsheet: { label: "Sheet", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  email: { label: "Email", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  calls: { label: "Calls", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

const TOOLS: Tool[] = ["crm", "spreadsheet", "email", "calls"];

export default function FactsClient({ facts }: { facts: FactRow[] }) {
  const [q, setQ] = useState("");
  const [tool, setTool] = useState<Tool | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return facts.filter((f) => {
      if (tool !== "all" && f.source_tool !== tool) return false;
      if (!needle) return true;
      return (
        f.entity_ref.toLowerCase().includes(needle) ||
        f.attribute.toLowerCase().includes(needle) ||
        f.value.toLowerCase().includes(needle) ||
        f.source_doc.toLowerCase().includes(needle)
      );
    });
  }, [facts, q, tool]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search entity, attribute, value, source…"
          className="w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="inline-flex flex-wrap gap-1">
          <Chip active={tool === "all"} onClick={() => setTool("all")}>
            All
          </Chip>
          {TOOLS.map((t) => (
            <Chip key={t} active={tool === t} onClick={() => setTool(t)}>
              {TOOL_STYLE[t].label}
            </Chip>
          ))}
        </div>
        <span className="text-sm text-neutral-400">
          {filtered.length} of {facts.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <Th>Entity</Th>
              <Th>Attribute</Th>
              <Th>Value</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => {
              const open = openId === f.id;
              return (
                <FactRowView
                  key={f.id}
                  fact={f}
                  open={open}
                  onToggle={() => setOpenId(open ? null : f.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactRowView({
  fact,
  open,
  onToggle,
}: {
  fact: FactRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-neutral-100 hover:bg-blue-50/60 dark:border-neutral-800/60 dark:hover:bg-blue-950/20"
      >
        <td className="px-3 py-2 font-medium text-neutral-800 dark:text-neutral-100">
          {fact.entity_ref}
        </td>
        <td className="px-3 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-300">
          {fact.attribute}
        </td>
        <td className="px-3 py-2 text-neutral-700 dark:text-neutral-200">{fact.value}</td>
        <td className="px-3 py-2">
          <span
            className={
              "rounded px-1.5 py-0.5 text-xs font-semibold " +
              (TOOL_STYLE[fact.source_tool]?.cls ?? "bg-neutral-100 text-neutral-600")
            }
          >
            {TOOL_STYLE[fact.source_tool]?.label ?? fact.source_tool}
          </span>
          <span className="ml-2 font-mono text-xs text-neutral-400">{fact.source_doc}</span>
        </td>
      </tr>
      {open && (
        <tr className="bg-neutral-50/70 dark:bg-neutral-900/40">
          <td colSpan={4} className="px-4 py-3">
            <SourcePanel fact={fact} />
          </td>
        </tr>
      )}
    </>
  );
}

function SourcePanel({ fact }: { fact: FactRow }) {
  const [docText, setDocText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canViewInSource = fact.source_tool === "email" || fact.source_tool === "calls";

  async function loadDoc() {
    if (docText || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/source?doc=${encodeURIComponent(fact.source_doc)}`);
      if (!res.ok) throw new Error(`Couldn't load source (HTTP ${res.status})`);
      setDocText(await res.text());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Metadata */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 sm:grid-cols-4">
        <Meta label="Source tool" value={TOOL_STYLE[fact.source_tool]?.label ?? fact.source_tool} />
        <Meta label="Document" value={fact.source_doc} mono />
        <Meta label="Document date" value={fact.doc_timestamp ? fmtDate(fact.doc_timestamp) : "—"} />
        <Meta label="Content hash" value={fact.content_hash.slice(0, 12) + "…"} mono />
      </dl>

      {/* The exact source passage — always shown from the ledger. */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Exact source passage
        </div>
        <blockquote className="rounded-md border-l-4 border-blue-400 bg-white px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
          {fact.source_quote ?? <span className="text-neutral-400">(not recorded)</span>}
        </blockquote>
      </div>

      {/* Optional: show the passage highlighted inside the full document. */}
      {canViewInSource && (
        <div>
          {!docText && (
            <button
              onClick={loadDoc}
              disabled={loading}
              className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              {loading ? "Loading…" : "Show in source document"}
            </button>
          )}
          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
          {docText && (
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 font-sans text-xs leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
              <Highlighted text={docText} quote={fact.source_quote} offset={fact.source_offset} />
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// Render `text` with `quote` visually highlighted. Prefers the stored offset;
// falls back to indexOf; if neither matches, shows the plain text.
function Highlighted({
  text,
  quote,
  offset,
}: {
  text: string;
  quote: string | null;
  offset: number | null;
}) {
  if (!quote) return <>{text}</>;
  const start = offset != null && offset >= 0 && text.substr(offset, quote.length) === quote ? offset : text.indexOf(quote);
  if (start === -1) return <>{text}</>;
  const end = start + quote.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-500/30 dark:text-yellow-100">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

/* --- small bits --- */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-neutral-200 px-3 py-2 text-left font-semibold text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
      {children}
    </th>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-blue-600 text-white"
          : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900")
      }
    >
      {children}
    </button>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-neutral-400">{label}</dt>
      <dd className={"text-neutral-700 dark:text-neutral-300 " + (mono ? "font-mono" : "")}>{value}</dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

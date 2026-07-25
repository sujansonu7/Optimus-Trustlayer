"use client";

import { useState } from "react";
import type { SourcesData } from "./page";
import type { CsvTable, EmailMsg, Transcript } from "@/lib/fixture";
import type { RenewalsSource } from "@/lib/renewals";

type TabKey = "crm" | "renewals" | "email" | "calls";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "crm", label: "CRM", hint: "Salesforce / HubSpot export" },
  { key: "renewals", label: "Renewals Sheet", hint: "RevOps spreadsheet" },
  { key: "email", label: "Email", hint: "Gmail / Outlook threads" },
  { key: "calls", label: "Calls", hint: "Gong transcripts" },
];

export default function SourcesClient({ data }: { data: SourcesData }) {
  const [tab, setTab] = useState<TabKey>("crm");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Raw source data exactly as each system stores it — CRM, spreadsheet, email, and calls.
          No entity resolution or conflict detection is applied on this page; the inconsistencies
          are intentional and visible.
        </p>
      </header>

      {/* Tab bar */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "group relative -mb-px rounded-t-md px-4 py-2.5 text-sm font-medium transition-colors " +
                (active
                  ? "border-b-2 border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                  : "border-b-2 border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100")
              }
            >
              {t.label}
              <span className="ml-2 hidden text-xs font-normal text-neutral-400 sm:inline">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "crm" && <CrmView accounts={data.crmAccounts} deals={data.crmDeals} />}
      {tab === "renewals" && <SheetView renewals={data.renewals} />}
      {tab === "email" && <EmailView emails={data.emails} />}
      {tab === "calls" && <CallsView transcripts={data.transcripts} />}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* CRM — records tables                                                */
/* ------------------------------------------------------------------ */
function CrmView({ accounts, deals }: { accounts: CsvTable; deals: CsvTable }) {
  const [sub, setSub] = useState<"accounts" | "deals">("accounts");
  const table = sub === "accounts" ? accounts : deals;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <SubToggle
          options={[
            { key: "accounts", label: `Accounts (${accounts.rows.length})` },
            { key: "deals", label: `Deals (${deals.rows.length})` },
          ]}
          value={sub}
          onChange={(v) => setSub(v as "accounts" | "deals")}
        />
      </div>
      <RecordsTable table={table} />
    </section>
  );
}

function RecordsTable({ table }: { table: CsvTable }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr>
            {table.headers.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-neutral-200 px-3 py-2 text-left font-semibold text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr
              key={i}
              className="odd:bg-white even:bg-neutral-50/60 hover:bg-blue-50/60 dark:odd:bg-neutral-950 dark:even:bg-neutral-900/40 dark:hover:bg-blue-950/30"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="whitespace-nowrap border-b border-neutral-100 px-3 py-1.5 text-neutral-700 dark:border-neutral-800/60 dark:text-neutral-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Renewals — spreadsheet grid                                        */
/* ------------------------------------------------------------------ */
function SheetView({ renewals }: { renewals: RenewalsSource }) {
  const { table, source, lastModified } = renewals;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-200">Renewals Tracker</span>{" "}
          — maintained by RevOps in{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-200">Google Sheets</span>, read
          live on load. The{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">last_edited</code> column shows
          how fresh each row is.
        </p>
        <FreshnessBadge source={source} lastModified={lastModified} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 dark:border-neutral-700">
        <table className="border-collapse text-xs font-mono">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-10 border border-neutral-300 bg-neutral-100 px-2 py-1 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800">
                #
              </th>
              {table.headers.map((h, i) => (
                <th
                  key={h}
                  className="border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <span className="mr-1 text-neutral-400">{colLabel(i)}</span>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="bg-white dark:bg-neutral-950">
                <td className="sticky left-0 z-10 border border-neutral-300 bg-neutral-100 px-2 py-1 text-right text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800">
                  {i + 1}
                </td>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="max-w-[26rem] truncate border border-neutral-200 px-2 py-1 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function colLabel(n: number): string {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Shows where the renewals data came from and how fresh it is.
 * - Live: green dot + the sheet's real Drive last-modified time.
 * - Cache: amber "showing cached data" pill + the cached file's timestamp.
 */
function FreshnessBadge({
  source,
  lastModified,
}: {
  source: "live" | "cache";
  lastModified: string | null;
}) {
  const when = lastModified ? fullTimestamp(lastModified) : "unknown";
  const rel = lastModified ? relativeTime(lastModified) : null;

  if (source === "cache") {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs dark:border-amber-500/40 dark:bg-amber-500/10"
        title={`Live Google Sheets read failed — showing the local cached CSV. Cached file last modified ${when}.`}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="font-medium text-amber-800 dark:text-amber-300">showing cached data</span>
        <span className="text-amber-700/70 dark:text-amber-400/70">· cached {rel ?? when}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs dark:border-emerald-500/40 dark:bg-emerald-500/10"
      title={`Live from Google Sheets. Sheet last modified ${when}.`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="font-medium text-emerald-800 dark:text-emerald-300">Live</span>
      <span className="text-emerald-700/70 dark:text-emerald-400/70">· updated {rel ?? when}</span>
    </div>
  );
}

function fullTimestamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return fullTimestamp(iso);
}

/* ------------------------------------------------------------------ */
/* Email — inbox list + reader                                        */
/* ------------------------------------------------------------------ */
function EmailView({ emails }: { emails: EmailMsg[] }) {
  const [sel, setSel] = useState(0);
  const msg = emails[sel];
  return (
    <section className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          Inbox · {emails.length}
        </div>
        <ul>
          {emails.map((m, i) => {
            const active = i === sel;
            return (
              <li key={m.file}>
                <button
                  onClick={() => setSel(i)}
                  className={
                    "block w-full border-b border-neutral-100 px-3 py-2.5 text-left dark:border-neutral-800/60 " +
                    (active
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50")
                  }
                >
                  <div className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {shortName(m.from)}
                  </div>
                  <div className="truncate text-sm text-neutral-600 dark:text-neutral-300">
                    {m.subject}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-neutral-400">{prettyDate(m.date)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <article className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        {msg ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {msg.subject}
            </h2>
            <dl className="mt-3 space-y-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              <HeaderRow label="From" value={msg.from} />
              <HeaderRow label="To" value={msg.to} />
              {msg.cc && <HeaderRow label="Cc" value={msg.cc} />}
              <HeaderRow label="Date" value={msg.date} />
            </dl>
            <hr className="my-4 border-neutral-200 dark:border-neutral-800" />
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
              {msg.body}
            </pre>
            <p className="mt-6 text-xs text-neutral-400">{msg.file}</p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">No messages.</p>
        )}
      </article>
    </section>
  );
}

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 font-medium text-neutral-400">{label}</dt>
      <dd className="text-neutral-700 dark:text-neutral-300">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calls — readable transcript pages                                  */
/* ------------------------------------------------------------------ */
function CallsView({ transcripts }: { transcripts: Transcript[] }) {
  const [sel, setSel] = useState(0);
  const t = transcripts[sel];
  return (
    <section className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          Recorded calls · {transcripts.length}
        </div>
        <ul>
          {transcripts.map((tr, i) => {
            const active = i === sel;
            return (
              <li key={tr.file}>
                <button
                  onClick={() => setSel(i)}
                  className={
                    "block w-full border-b border-neutral-100 px-3 py-2.5 text-left dark:border-neutral-800/60 " +
                    (active
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50")
                  }
                >
                  <div className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {tr.meta["Account"] ?? tr.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-neutral-400">
                    {tr.meta["Date"] ?? ""}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <article className="max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        {t ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {t.meta["Account"] ?? t.title}
            </h2>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              {["Date", "Duration", "Participants"].map((k) =>
                t.meta[k] ? (
                  <div key={k} className="max-w-full">
                    <span className="font-medium text-neutral-400">{k}: </span>
                    <span className="text-neutral-700 dark:text-neutral-300">{t.meta[k]}</span>
                  </div>
                ) : null
              )}
            </dl>
            <hr className="my-4 border-neutral-200 dark:border-neutral-800" />
            <div className="space-y-4">
              {t.turns.map((turn, i) => (
                <div key={i}>
                  {turn.speaker && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                      {turn.speaker}
                    </div>
                  )}
                  <p className="mt-0.5 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                    {turn.text}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-neutral-400">{t.file}</p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">No transcripts.</p>
        )}
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared bits                                                  */
/* ------------------------------------------------------------------ */
function SubToggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={
              "rounded px-3 py-1 text-sm font-medium transition-colors " +
              (active
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function shortName(addr: string): string {
  const m = addr.match(/^\s*"?([^"<]+?)"?\s*<.*>\s*$/);
  return (m ? m[1] : addr).trim();
}

function prettyDate(d: string): string {
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

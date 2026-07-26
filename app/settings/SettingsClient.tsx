"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import type {
  Declaration,
  DeclarationStatus,
  FreshnessRow,
  StalenessTier,
  VolatilityClass,
} from "@/lib/settings";
import {
  createDeclaration,
  saveDeclaration,
  saveFreshness,
  type SettingsFormState,
} from "./actions";

/* Initial form state. Defined here (not in the "use server" actions file, which
 * may only export async functions). */
const IDLE_STATE: SettingsFormState = { ok: false, error: null };

/* Shared field styling. */
const input =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const label =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400";
const saveBtn =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700";

/* Inline, styled validation message — replaces the raw Next.js error page. */
function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
    >
      {message}
    </p>
  );
}

/* Small success note shown briefly after a save. */
function FormSaved({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
      Saved.
    </p>
  );
}

export default function SettingsClient({
  declarations,
  freshness,
}: {
  declarations: Declaration[];
  freshness: FreshnessRow[];
}) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-3 text-sm text-neutral-400">
          <Link href="/" className="hover:text-neutral-700 dark:hover:text-neutral-200">
            Home
          </Link>
          <span>/</span>
          <Link href="/sources" className="hover:text-neutral-700 dark:hover:text-neutral-200">
            Sources
          </Link>
          <span>/</span>
          <span className="text-neutral-600 dark:text-neutral-300">Settings</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Two knobs that govern how TrustLayer resolves conflicts. <b>Declarations</b>{" "}
          say which system is the source of truth for what. The <b>freshness policy</b>{" "}
          says how fast each kind of data goes stale and how much staleness hurts.
        </p>
      </header>

      {/* --- Declarations ------------------------------------------------ */}
      <section className="mb-12">
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Systems of record</h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Editing a declaration doesn&apos;t overwrite it — TrustLayer records a new
            version and keeps the old one, so the authorship trail survives. Ratify a
            declaration to promote it toward the team canon.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {declarations.map((d) => (
            <DeclarationCard key={d.id} d={d} />
          ))}
          <NewDeclarationCard />
        </div>
      </section>

      {/* --- Freshness --------------------------------------------------- */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Freshness policy</h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            One row per source and kind of data. <b>Volatility</b> is how fast it
            changes; <b>cost of staleness</b> is how much it hurts to answer from an
            old copy. These are policy, so they&apos;re edited in place.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {freshness.map((f) => (
            <FreshnessCard key={f.id} f={f} />
          ))}
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Declaration card                                                   */
/* ------------------------------------------------------------------ */
const STATUS_OPTIONS: DeclarationStatus[] = [
  "proposed",
  "ratified",
  "rejected",
  "superseded",
];

function statusChip(status: DeclarationStatus): string {
  switch (status) {
    case "ratified":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "proposed":
      return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
    case "rejected":
      return "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300";
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

function DeclarationCard({ d }: { d: Declaration }) {
  const [state, formAction] = useFormState(saveDeclaration, IDLE_STATE);
  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <input type="hidden" name="id" value={d.id} />

      <div className="flex items-start justify-between gap-2">
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-medium capitalize " + statusChip(d.status)
          }
        >
          {d.status}
        </span>
        {d.ratified_at && (
          <span className="text-xs text-neutral-400">ratified</span>
        )}
      </div>

      <div>
        <span className={label}>Declaration</span>
        <textarea
          name="statement"
          defaultValue={d.statement}
          rows={2}
          required
          className={input + " resize-y"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>Scope</span>
          <input name="scope" defaultValue={d.scope ?? ""} className={input} />
        </div>
        <div>
          <span className={label}>Author</span>
          <input name="author" defaultValue={d.author ?? ""} className={input} />
        </div>
      </div>

      <div>
        <span className={label}>Evidence link</span>
        <input
          name="evidence_link"
          defaultValue={d.evidence_link ?? ""}
          placeholder="https://…"
          className={input}
        />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={label}>Status</span>
          <select name="status" defaultValue={d.status} className={input}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={saveBtn}>
          Save
        </button>
      </div>

      <FormError message={state.error} />
      <FormSaved show={state.ok} />
    </form>
  );
}

function NewDeclarationCard() {
  const [state, formAction] = useFormState(createDeclaration, IDLE_STATE);
  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-4 dark:border-neutral-700 dark:bg-neutral-900/20"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Add a declaration
      </span>
      <textarea
        name="statement"
        rows={2}
        required
        placeholder="e.g. Billing is the system of record for invoiced amounts."
        className={input + " resize-y"}
      />
      <div className="grid grid-cols-2 gap-3">
        <input name="scope" placeholder="scope" className={input} />
        <input name="author" placeholder="author" className={input} />
      </div>
      <input name="evidence_link" placeholder="evidence link (optional)" className={input} />
      <div className="flex justify-end">
        <button type="submit" className={saveBtn}>
          Add
        </button>
      </div>

      <FormError message={state.error} />
      <FormSaved show={state.ok} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Freshness card                                                     */
/* ------------------------------------------------------------------ */
const VOLATILITY_OPTIONS: { value: VolatilityClass; hint: string }[] = [
  { value: "live", hint: "changes constantly" },
  { value: "days", hint: "changes over days" },
  { value: "months", hint: "changes over months" },
  { value: "stable", hint: "rarely changes" },
];
const STALENESS_OPTIONS: { value: StalenessTier; hint: string }[] = [
  { value: "critical", hint: "wrong = serious harm" },
  { value: "high", hint: "wrong = costly" },
  { value: "low", hint: "wrong = minor" },
];

function tierChip(tier: StalenessTier): string {
  switch (tier) {
    case "critical":
      return "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300";
    case "high":
      return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

function FreshnessCard({ f }: { f: FreshnessRow }) {
  const [state, formAction] = useFormState(saveFreshness, IDLE_STATE);
  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <input type="hidden" name="id" value={f.id} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {f.source}
          </div>
          <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {f.artifact_type}
          </div>
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize " +
            tierChip(f.staleness_tier)
          }
        >
          {f.staleness_tier}
        </span>
      </div>

      <div>
        <span className={label}>Volatility</span>
        <select name="volatility" defaultValue={f.volatility} className={input}>
          {VOLATILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value} — {o.hint}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={label}>Cost of staleness</span>
        <select name="staleness_tier" defaultValue={f.staleness_tier} className={input}>
          {STALENESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value} — {o.hint}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={label}>Notes</span>
        <input name="notes" defaultValue={f.notes ?? ""} className={input} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className={saveBtn}>
          Save
        </button>
      </div>

      <FormError message={state.error} />
      <FormSaved show={state.ok} />
    </form>
  );
}

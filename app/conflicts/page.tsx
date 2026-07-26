import Link from "next/link";
import { detectConflicts, type Conflict } from "@/lib/conflicts/detect";
import { loadConnections } from "@/lib/ask/sources";
import { SOURCE_LABEL } from "@/lib/ask/types";
import ConflictsClient from "./ConflictsClient";

// Conflicts are a live view over the ledger — recompute on every request.
export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  let conflicts: Conflict[] = [];
  let migrated = true;
  let disconnected: string[] = [];
  try {
    // Same revocation rule as Ask: a disconnected source is excluded at the SQL
    // boundary, so its values, name and dates cannot appear on any card here.
    const conns = await loadConnections();
    disconnected = conns.filter((c) => !c.connected).map((c) => SOURCE_LABEL[c.source_tool]);
    ({ conflicts } = await detectConflicts({
      connected: conns.filter((c) => c.connected).map((c) => c.source_tool),
    }));
  } catch {
    // Ledger not built yet (no facts) or DB unreachable.
    migrated = false;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Conflicts</h1>
          <Link href="/facts" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Facts →
          </Link>
          <Link href="/admin" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Admin →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Where your sources disagree about the same thing. Nothing is deleted or
          hidden — each card shows every value, which one wins, and the plain-English
          rule behind it. Winners come from your declared systems of record first,
          then corroboration across sources, then freshness.
        </p>
      </header>

      {!migrated ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          No facts to compare yet. Run{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">npm run db:migrate</code>,
          then ingest from{" "}
          <Link href="/admin" className="font-semibold underline">
            /admin
          </Link>
          .
        </div>
      ) : (
        <>
          {disconnected.length > 0 && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <span className="font-semibold">
                {disconnected.join(", ")} {disconnected.length === 1 ? "is" : "are"} disconnected.
              </span>{" "}
              These conflicts are computed from the remaining sources only — nothing
              from a disconnected source is shown here. Reconnect from{" "}
              <Link href="/admin" className="font-semibold underline">
                /admin
              </Link>{" "}
              to restore it.
            </div>
          )}
          <ConflictsClient conflicts={conflicts} />
        </>
      )}
    </main>
  );
}

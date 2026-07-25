import { loadDeclarations, loadFreshness } from "@/lib/settings";
import { isDatabaseReachable } from "@/lib/db";
import SettingsClient from "./SettingsClient";

// Read live from Postgres on every request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const connected = await isDatabaseReachable();

  if (!connected) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The database isn&apos;t reachable, so declarations and freshness policy
          can&apos;t be loaded. Set <code>DATABASE_URL</code> and run{" "}
          <code>npm run db:migrate</code>, then reload.
        </p>
      </main>
    );
  }

  const [declarations, freshness] = await Promise.all([
    loadDeclarations(),
    loadFreshness(),
  ]);

  return <SettingsClient declarations={declarations} freshness={freshness} />;
}

import Link from "next/link";
import { isDatabaseReachable } from "@/lib/db";
import { SUGGESTED_DECLARATIONS } from "@/lib/onboarding";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const dbConnected = await isDatabaseReachable();

  if (!dbConnected) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set up TrustLayer</h1>
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          The database isn&apos;t reachable. Set <code>DATABASE_URL</code> and run{" "}
          <code>npm run db:migrate</code>, then reload.
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-700 hover:underline dark:text-blue-400">
          ← Home
        </Link>
      </main>
    );
  }

  return <OnboardingClient suggestedDeclarations={SUGGESTED_DECLARATIONS} />;
}

import { isDatabaseReachable } from "@/lib/db";

// Check reachability on every request rather than caching at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const dbConnected = await isDatabaseReachable();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">TrustLayer</h1>

      {dbConnected ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-1.5 text-sm font-medium text-green-800">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          Database connected
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
          Database not connected
        </span>
      )}
    </main>
  );
}

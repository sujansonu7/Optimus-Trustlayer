import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkProduct } from "@/lib/agent/library";
import WorkProductView from "@/app/WorkProductView";

// One saved work product, rendered with full envelope citations.
export const dynamic = "force-dynamic";

export default async function WorkProductPage({ params }: { params: { id: string } }) {
  let row;
  try {
    row = await loadWorkProduct(params.id);
  } catch {
    row = null;
  }
  if (!row) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/library" className="text-blue-700 hover:underline dark:text-blue-400">
          ← Library
        </Link>
      </div>

      <WorkProductView wp={row.body} meta={{ createdAt: row.createdAt }} />

      <nav className="mt-8 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <Link href="/" className="text-blue-700 hover:underline dark:text-blue-400">
          Ask another
        </Link>
        <Link href="/library" className="text-blue-700 hover:underline dark:text-blue-400">
          All work products
        </Link>
      </nav>
    </main>
  );
}

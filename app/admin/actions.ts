"use server";

import { revalidatePath } from "next/cache";
import { setConnected } from "@/lib/ask/sources";
import { resetDemo } from "@/lib/reset";
import { clearAgentSessions, clearWorkProducts } from "@/lib/agent/library";
import { ALL_TOOLS, type SourceTool } from "@/lib/ask/types";

/**
 * Connect / disconnect one source. Disconnecting makes that source's facts
 * structurally unreachable to Ask (retrieval filters by connected tools) and
 * invalidates every cached answer that depended on it, so the next ask
 * recomputes from the remaining evidence. Returns how many beliefs were
 * invalidated for the /admin toggle to surface.
 */
export async function toggleSource(
  tool: SourceTool,
  connected: boolean
): Promise<{ invalidated: number }> {
  if (!ALL_TOOLS.includes(tool)) throw new Error(`Unknown source: ${tool}`);

  const result = await setConnected(tool, connected);

  // The home page (source pills + Ask) and this page both reflect the change.
  revalidatePath("/");
  revalidatePath("/admin");
  return result;
}

/**
 * Reset the demo: wipe all derived data (facts, caches, resolved entities, the
 * decision log), restore the seed declarations, and reconnect every source — so
 * /onboarding can be run again from scratch. Returns what was cleared.
 */
export async function resetDemoAction(): Promise<{ cleared: string[] }> {
  const result = await resetDemo();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/facts");
  revalidatePath("/conflicts");
  revalidatePath("/decisions");
  return result;
}

/**
 * Delete every agent run log (sessions + steps). Proves standing rule #5: the
 * engine holds no durable knowledge. Facts, declarations, conflicts, and the
 * delivered work products in the Library are all untouched — only the disposable
 * run state disappears. Sessions that are still running are kept (deleting one
 * mid-run is what caused the FK step errors). Returns how many sessions were
 * removed and how many running sessions were left in place.
 */
export async function clearAgentSessionsAction(): Promise<{ sessions: number; skipped: number }> {
  const result = await clearAgentSessions();
  revalidatePath("/admin");
  return result;
}

/**
 * Empty the Library — delete every delivered work product (the saved briefs).
 * Knowledge is untouched: the fact ledger, declarations, conflicts, and any
 * facts a brief filed back into the graph all survive. Returns how many products
 * were removed. Use it to tidy leftover briefs from prior test/demo runs.
 */
export async function clearLibraryAction(): Promise<{ products: number }> {
  const result = await clearWorkProducts();
  revalidatePath("/admin");
  revalidatePath("/library");
  return result;
}

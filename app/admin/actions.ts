"use server";

import { revalidatePath } from "next/cache";
import { setConnected } from "@/lib/ask/sources";
import { resetDemo } from "@/lib/reset";
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

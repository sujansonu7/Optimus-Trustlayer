"use server";

import { revalidatePath } from "next/cache";
import { recordReview, clearReview, type ReviewVerdict } from "@/lib/entities/review";
import { query } from "@/lib/db";

/** Invalidate every live cached belief so dependent answers recompute. Mirrors
 *  what /decisions does on revert, and for the same reason. */
async function invalidateAllBeliefs(): Promise<void> {
  await query(`update answer_cache set invalidated_at = now() where invalidated_at is null`);
}

/**
 * Record an Approve-merge / Keep-separate verdict.
 *
 * A merge changes how facts group, which changes arbitration outcomes WITHOUT
 * changing any evidence content hash — so the hash-keyed belief cache would
 * happily serve a stale answer. Invalidate every cached belief, exactly as
 * reverting a merge on /decisions does.
 */
export async function decidePairAction(
  aliasKey: string,
  canonicalKey: string,
  verdict: ReviewVerdict
): Promise<void> {
  await recordReview(aliasKey, canonicalKey, verdict);
  if (verdict === "merge") await invalidateAllBeliefs();
  revalidateResolutionSurfaces();
}

/** Undo a verdict — the pair returns to the queue. */
export async function undoPairAction(aliasKey: string, canonicalKey: string): Promise<void> {
  await clearReview(aliasKey, canonicalKey);
  await invalidateAllBeliefs();
  revalidateResolutionSurfaces();
}

function revalidateResolutionSurfaces(): void {
  revalidatePath("/review");
  revalidatePath("/entities");
  revalidatePath("/conflicts");
  revalidatePath("/facts");
  revalidatePath("/admin");
  revalidatePath("/");
}

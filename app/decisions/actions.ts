"use server";

import { revalidatePath } from "next/cache";
import {
  revertDecision,
  restoreDecision,
  materializeDecisions,
} from "@/lib/decisions";

/** Revert one automatic decision (split a merge / flip an arbitration / drop a
 *  classified fact) and recompute dependent answers. */
export async function revertDecisionAction(
  id: string
): Promise<{ summary: string }> {
  const r = await revertDecision(id);
  revalidatePath("/decisions");
  revalidatePath("/"); // the Ask box + conflicts reflect the new answer
  revalidatePath("/conflicts");
  return { summary: r.summary };
}

/** Put a reverted decision back in force. */
export async function restoreDecisionAction(
  id: string
): Promise<{ summary: string }> {
  const r = await restoreDecision(id);
  revalidatePath("/decisions");
  revalidatePath("/");
  revalidatePath("/conflicts");
  return { summary: r.summary };
}

/** (Re)build the decision log from the current fact ledger. */
export async function rebuildDecisionsAction(): Promise<{ logged: number; total: number }> {
  const r = await materializeDecisions();
  revalidatePath("/decisions");
  return r;
}

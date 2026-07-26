"use server";

import { revalidatePath } from "next/cache";
import {
  verifySheet,
  writeDeclarations,
  proofQuestions,
  type SheetStatus,
  type DeclarationChoice,
  type ProofQuestion,
} from "@/lib/onboarding";
import { materializeDecisions } from "@/lib/decisions";
import { setConnected } from "@/lib/ask/sources";
import type { SourceTool } from "@/lib/ask/types";

/** The Renewals Sheet connects for real — hit Google live and report back. */
export async function verifySheetAction(): Promise<SheetStatus> {
  return verifySheet();
}

/**
 * Mark a source connected in the ledger as its card completes.
 *
 * Onboarding used to show "✓ Connected" purely as local component state, so a
 * source left disconnected by an earlier revoke demo would read as connected
 * here while Ask still refused to retrieve from it — the wizard and the product
 * disagreeing about the same source. Connecting a card now actually reconnects
 * it, which is what the card claims to do.
 */
export async function connectSourceAction(tool: SourceTool): Promise<void> {
  await setConnected(tool, true);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/conflicts");
}

/** Log every automatic decision the just-finished build produced. Called once
 *  the live build completes, so /decisions is populated. */
export async function materializeAction(): Promise<{ logged: number; total: number }> {
  const r = await materializeDecisions();
  revalidatePath("/decisions");
  return r;
}

/** Write the declaration wizard's choices as real declarations. */
export async function writeDeclarationsAction(
  choices: DeclarationChoice[]
): Promise<{ written: number }> {
  const r = await writeDeclarations(choices);
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/conflicts");
  return r;
}

/** Mine the built graph for 3 verified, answerable proof questions. */
export async function proofQuestionsAction(): Promise<ProofQuestion[]> {
  return proofQuestions();
}

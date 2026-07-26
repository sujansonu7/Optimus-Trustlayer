"use server";

import { revalidatePath } from "next/cache";
import { briefQualityStats, recordQuality, setParallelEnabled } from "@/lib/crew/store";
import {
  PARALLEL_MIN_RATED,
  PARALLEL_QUALITY_BAR,
  parallelUnlocked,
  type BriefQuality,
  type BriefQualityStats,
} from "@/lib/crew/types";

/**
 * Flip the Parallel toggle (OFF by default, capped at 2 concurrent). The gate is
 * ENFORCED here, not merely advised: turning it ON requires a sustained
 * brief-quality signal (≥ PARALLEL_MIN_RATED rated briefs at ≥ PARALLEL_QUALITY_BAR%).
 * Turning it OFF is always allowed. Returns the effective state, the current
 * stats, and — when blocked — the plain-English reason, so the UI can reflect
 * reality rather than an optimistic guess.
 */
export async function setParallelAction(
  enabled: boolean
): Promise<{ enabled: boolean; blocked: string | null; stats: BriefQualityStats }> {
  const stats = await briefQualityStats();
  if (enabled && !parallelUnlocked(stats)) {
    return {
      enabled: false,
      blocked: `Parallel unlocks at ≥${PARALLEL_QUALITY_BAR}% no-correction across ≥${PARALLEL_MIN_RATED} rated briefs — currently ${stats.pct ?? 0}% across ${stats.rated}.`,
      stats,
    };
  }
  await setParallelEnabled(enabled);
  revalidatePath("/crew");
  revalidatePath("/admin");
  return { enabled, blocked: null, stats };
}

/**
 * Record the owner's one-tap brief-quality verdict for a workstream and move its
 * card to Done. Returns the updated running stats so the UI can echo the new
 * percentage without a full reload.
 */
export async function recordQualityAction(
  workstreamId: string,
  quality: BriefQuality
): Promise<BriefQualityStats> {
  const stats = await recordQuality(workstreamId, quality);
  revalidatePath("/crew");
  revalidatePath("/admin");
  return stats;
}

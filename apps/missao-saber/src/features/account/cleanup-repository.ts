import "server-only";
import { inArray } from "@informach/db";
import { missaoProfiles, missaoReports } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";

/** Canonical authority is established by the caller in this transaction.
 * Reports must be removed explicitly: their native FK uses SET NULL. */
export async function eraseMissaoProfiles(tx: FamilyTransaction, activationIds: string[]) {
  if (!activationIds.length) return;
  const selected = tx
    .select({ id: missaoProfiles.id })
    .from(missaoProfiles)
    .where(inArray(missaoProfiles.familyProfileId, activationIds));
  await tx.delete(missaoReports).where(inArray(missaoReports.profileId, selected));
  await tx.delete(missaoProfiles).where(inArray(missaoProfiles.familyProfileId, activationIds));
}

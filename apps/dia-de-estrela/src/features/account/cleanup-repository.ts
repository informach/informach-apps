import "server-only";
import { inArray } from "@informach/db";
import { estrelaChildren } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";

/** The caller locks and authorizes canonical activations first. Cascades cover
 * routines, voice, goals/photos, stars, rewards requested and device links. */
export async function eraseEstrelaProfiles(tx: FamilyTransaction, activationIds: string[]) {
  if (!activationIds.length) return [];
  return tx
    .delete(estrelaChildren)
    .where(inArray(estrelaChildren.familyProfileId, activationIds))
    .returning({ id: estrelaChildren.id });
}

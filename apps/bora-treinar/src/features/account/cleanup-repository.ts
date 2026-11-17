import "server-only";
import { type Database, inArray } from "@informach/db";
import { boraProfiles } from "@informach/db/schema";

export type BoraCleanupTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called after the canonical domain authorizes and locks these activations.
 * Profile history follows its native FK cascades; creator user_id is not ownership. */
export async function eraseBoraProfiles(tx: BoraCleanupTransaction, activationIds: string[]) {
  if (!activationIds.length) return [];
  return tx
    .delete(boraProfiles)
    .where(inArray(boraProfiles.familyProfileId, activationIds))
    .returning({ id: boraProfiles.id });
}

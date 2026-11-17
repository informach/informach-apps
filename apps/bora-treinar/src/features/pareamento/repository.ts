import "server-only";
import { and, db, eq, inArray, or, sql } from "@informach/db";
import { boraProfiles } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import {
  captureProfileDelegations,
  delegatedProfileAccessCondition,
} from "@informach/family/delegation";
import { assertAllowed } from "@/lib/errors";
import { boraAccessInTransaction } from "../billing/access-repository";
import { enabledTrainerIds } from "../familia/repository";
import type { PairingAuthority, PairingContext } from "./context";

export function capturePairingDelegations(context: PairingContext) {
  return db.transaction(async (tx) => {
    const profiles = await tx
      .select({ activationId: boraProfiles.familyProfileId })
      .from(boraProfiles)
      .where(inArray(boraProfiles.id, context.profileIds));
    assertAllowed(
      profiles.length === context.profileIds.length,
      "ACCESS_DENIED",
      "Perfis não disponíveis.",
    );
    const delegations = await captureProfileDelegations(
      tx,
      context.actorId,
      "bora-treinar",
      context.familyGroupId,
      profiles.map((profile) => profile.activationId),
    );
    const access = await boraAccessInTransaction(tx, context.actorId, context.familyGroupId);
    const enabled = new Set(
      await enabledTrainerIds(context.actorId, context.familyGroupId, access.profileLimit, tx),
    );
    assertAllowed(
      access.unlocked && context.profileIds.every((id) => enabled.has(id)),
      "PLAN",
      "O celular como câmera faz parte do Compasso.",
    );
    return delegations;
  });
}

/** Native IDs and canonical grants must still match the exact authority captured on issuance. */
export async function delegatedTrainerIds(
  authority: PairingAuthority,
  tx: FamilyTransaction | typeof db = db,
) {
  if (
    authority.delegations.length !== authority.profileIds.length ||
    authority.delegations.some((claim) => claim.groupId !== authority.familyGroupId)
  )
    return [];
  const rows = await tx
    .select({ id: boraProfiles.id })
    .from(boraProfiles)
    .where(
      and(
        inArray(boraProfiles.id, authority.profileIds),
        or(
          ...authority.delegations.map((claim) =>
            and(
              eq(boraProfiles.familyProfileId, claim.profileId),
              delegatedProfileAccessCondition(authority.actorId, "bora-treinar", {
                profileId: boraProfiles.familyProfileId,
                groupId: sql`${claim.groupId}`,
                delegationKey: sql`${claim.delegationKey}`,
                readGrantId: sql`${claim.readGrantId}`,
                writeGrantId: sql`${claim.writeGrantId}`,
              }),
            ),
          ),
        ),
      ),
    );
  return rows.map((row) => row.id);
}

/** A delivery checks coverage, slots and the exact grants in one household transaction. */
export function pairingAvailable(authority: PairingAuthority) {
  return db.transaction(async (tx) => {
    const access = await boraAccessInTransaction(tx, authority.actorId, authority.familyGroupId);
    if (!access.unlocked) return false;
    const enabled = new Set(
      await enabledTrainerIds(authority.actorId, authority.familyGroupId, access.profileLimit, tx),
    );
    const delegated = new Set(await delegatedTrainerIds(authority, tx));
    return authority.profileIds.every((id) => enabled.has(id) && delegated.has(id));
  });
}

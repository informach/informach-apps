import "server-only";
import type { FamilyTransaction } from "@informach/family";
import { assertAllowed } from "@/lib/errors";
import { boraAccessInTransaction } from "../billing/access-repository";
import { enabledTrainerIds } from "./repository";
import { lockTrainerAccess } from "./scope";

/** Commercial slots belong to the whole household, including profiles hidden from this adult. */
export async function lockTrainerUse(
  tx: FamilyTransaction,
  actorId: string,
  groupId: string,
  ids: string[],
) {
  const scopes = await lockTrainerAccess(tx, actorId, ids);
  assertAllowed(
    scopes.every((scope) => scope.groupId === groupId),
    "PROFILE_CONTEXT",
    "Treine junto com perfis da mesma família.",
  );
  const access = await boraAccessInTransaction(tx, actorId, groupId);
  const enabled = new Set(await enabledTrainerIds(actorId, groupId, access.profileLimit, tx));
  assertAllowed(
    ids.every((id) => enabled.has(id)),
    "PLAN",
    "Este perfil não está disponível no plano atual.",
  );
  return access;
}

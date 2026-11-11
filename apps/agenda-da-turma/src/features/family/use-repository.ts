import "server-only";
import {
  type FamilyAction,
  type FamilyTransaction,
  requireFamilyCondition,
} from "@informach/family";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import { groupStudentIds } from "@/features/students/repository";
import type { AgendaAuthority } from "./authority";
import { lockAgendaProfiles } from "./scope";

/** Rights and commercial slots are current when the mutation is committed. */
export async function lockAgendaUse(
  tx: FamilyTransaction,
  actor: AgendaAuthority,
  profileIds: readonly string[],
  action: FamilyAction = "write",
) {
  const access = await agendaAccessInTransaction(tx, actor);
  await lockAgendaProfiles(tx, actor, profileIds, action);
  const active = (await groupStudentIds(tx, actor)).slice(0, access.profileLimit);
  requireFamilyCondition(
    profileIds.every((id) => active.some((p) => p.id === id)),
    "CAPACITY_EXCEEDED",
    "Este perfil está fora da cobertura atual da família.",
  );
  return access;
}

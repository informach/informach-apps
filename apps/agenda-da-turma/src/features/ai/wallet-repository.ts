import "server-only";
import type { CreditAwareBillingClient } from "@informach/ai-core";
import {
  createRecoverableAiOperations,
  purgeAiOperationReceipts,
} from "@informach/ai-core/operations";
import { createCompassoWallet } from "@informach/billing/credits";
import { PRODUCTS } from "@informach/config/products";
import { and, db, eq } from "@informach/db";
import { agendaStudentProfiles, familyAppProfiles } from "@informach/db/schema";
import { requireFamilyCondition } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, lockAgendaProfiles } from "@/features/family/scope";
import { lockAgendaUse } from "@/features/family/use-repository";

const sharedWallet = createCompassoWallet({ db, products: PRODUCTS });
const context = (actor: AgendaAuthority) => ({
  actorId: actor.userId,
  groupId: actor.familyGroupId,
});
export function getAgendaAiBalance(actor: AgendaAuthority) {
  return sharedWallet.getBalance(context(actor));
}

/** Server-only binding: the caller cannot choose another wallet, actor or person. */
export async function agendaAiBilling(actor: AgendaAuthority, profileId: string) {
  const [profile] = await db
    .select({ personId: familyAppProfiles.personId })
    .from(agendaStudentProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
    .where(
      and(
        eq(agendaStudentProfiles.id, profileId),
        agendaProfileCondition(actor),
        agendaProfileCondition(actor, "write"),
        agendaProfileCondition(actor, "use_ai"),
      ),
    );
  requireFamilyCondition(profile);
  const wallet = createCompassoWallet({
    db,
    products: PRODUCTS,
    async authorizeSpend(tx, input) {
      requireFamilyCondition(
        input.app === "agenda-da-turma" && input.personId === profile.personId,
      );
      await lockAgendaUse(tx, actor, [profileId], "use_ai");
      const [current] = await lockAgendaProfiles(tx, actor, [profileId], "write");
      requireFamilyCondition(current?.familyProfileId);
      const [activation] = await tx
        .select({ personId: familyAppProfiles.personId })
        .from(familyAppProfiles)
        .where(eq(familyAppProfiles.id, current.familyProfileId));
      requireFamilyCondition(activation?.personId === profile.personId);
    },
  });
  const owner = { type: "family" as const, id: actor.familyGroupId };
  const billing: CreditAwareBillingClient = {
    reserveCredits(input) {
      requireFamilyCondition(
        input.owner.type === "family" &&
          input.owner.id === owner.id &&
          input.app === "agenda-da-turma",
      );
      const { owner: _owner, ...bound } = input;
      return wallet.reserve(context(actor), { ...bound, personId: profile.personId });
    },
    commitReservation: (input) => wallet.commit(context(actor), input),
    releaseReservation: (input) => wallet.release(context(actor), input),
  };
  return { billing, owner };
}

export async function agendaAiOperations(actor: AgendaAuthority, profileId: string) {
  const { billing } = await agendaAiBilling(actor, profileId);
  return createRecoverableAiOperations({
    db,
    billing,
    actorId: actor.userId,
    groupId: actor.familyGroupId,
    app: "agenda-da-turma",
    scopeKey: profileId,
    async authorize(tx) {
      await lockAgendaUse(tx, actor, [profileId], "use_ai");
      await lockAgendaProfiles(tx, actor, [profileId], "write");
    },
  });
}
export const purgeAgendaAiReceipts = (now: Date) =>
  purgeAiOperationReceipts(db, "agenda-da-turma", now);

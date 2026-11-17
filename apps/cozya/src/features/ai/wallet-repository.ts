import "server-only";
import type { CreditAwareBillingClient } from "@informach/ai-core";
import { createRecoverableAiOperations } from "@informach/ai-core/operations";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { createCompassoWallet } from "@informach/billing/credits";
import { PRODUCTS } from "@informach/config/products";
import { and, db, eq, gt, isNull, ne, or, sql } from "@informach/db";
import { cozyaAiOperations } from "@informach/db/schema";
import { requireFamilyCondition } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import type { CozyaAuthority } from "@/features/family/authority";

export type CozyaAiActor = CozyaAuthority & { familyGroupId: string };
const wallet = createCompassoWallet({ db, products: PRODUCTS });
export function getCozyaAiBalance(actor: CozyaAuthority) {
  requireFamilyCondition(actor.familyGroupId, "INVALID_INPUT");
  return wallet.getBalance({ actorId: actor.userId, groupId: actor.familyGroupId });
}
export function createCozyaAiOperations(actor: CozyaAiActor, operationId: string) {
  const context = { actorId: actor.userId, groupId: actor.familyGroupId };
  const billing: CreditAwareBillingClient = {
    reserveCredits(input) {
      requireFamilyCondition(
        input.owner.type === "family" &&
          input.owner.id === actor.familyGroupId &&
          input.app === "cozya",
      );
      const { owner: _owner, ...bound } = input;
      return wallet.reserve(context, bound);
    },
    commitReservation: (input) => wallet.commit(context, input),
    releaseReservation: (input) => wallet.release(context, input),
  };
  return createRecoverableAiOperations({
    db,
    billing,
    actorId: actor.userId,
    groupId: actor.familyGroupId,
    app: "cozya",
    scopeKey: operationId,
    async authorize(tx) {
      await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${actor.userId}`}))`,
      );
      const [registered] = await tx
        .select({ id: cozyaAiOperations.id, revision: cozyaAiOperations.webParticipationRevision })
        .from(cozyaAiOperations)
        .where(
          and(
            eq(cozyaAiOperations.id, operationId),
            eq(cozyaAiOperations.userId, actor.userId),
            eq(cozyaAiOperations.familyGroupId, actor.familyGroupId),
            gt(cozyaAiOperations.expiresAt, new Date()),
            or(isNull(cozyaAiOperations.statusCode), ne(cozyaAiOperations.statusCode, 410)),
          ),
        );
      requireFamilyCondition(registered);
      await lockActiveWebParticipation(tx, actor.userId, registered.revision);
    },
  });
}

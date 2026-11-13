import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import {
  familyGroupPeople,
  familyMembers,
  familyPeople,
  familyPersonManagers,
  familyPersonTransfers,
  users,
} from "@informach/db/schema";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireFamilyCondition } from "./errors";
import { audit, lockGroup, lockPerson, requireActor, requireMember } from "./internal";
import type { FamilyServiceConfig, FamilyTransaction } from "./types";
import { id } from "./validation";

const requestSchema = z.object({
  groupId: z.uuid(),
  personId: z.uuid(),
  targetUserId: z.string().min(1).max(200),
  expectedVersion: z.number().int().positive(),
});
export type RequestPersonTransferInput = z.infer<typeof requestSchema>;

async function requireTransferSource(
  tx: FamilyTransaction,
  userId: string,
  groupId: string,
  personId: string,
  now: Date,
) {
  await requireMember(tx, userId, groupId, now);
  // Archived identity still has a custodian. Transferring it must not require
  // restoring content or expanding the family's active-person allowance.
  const [person] = await tx
    .select({ person: familyPeople })
    .from(familyPeople)
    .innerJoin(
      familyGroupPeople,
      and(eq(familyGroupPeople.personId, familyPeople.id), eq(familyGroupPeople.groupId, groupId)),
    )
    .innerJoin(
      familyPersonManagers,
      and(
        eq(familyPersonManagers.personId, familyPeople.id),
        eq(familyPersonManagers.userId, userId),
      ),
    )
    .where(eq(familyPeople.id, personId));
  requireFamilyCondition(person);
  return person.person;
}

/** Canonical identity responsibility only. No application grants are copied. */
export async function requestPersonTransfer(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: RequestPersonTransferInput,
) {
  const input = requestSchema.parse(raw);
  requireFamilyCondition(
    input.targetUserId !== actorId,
    "INVALID_INPUT",
    "Escolha outro adulto da família.",
  );
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, input.personId);
    const now = deps.now?.() ?? new Date();
    const person = await requireTransferSource(tx, actorId, input.groupId, input.personId, now);
    requireFamilyCondition(
      !person.userId,
      "INVALID_INPUT",
      "Uma conta adulta administra o próprio cadastro.",
    );
    requireFamilyCondition(
      person.version === input.expectedVersion,
      "CONFLICT",
      "O cadastro mudou. Confira os dados antes de transferir.",
    );
    await requireMember(tx, input.targetUserId, input.groupId, now);
    const [pending] = await tx
      .select()
      .from(familyPersonTransfers)
      .where(
        and(
          eq(familyPersonTransfers.personId, input.personId),
          isNull(familyPersonTransfers.resolvedAt),
        ),
      )
      .for("update");
    if (
      pending &&
      pending.expiresAt > now &&
      pending.sourceUserId === actorId &&
      pending.targetUserId === input.targetUserId &&
      pending.expectedVersion === person.version &&
      pending.groupId === input.groupId
    )
      return pending;
    if (pending)
      await tx
        .update(familyPersonTransfers)
        .set({ outcome: "revoked", resolvedAt: now })
        .where(eq(familyPersonTransfers.id, pending.id));
    const [request] = await tx
      .insert(familyPersonTransfers)
      .values({
        groupId: input.groupId,
        personId: input.personId,
        sourceUserId: actorId,
        targetUserId: input.targetUserId,
        expectedVersion: person.version,
        expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      })
      .returning();
    requireFamilyCondition(request);
    await audit(tx, {
      event: "person.transfer_requested",
      actorId,
      groupId: input.groupId,
      personId: input.personId,
      targetId: request.id,
    });
    return request;
  });
}

export async function resolvePersonTransfer(
  deps: FamilyServiceConfig,
  actorId: string,
  requestId: string,
  decision: "accept" | "revoke",
) {
  id.parse(requestId);
  return deps.db.transaction(async (tx) => {
    await requireActor(tx, actorId, deps.now?.() ?? new Date());
    const [observed] = await tx
      .select()
      .from(familyPersonTransfers)
      .where(
        and(
          eq(familyPersonTransfers.id, requestId),
          or(
            eq(familyPersonTransfers.sourceUserId, actorId),
            eq(familyPersonTransfers.targetUserId, actorId),
          ),
        ),
      );
    requireFamilyCondition(observed);
    await lockGroup(tx, observed.groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, observed.personId);
    const [request] = await tx
      .select()
      .from(familyPersonTransfers)
      .where(eq(familyPersonTransfers.id, requestId))
      .for("update");
    requireFamilyCondition(request);
    const now = deps.now?.() ?? new Date();
    await requireActor(tx, actorId, now);
    if (decision === "revoke") {
      requireFamilyCondition(
        request.outcome !== "accepted",
        "CONFLICT",
        "Esta transferência já foi aceita.",
      );
      if (request.resolvedAt) return;
      await tx
        .update(familyPersonTransfers)
        .set({ outcome: "revoked", resolvedAt: now })
        .where(eq(familyPersonTransfers.id, request.id));
      await audit(tx, {
        event: "person.transfer_revoked",
        actorId,
        groupId: request.groupId,
        personId: request.personId,
        targetId: request.id,
      });
      return;
    }
    requireFamilyCondition(request.targetUserId === actorId);
    requireFamilyCondition(
      !request.resolvedAt && request.expiresAt > now,
      "CONFLICT",
      "Este pedido não está mais disponível.",
    );
    await requireMember(tx, actorId, request.groupId, now);
    const person = await requireTransferSource(
      tx,
      request.sourceUserId,
      request.groupId,
      request.personId,
      now,
    );
    requireFamilyCondition(
      !person.userId && person.version === request.expectedVersion,
      "CONFLICT",
      "O cadastro mudou. Peça uma nova transferência.",
    );
    await tx
      .insert(familyPersonManagers)
      .values({ personId: person.id, userId: actorId })
      .onConflictDoNothing();
    await tx
      .delete(familyPersonManagers)
      .where(
        and(
          eq(familyPersonManagers.personId, person.id),
          eq(familyPersonManagers.userId, request.sourceUserId),
        ),
      );
    await tx
      .update(familyPeople)
      .set({ version: sql`${familyPeople.version} + 1`, updatedAt: now })
      .where(eq(familyPeople.id, person.id));
    await tx
      .update(familyPersonTransfers)
      .set({ outcome: "accepted", resolvedAt: now })
      .where(eq(familyPersonTransfers.id, request.id));
    await audit(tx, {
      event: "person.transfer_accepted",
      actorId,
      groupId: request.groupId,
      personId: person.id,
      targetId: request.id,
    });
  });
}

/** A request explicitly discloses the common name to its recipient, never app content. */
export async function listPersonTransfers(
  tx: FamilyTransaction,
  actorId: string,
  groupId: string,
  now: Date,
) {
  const source = alias(users, "transfer_source");
  const target = alias(users, "transfer_target");
  return tx
    .select({
      id: familyPersonTransfers.id,
      personId: familyPeople.id,
      personName: familyPeople.displayName,
      sourceUserId: source.id,
      sourceName: source.name,
      targetUserId: target.id,
      targetName: target.name,
      expiresAt: familyPersonTransfers.expiresAt,
    })
    .from(familyPersonTransfers)
    .innerJoin(
      familyPeople,
      and(
        eq(familyPeople.id, familyPersonTransfers.personId),
        eq(familyPeople.version, familyPersonTransfers.expectedVersion),
      ),
    )
    .innerJoin(
      familyGroupPeople,
      and(eq(familyGroupPeople.personId, familyPeople.id), eq(familyGroupPeople.groupId, groupId)),
    )
    .innerJoin(
      familyPersonManagers,
      and(
        eq(familyPersonManagers.personId, familyPeople.id),
        eq(familyPersonManagers.userId, familyPersonTransfers.sourceUserId),
      ),
    )
    .innerJoin(source, eq(source.id, familyPersonTransfers.sourceUserId))
    .innerJoin(target, eq(target.id, familyPersonTransfers.targetUserId))
    .where(
      and(
        eq(familyPersonTransfers.groupId, groupId),
        isNull(familyPersonTransfers.resolvedAt),
        gt(familyPersonTransfers.expiresAt, now),
        or(eq(source.id, actorId), eq(target.id, actorId)),
        eq(source.emailVerified, true),
        eq(target.emailVerified, true),
        activeWebParticipationCondition(source.id),
        activeWebParticipationCondition(target.id),
        or(eq(source.banned, false), lte(source.banExpiresAt, now)),
        or(eq(target.banned, false), lte(target.banExpiresAt, now)),
        sql`exists (select 1 from ${familyMembers} m where m.group_id = ${groupId} and m.user_id = ${source.id} and m.revoked_at is null)`,
        sql`exists (select 1 from ${familyMembers} m where m.group_id = ${groupId} and m.user_id = ${target.id} and m.revoked_at is null)`,
      ),
    )
    .orderBy(familyPersonTransfers.createdAt);
}

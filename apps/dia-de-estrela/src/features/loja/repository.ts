import "server-only";
import { and, asc, db, desc, eq, inArray, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaFamilies as families,
  estrelaGoals as goals,
  estrelaLedger as ledger,
  estrelaRedemptions as redemptions,
  estrelaRewards as rewards,
} from "@informach/db/schema";
import { precoEmEstrelas } from "@/domain/estrelas";
import { assertAllowed } from "@/lib/errors";
import { balanceIn, lockChild } from "../estrelas/repository";

export type RewardRow = typeof rewards.$inferSelect;
export type RewardInput =
  | { kind: "custom"; name: string; icon: string; priceStars: number }
  | { kind: "money"; name: string; icon: string; moneyCents: number };

export async function listRewards(ownerId: string, onlyActive = true) {
  return db
    .select()
    .from(rewards)
    .where(and(eq(rewards.userId, ownerId), onlyActive ? eq(rewards.active, true) : undefined))
    .orderBy(asc(rewards.position), asc(rewards.createdAt));
}

export async function createReward(ownerId: string, input: RewardInput) {
  const [ultimo] = await db
    .select({ max: sql<number>`coalesce(max(${rewards.position}), -1)::int` })
    .from(rewards)
    .where(eq(rewards.userId, ownerId));
  await db.insert(rewards).values({
    userId: ownerId,
    kind: input.kind,
    name: input.name,
    icon: input.icon,
    priceStars: input.kind === "custom" ? input.priceStars : null,
    moneyCents: input.kind === "money" ? input.moneyCents : null,
    position: (ultimo?.max ?? -1) + 1,
  });
}

/** Tira o item da loja; os pedidos antigos continuam com o nome guardado. */
export async function archiveReward(ownerId: string, rewardId: string) {
  const rows = await db
    .update(rewards)
    .set({ active: false })
    .where(and(eq(rewards.id, rewardId), eq(rewards.userId, ownerId)))
    .returning({ id: rewards.id });
  assertAllowed(rows.length, "NOT_FOUND", "Item não encontrado.");
}

/**
 * A criança pede um item. As estrelas não saem ainda: ficam guardadas até os
 * pais entregarem ou recusarem. Só com saldo livre suficiente.
 */
export async function requestRedemption(ownerId: string, childId: string, rewardId: string) {
  return db.transaction(async (tx) => {
    await lockChild(tx, ownerId, childId);
    const [reward] = await tx
      .select()
      .from(rewards)
      .where(and(eq(rewards.id, rewardId), eq(rewards.userId, ownerId), eq(rewards.active, true)));
    assertAllowed(reward, "NOT_FOUND", "Esse item não está mais na loja.");
    const [family] = await tx
      .select({ starsPerReal: families.starsPerReal })
      .from(families)
      .where(eq(families.userId, ownerId));
    const stars =
      reward.kind === "money"
        ? precoEmEstrelas(reward.moneyCents ?? 0, family?.starsPerReal ?? 10)
        : (reward.priceStars ?? 0);
    assertAllowed(stars > 0, "PRICE", "Esse item está sem preço.");
    const { saldo, guardadas } = await balanceIn(tx, childId);
    assertAllowed(
      saldo - guardadas >= stars,
      "BALANCE",
      `Ainda faltam ${stars - Math.max(0, saldo - guardadas)} estrelas para esse item.`,
    );
    const [row] = await tx
      .insert(redemptions)
      .values({
        childId,
        rewardId: reward.id,
        label: reward.name,
        kind: reward.kind,
        stars,
        moneyCents: reward.kind === "money" ? reward.moneyCents : null,
      })
      .returning({ id: redemptions.id });
    assertAllowed(row, "REDEMPTION", "Não foi possível fazer o pedido.");
    return { id: row.id, stars, label: reward.name };
  });
}

/** Os pais entregam (as estrelas saem do cofrinho) ou recusam (as estrelas voltam a ficar livres). */
export async function resolveRedemption(
  ownerId: string,
  redemptionId: string,
  outcome: "delivered" | "declined",
) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        id: redemptions.id,
        childId: redemptions.childId,
        stars: redemptions.stars,
        label: redemptions.label,
        kind: redemptions.kind,
        status: redemptions.status,
      })
      .from(redemptions)
      .innerJoin(children, eq(redemptions.childId, children.id))
      .where(and(eq(redemptions.id, redemptionId), eq(children.userId, ownerId)));
    assertAllowed(r, "NOT_FOUND", "Pedido não encontrado.");
    await lockChild(tx, ownerId, r.childId);
    assertAllowed(r.status === "pending", "ALREADY", "Esse pedido já foi resolvido.");
    if (outcome === "delivered") {
      const { saldo } = await balanceIn(tx, r.childId);
      assertAllowed(saldo >= r.stars, "BALANCE", "O saldo da criança não cobre este pedido.");
      await tx.insert(ledger).values({
        childId: r.childId,
        kind: "redeem",
        stars: -r.stars,
        label: r.kind === "money" ? `Troca: ${r.label}` : r.label,
        sourceKey: `redeem:${r.id}`,
      });
    }
    await tx
      .update(redemptions)
      .set({ status: outcome, resolvedAt: new Date() })
      .where(eq(redemptions.id, r.id));
    return r;
  });
}

export async function pendingRedemptions(ownerId: string) {
  return db
    .select({
      id: redemptions.id,
      childId: redemptions.childId,
      label: redemptions.label,
      kind: redemptions.kind,
      stars: redemptions.stars,
      moneyCents: redemptions.moneyCents,
      requestedAt: redemptions.requestedAt,
    })
    .from(redemptions)
    .innerJoin(children, eq(redemptions.childId, children.id))
    .where(and(eq(children.userId, ownerId), eq(redemptions.status, "pending")))
    .orderBy(redemptions.requestedAt);
}

export async function childRedemptions(childId: string) {
  return db
    .select({
      id: redemptions.id,
      label: redemptions.label,
      stars: redemptions.stars,
      status: redemptions.status,
      requestedAt: redemptions.requestedAt,
    })
    .from(redemptions)
    .where(and(eq(redemptions.childId, childId), eq(redemptions.status, "pending")))
    .orderBy(desc(redemptions.requestedAt));
}

export async function goalsOf(childIds: string[]) {
  if (!childIds.length) return [];
  return db
    .select({
      childId: goals.childId,
      name: goals.name,
      stars: goals.stars,
      hasPhoto: sql<boolean>`${goals.photo} is not null`,
      updatedAt: goals.updatedAt,
    })
    .from(goals)
    .where(inArray(goals.childId, childIds));
}

export async function setGoal(
  ownerId: string,
  childId: string,
  input: { name: string; stars: number; photo?: { mime: string; data: Buffer } | null },
) {
  const [child] = await db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.userId, ownerId)));
  assertAllowed(child, "NOT_FOUND", "Criança não encontrada.");
  const foto =
    input.photo === undefined
      ? {}
      : { photo: input.photo?.data ?? null, photoMime: input.photo?.mime ?? null };
  await db
    .insert(goals)
    .values({ childId, name: input.name, stars: input.stars, ...foto })
    .onConflictDoUpdate({
      target: goals.childId,
      set: { name: input.name, stars: input.stars, updatedAt: new Date(), ...foto },
    });
}

export async function removeGoal(ownerId: string, childId: string) {
  await db
    .delete(goals)
    .where(
      and(
        eq(goals.childId, childId),
        sql`exists (select 1 from ${children} where ${children.id} = ${goals.childId} and ${children.userId} = ${ownerId})`,
      ),
    );
}

export async function goalPhoto(ownerId: string, childId: string) {
  const [row] = await db
    .select({ mime: goals.photoMime, data: goals.photo, updatedAt: goals.updatedAt })
    .from(goals)
    .innerJoin(children, eq(goals.childId, children.id))
    .where(and(eq(goals.childId, childId), eq(children.userId, ownerId)));
  return row?.data && row.mime
    ? { mime: row.mime, data: row.data, updatedAt: row.updatedAt }
    : null;
}

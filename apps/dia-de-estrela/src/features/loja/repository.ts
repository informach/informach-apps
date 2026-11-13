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
import { estrelasDaMeta, META_MAX_ESTRELAS, precoEmEstrelas } from "@/domain/estrelas";
import { assertAllowed } from "@/lib/errors";
import { canCreateCustomRewards, canUseGoalPhoto } from "../acesso/policy";
import { estrelaAccessInTransaction } from "../billing/access-repository";
import { balanceIn, lockChild } from "../estrelas/repository";
import type { AdultAuthority, EstrelaAuthority, ParentAuthority } from "../familia/authority";
import { familyReadCondition, lockAdministrator } from "../familia/repository";
import { childAccessCondition, lockChildAccess } from "../familia/scope";
import { assertParent, lockChildUse } from "../familia/use-repository";

export type RewardRow = typeof rewards.$inferSelect;
export type RewardInput =
  | { kind: "custom"; name: string; icon: string; priceStars: number }
  | { kind: "money"; name: string; icon: string; moneyCents: number };

export async function listRewards(actor: EstrelaAuthority, onlyActive = true) {
  return db
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.familyGroupId, actor.familyGroupId),
        sql`EXISTS (SELECT 1 FROM ${families} WHERE ${familyReadCondition(actor)})`,
        onlyActive ? eq(rewards.active, true) : undefined,
      ),
    )
    .orderBy(asc(rewards.position), asc(rewards.createdAt));
}

export async function createReward(actor: AdultAuthority, input: RewardInput) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const access = await estrelaAccessInTransaction(tx, actor);
    assertAllowed(
      input.kind === "money" || canCreateCustomRewards(access),
      "PLAN",
      "Itens próprios precisam de acesso ao Compasso.",
    );
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${rewards.position}), -1)::int` })
      .from(rewards)
      .where(eq(rewards.familyGroupId, actor.familyGroupId));
    await tx.insert(rewards).values({
      familyGroupId: actor.familyGroupId,
      userId: actor.userId,
      kind: input.kind,
      name: input.name,
      icon: input.icon,
      priceStars: input.kind === "custom" ? input.priceStars : null,
      moneyCents: input.kind === "money" ? input.moneyCents : null,
      position: (last?.max ?? -1) + 1,
    });
  });
}
/** Shop-wide changes require household administration; a child's PIN cannot affect siblings. */
export async function archiveReward(actor: AdultAuthority, rewardId: string) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const rows = await tx
      .update(rewards)
      .set({ active: false })
      .where(and(eq(rewards.id, rewardId), eq(rewards.familyGroupId, actor.familyGroupId)))
      .returning({ id: rewards.id });
    assertAllowed(rows.length, "NOT_FOUND", "Item não encontrado.");
  });
}

/**
 * A criança pede um item. As estrelas não saem ainda: ficam guardadas até os
 * pais entregarem ou recusarem. Só com saldo livre suficiente.
 */
export async function requestRedemption(
  actor: EstrelaAuthority,
  childId: string,
  rewardId: string,
) {
  return db.transaction(async (tx) => {
    const access = await lockChildUse(tx, actor, [childId]);
    const [reward] = await tx
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.id, rewardId),
          eq(rewards.familyGroupId, actor.familyGroupId),
          eq(rewards.active, true),
        ),
      );
    assertAllowed(reward, "NOT_FOUND", "Esse item não está mais na loja.");
    // Itens próprios são do Compasso: depois de rebaixar, continuam
    // guardados (voltam se assinar de novo), mas não podem ser pedidos.
    assertAllowed(
      reward.kind === "money" || canCreateCustomRewards(access),
      "PLAN",
      "Esse item não está na loja agora. Peça aos pais.",
    );
    const [family] = await tx
      .select({ starsPerReal: families.starsPerReal })
      .from(families)
      .where(eq(families.familyGroupId, actor.familyGroupId));
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
  actor: ParentAuthority,
  redemptionId: string,
  outcome: "delivered" | "declined",
) {
  assertParent(actor);
  return db.transaction(async (tx) => {
    const ler = async () => {
      const [row] = await tx
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
        .where(and(eq(redemptions.id, redemptionId), childAccessCondition(actor, children.id)));
      assertAllowed(row, "NOT_FOUND", "Pedido não encontrado.");
      return row;
    };
    // Relê depois da trava: dois adultos resolvendo o mesmo pedido ao mesmo
    // tempo não podem decidir os dois sobre o "pendente" lido antes.
    await lockChild(tx, actor, (await ler()).childId);
    const r = await ler();
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

export async function pendingRedemptions(actor: ParentAuthority) {
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
    .where(and(childAccessCondition(actor, children.id), eq(redemptions.status, "pending")))
    .orderBy(redemptions.requestedAt);
}

export async function childRedemptions(actor: EstrelaAuthority, childId: string) {
  return db
    .select({
      id: redemptions.id,
      label: redemptions.label,
      stars: redemptions.stars,
      status: redemptions.status,
      requestedAt: redemptions.requestedAt,
    })
    .from(redemptions)
    .where(
      and(
        eq(redemptions.childId, childId),
        childAccessCondition(actor, redemptions.childId),
        eq(redemptions.status, "pending"),
      ),
    )
    .orderBy(desc(redemptions.requestedAt));
}

export async function goalsOf(actor: EstrelaAuthority, childIds: string[]) {
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
    .where(and(inArray(goals.childId, childIds), childAccessCondition(actor, goals.childId)));
}

export async function setGoal(
  actor: ParentAuthority,
  childId: string,
  input: { name: string; reais: number; photo?: { mime: string; data: Buffer } | null },
) {
  assertParent(actor);
  return db.transaction(async (tx) => {
    const access = await lockChildUse(tx, actor, [childId]);
    if (input.photo)
      assertAllowed(canUseGoalPhoto(access), "PLAN", "Foto da meta precisa de acesso ao Compasso.");
    const [family] = await tx
      .select({ rate: families.starsPerReal })
      .from(families)
      .where(eq(families.familyGroupId, actor.familyGroupId));
    assertAllowed(family, "NOT_FOUND", "Família não encontrada.");
    const stars = estrelasDaMeta(input.reais, family.rate);
    assertAllowed(
      Number.isSafeInteger(stars) && stars > 0 && stars <= META_MAX_ESTRELAS,
      "GOAL",
      "Escolha uma meta de até um milhão de estrelas.",
    );
    const photo =
      input.photo === undefined
        ? {}
        : { photo: input.photo?.data ?? null, photoMime: input.photo?.mime ?? null };
    await tx
      .insert(goals)
      .values({ childId, name: input.name, stars, ...photo })
      .onConflictDoUpdate({
        target: goals.childId,
        set: { name: input.name, stars, ...photo, updatedAt: new Date() },
      });
  });
}
export async function removeGoal(actor: ParentAuthority, childId: string) {
  assertParent(actor);
  return db.transaction(async (tx) => {
    await lockChildAccess(tx, actor, [childId], "write");
    await tx.delete(goals).where(eq(goals.childId, childId));
  });
}

export async function goalPhoto(actor: EstrelaAuthority, childId: string) {
  const [row] = await db
    .select({ mime: goals.photoMime, data: goals.photo, updatedAt: goals.updatedAt })
    .from(goals)
    .innerJoin(children, eq(goals.childId, children.id))
    .where(and(eq(goals.childId, childId), childAccessCondition(actor, children.id)));
  return row?.data && row.mime
    ? { mime: row.mime, data: row.data, updatedAt: row.updatedAt }
    : null;
}

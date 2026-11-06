import "server-only";
import { and, asc, count, db, eq, inArray } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaGoals,
  estrelaLedger,
  estrelaRedemptions,
  estrelaFamilies as families,
  estrelaGuardians as guardians,
  estrelaRewards as rewards,
  estrelaTasks as tasks,
  users,
} from "@informach/db/schema";
import { MODELOS, RECOMPENSAS_INICIAIS } from "@/domain/modelos";
import { assertAllowed } from "@/lib/errors";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type FamilyRow = typeof families.$inferSelect;
export type ChildRow = typeof children.$inferSelect;

/** Trava a família (ou a conta, antes de a família existir) para operações de limite. */
export async function lockOwner(tx: Tx, ownerId: string) {
  const [owner] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, ownerId))
    .for("update");
  assertAllowed(owner, "AUTH", "Entre novamente para continuar.");
}

export async function getFamily(ownerId: string) {
  const [row] = await db.select().from(families).where(eq(families.userId, ownerId));
  return row ?? null;
}

export async function listChildren(ownerId: string) {
  return db
    .select()
    .from(children)
    .where(eq(children.userId, ownerId))
    .orderBy(asc(children.position), asc(children.createdAt), asc(children.id));
}

/** Família da qual a pessoa é segundo responsável, se for. */
export async function guardianOwnerOf(userId: string) {
  const [row] = await db
    .select({ ownerUserId: guardians.ownerUserId })
    .from(guardians)
    .where(eq(guardians.userId, userId));
  return row?.ownerUserId ?? null;
}

export type ChildInput = { name: string; color: string };
export type OnboardingInput = {
  children: ChildInput[];
  templateIds: string[];
  pinHash: string;
  timezone: string;
};

/**
 * Primeiro uso, de uma vez: família, crianças, rotinas prontas para cada uma,
 * loja inicial e PIN. Se a família já começou, nada é refeito.
 */
export async function completeOnboarding(ownerId: string, input: OnboardingInput, limit: number) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    await tx.insert(families).values({ userId: ownerId }).onConflictDoNothing();
    const [family] = await tx.select().from(families).where(eq(families.userId, ownerId));
    assertAllowed(family && !family.onboardedAt, "ONBOARDED", "A família já foi configurada.");
    const [{ value: existentes } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(children)
      .where(eq(children.userId, ownerId));
    assertAllowed(
      existentes + input.children.length <= limit,
      "CHILD_LIMIT",
      limit === 1
        ? "O plano gratuito tem uma criança. Assine o Família para cadastrar até quatro."
        : `O plano comporta até ${limit} crianças.`,
    );
    const criadas = input.children.length
      ? await tx
          .insert(children)
          .values(
            input.children.map((c, i) => ({
              userId: ownerId,
              name: c.name,
              color: c.color,
              position: existentes + i,
            })),
          )
          .returning({ id: children.id })
      : [];
    const modelos = MODELOS.filter((m) => input.templateIds.includes(m.id));
    const novas = criadas.flatMap((c) =>
      modelos.flatMap((m) => m.tasks.map((t) => ({ ...t, childId: c.id }))),
    );
    if (novas.length) await tx.insert(tasks).values(novas);
    await tx
      .insert(rewards)
      .values(RECOMPENSAS_INICIAIS.map((r, i) => ({ ...r, userId: ownerId, position: i })));
    await tx
      .update(families)
      .set({
        pinHash: input.pinHash,
        pinUpdatedAt: new Date(),
        timezone: input.timezone,
        onboardedAt: new Date(),
      })
      .where(eq(families.userId, ownerId));
    return criadas.map((c) => c.id);
  });
}

export async function createChild(ownerId: string, input: ChildInput, limit: number) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const lista = await tx
      .select({ id: children.id, position: children.position })
      .from(children)
      .where(eq(children.userId, ownerId));
    assertAllowed(
      lista.length < limit,
      "CHILD_LIMIT",
      limit === 1
        ? "O plano gratuito tem uma criança. Assine o Família para cadastrar até quatro."
        : `O plano comporta até ${limit} crianças.`,
    );
    const [row] = await tx
      .insert(children)
      .values({
        userId: ownerId,
        name: input.name,
        color: input.color,
        position: Math.max(-1, ...lista.map((c) => c.position)) + 1,
      })
      .returning();
    assertAllowed(row, "CHILD", "Não foi possível cadastrar a criança.");
    return row;
  });
}

export async function updateChild(ownerId: string, childId: string, input: ChildInput) {
  const rows = await db
    .update(children)
    .set(input)
    .where(and(eq(children.id, childId), eq(children.userId, ownerId)))
    .returning({ id: children.id });
  assertAllowed(rows.length, "NOT_FOUND", "Criança não encontrada.");
}

export async function deleteChild(ownerId: string, childId: string) {
  const rows = await db
    .delete(children)
    .where(and(eq(children.id, childId), eq(children.userId, ownerId)))
    .returning({ id: children.id });
  assertAllowed(rows.length, "NOT_FOUND", "Criança não encontrada.");
}

export type SettingsInput = Partial<
  Pick<
    FamilyRow,
    | "timezone"
    | "starsPerReal"
    | "warnBefore"
    | "repeatEvery"
    | "alertAfter"
    | "sound"
    | "voice"
    | "calm"
    | "chestBonus"
  >
>;

export async function updateSettings(ownerId: string, input: SettingsInput) {
  const rows = await db
    .update(families)
    .set(input)
    .where(eq(families.userId, ownerId))
    .returning({ id: families.userId });
  assertAllowed(rows.length, "NOT_FOUND", "Família não encontrada.");
}

export async function setPinHash(ownerId: string, pinHash: string) {
  await db
    .update(families)
    .set({ pinHash, pinUpdatedAt: new Date() })
    .where(eq(families.userId, ownerId));
}

/** Exclusão da conta: tudo do app cai em cascata com a família. */
export async function clearFamily(ownerId: string) {
  await db.delete(families).where(eq(families.userId, ownerId));
}

/** Cópia de tudo o que o Dia de Estrela guarda sobre a família (LGPD, portabilidade). */
export async function familyExport(ownerId: string) {
  const family = await getFamily(ownerId);
  const kids = await listChildren(ownerId);
  const ids = kids.map((k) => k.id);
  const [taskRows, ledgerRows, goalRows, redemptionRows, rewardRows] = await Promise.all([
    ids.length ? db.select().from(tasks).where(inArray(tasks.childId, ids)) : [],
    ids.length ? db.select().from(estrelaLedger).where(inArray(estrelaLedger.childId, ids)) : [],
    ids.length
      ? db
          .select({
            childId: estrelaGoals.childId,
            name: estrelaGoals.name,
            stars: estrelaGoals.stars,
          })
          .from(estrelaGoals)
          .where(inArray(estrelaGoals.childId, ids))
      : [],
    ids.length
      ? db.select().from(estrelaRedemptions).where(inArray(estrelaRedemptions.childId, ids))
      : [],
    db.select().from(rewards).where(eq(rewards.userId, ownerId)),
  ]);
  return { family, children: kids, taskRows, ledgerRows, goalRows, redemptionRows, rewardRows };
}

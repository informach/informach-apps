import "server-only";
import { randomUUID } from "node:crypto";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaCompletions,
  estrelaGoals,
  estrelaLedger,
  estrelaRedemptions,
  estrelaTaskVoices,
  estrelaFamilies as families,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
  estrelaRewards as rewards,
  estrelaTasks as tasks,
} from "@informach/db/schema";
import type { FamilyReader, FamilyTransaction } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import {
  activateProfileInTransaction,
  lockFamilyMembership,
  removeProfileInTransaction,
} from "@informach/family/context";
import { MODELOS, RECOMPENSAS_INICIAIS } from "@/domain/modelos";
import { estrelaAccessInTransaction } from "@/features/billing/access-repository";
import { assertAllowed } from "@/lib/errors";
import { eraseEstrelaProfiles } from "../account/cleanup-repository";
import type { AdultAuthority, EstrelaAuthority } from "./authority";
import { enabledChildIds, readChildren } from "./child-repository";
import { childAccessCondition, lockChildAccess } from "./scope";

export type Tx = FamilyTransaction;
export type { ChildRow } from "./child-repository";

const familyFields = {
  familyGroupId: families.familyGroupId,
  timezone: families.timezone,
  starsPerReal: families.starsPerReal,
  warnBefore: families.warnBefore,
  repeatEvery: families.repeatEvery,
  alertAfter: families.alertAfter,
  sound: families.sound,
  voice: families.voice,
  calm: families.calm,
  chestBonus: families.chestBonus,
  onboardedAt: families.onboardedAt,
  createdAt: families.createdAt,
  hasPin: sql<boolean>`${families.pinHash} is not null`.mapWith(Boolean),
};
export function familyReadCondition(actor: EstrelaAuthority) {
  return and(
    eq(families.familyGroupId, actor.familyGroupId),
    familyMembershipCondition(actor.userId, families.familyGroupId),
    actor.kind !== "adult"
      ? sql`EXISTS (SELECT 1 FROM ${children} scoped_child WHERE ${childAccessCondition(actor, sql`scoped_child.id`)})`
      : undefined,
  );
}
/** No PIN hash or credential generation is ever serialized into a page/export. */
export async function readFamily(reader: FamilyReader, actor: EstrelaAuthority) {
  const [row] = await reader.select(familyFields).from(families).where(familyReadCondition(actor));
  return row ?? null;
}
export type FamilyRow = NonNullable<Awaited<ReturnType<typeof readFamily>>>;
export const getFamily = (actor: EstrelaAuthority) => readFamily(db, actor);
export const listChildren = (actor: EstrelaAuthority) => readChildren(db, actor);

/** Minimal live authority check for long-lived event streams; no child data is serialized. */
export async function hasChildAccess(actor: EstrelaAuthority) {
  const [row] = await db
    .select({ id: children.id })
    .from(children)
    .where(childAccessCondition(actor, children.id))
    .limit(1);
  return !!row;
}

export async function lockAdministrator(tx: Tx, actor: AdultAuthority) {
  assertAllowed(actor.kind === "adult", "AUTH", "Entre com sua conta para continuar.");
  return lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
}
export async function appChildren(reader: FamilyReader, actor: EstrelaAuthority) {
  return reader
    .select({ id: children.id, position: children.position, activationId: familyAppProfiles.id })
    .from(children)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, children.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .innerJoin(
      familyGroupPeople,
      and(
        eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
        eq(familyGroupPeople.personId, familyPeople.id),
      ),
    )
    .where(
      and(
        eq(familyAppProfiles.groupId, actor.familyGroupId),
        eq(familyAppProfiles.app, "dia-de-estrela"),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
        isNull(familyPeople.archivedAt),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    );
}

export type OnboardingInput = {
  personIds: string[];
  templateIds: string[];
  pinHash: string;
  timezone: string;
};
async function activateChild(tx: Tx, actor: AdultAuthority, personId: string, position: number) {
  const [person] = await tx
    .select({ kind: familyPeople.kind })
    .from(familyPeople)
    .where(eq(familyPeople.id, personId));
  assertAllowed(
    person?.kind === "dependent",
    "PERSON",
    "Escolha uma criança cadastrada na Minha conta.",
  );
  const result = await activateProfileInTransaction(
    tx,
    actor.userId,
    { groupId: actor.familyGroupId, personId, app: "dia-de-estrela" },
    async (tx, familyProfileId) => {
      const [child] = await tx
        .insert(children)
        .values({ familyProfileId, userId: actor.userId, position })
        .returning({ id: children.id });
      assertAllowed(child, "CHILD", "Não foi possível ativar a criança.");
      return child;
    },
  );
  return result.value;
}
/** Canonical activations, routines, shop and settings commit together or all roll back. */
export async function completeOnboarding(actor: AdultAuthority, input: OnboardingInput) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const [existing] = await tx
      .select({ onboardedAt: families.onboardedAt })
      .from(families)
      .where(eq(families.familyGroupId, actor.familyGroupId));
    assertAllowed(!existing?.onboardedAt, "ONBOARDED", "A família já foi configurada.");
    await tx.insert(families).values({ familyGroupId: actor.familyGroupId }).onConflictDoNothing();
    const current = await appChildren(tx, actor);
    const access = await estrelaAccessInTransaction(tx, actor);
    assertAllowed(
      input.personIds.length > 0 &&
        new Set(input.personIds).size === input.personIds.length &&
        current.length + input.personIds.length <= access.childLimit,
      "CHILD_LIMIT",
      `O acesso atual comporta até ${access.childLimit} crianças.`,
    );
    const ids: string[] = [];
    const firstPosition = Math.max(-1, ...current.map((c) => c.position)) + 1;
    for (const [index, personId] of input.personIds.entries())
      ids.push((await activateChild(tx, actor, personId, firstPosition + index)).id);
    const models = MODELOS.filter((m) => input.templateIds.includes(m.id));
    const newTasks = ids.flatMap((childId) =>
      models.flatMap((m) => m.tasks.map((t) => ({ ...t, childId }))),
    );
    if (newTasks.length) await tx.insert(tasks).values(newTasks);
    await tx.insert(rewards).values(
      RECOMPENSAS_INICIAIS.map((r, position) => ({
        ...r,
        familyGroupId: actor.familyGroupId,
        position,
      })),
    );
    await tx
      .update(families)
      .set({
        pinHash: input.pinHash,
        pinGeneration: randomUUID(),
        pinUpdatedAt: new Date(),
        timezone: input.timezone,
        onboardedAt: new Date(),
      })
      .where(eq(families.familyGroupId, actor.familyGroupId));
    return ids;
  });
}
export async function createChild(actor: AdultAuthority, personId: string) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const current = await appChildren(tx, actor);
    const access = await estrelaAccessInTransaction(tx, actor);
    assertAllowed(
      current.length < access.childLimit,
      "CHILD_LIMIT",
      `O acesso atual comporta até ${access.childLimit} crianças.`,
    );
    return activateChild(tx, actor, personId, Math.max(-1, ...current.map((c) => c.position)) + 1);
  });
}
export async function deleteChild(actor: AdultAuthority, childId: string) {
  assertAllowed(actor.kind === "adult", "AUTH", "Entre com sua conta para continuar.");
  return db.transaction(async (tx) => {
    // Metadata only: archived profiles can still be erased by a current manager.
    // removeProfileInTransaction checks custody again after locking the group.
    const [child] = await tx
      .select({ familyProfileId: children.familyProfileId })
      .from(children)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, children.familyProfileId))
      .where(
        and(
          eq(children.id, childId),
          eq(familyAppProfiles.groupId, actor.familyGroupId),
          eq(familyAppProfiles.app, "dia-de-estrela"),
        ),
      );
    assertAllowed(child, "CHILD", "Criança não disponível.");
    await removeProfileInTransaction(
      tx,
      actor.userId,
      "dia-de-estrela",
      child.familyProfileId,
      async (tx, activationId) => {
        const [removed] = await eraseEstrelaProfiles(tx, [activationId]);
        assertAllowed(removed?.id === childId, "CHILD", "Criança não disponível.");
      },
    );
  });
}
export async function chooseLimitedChild(actor: AdultAuthority, childId: string) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const all = await appChildren(tx, actor);
    assertAllowed(
      all.some((c) => c.id === childId),
      "CHILD",
      "Escolha uma criança disponível.",
    );
    await lockChildAccess(
      tx,
      actor,
      all.map((c) => c.id),
      "manage",
    );
    await tx
      .update(children)
      .set({ accessEnabled: sql`${children.id} = ${childId}::uuid` })
      .where(
        inArray(
          children.id,
          all.map((c) => c.id),
        ),
      );
  });
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
export async function updateSettings(actor: AdultAuthority, input: SettingsInput) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const rows = await tx
      .update(families)
      .set(input)
      .where(eq(families.familyGroupId, actor.familyGroupId))
      .returning({ id: families.familyGroupId });
    assertAllowed(rows.length, "NOT_FOUND", "Família não encontrada.");
  });
}
export async function setPinHash(actor: AdultAuthority, pinHash: string) {
  return db.transaction(async (tx) => {
    await lockAdministrator(tx, actor);
    const rows = await tx
      .update(families)
      .set({ pinHash, pinGeneration: randomUUID(), pinUpdatedAt: new Date() })
      .where(eq(families.familyGroupId, actor.familyGroupId))
      .returning({ id: families.familyGroupId });
    assertAllowed(rows.length, "NOT_FOUND", "Família não encontrada.");
  });
}
/** Export only explicitly readable app histories; never sessions, PINs, billing or other apps. */
export async function familyExport(actor: AdultAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const kids = await readChildren(tx, actor);
    const ids = kids.map((c) => c.id);
    if (ids.length) await lockChildAccess(tx, actor, ids, "read");
    const taskRows = ids.length
      ? await tx.select().from(tasks).where(inArray(tasks.childId, ids))
      : [];
    const taskIds = taskRows.map((t) => t.id);
    return {
      family: await readFamily(tx, actor),
      children: kids,
      taskRows,
      completions: ids.length
        ? await tx.select().from(estrelaCompletions).where(inArray(estrelaCompletions.childId, ids))
        : [],
      ledgerRows: ids.length
        ? await tx.select().from(estrelaLedger).where(inArray(estrelaLedger.childId, ids))
        : [],
      goalRows: ids.length
        ? await tx.select().from(estrelaGoals).where(inArray(estrelaGoals.childId, ids))
        : [],
      redemptionRows: ids.length
        ? await tx.select().from(estrelaRedemptions).where(inArray(estrelaRedemptions.childId, ids))
        : [],
      voices: taskIds.length
        ? await tx
            .select()
            .from(estrelaTaskVoices)
            .where(inArray(estrelaTaskVoices.taskId, taskIds))
        : [],
      rewardRows: await tx
        .select()
        .from(rewards)
        .where(eq(rewards.familyGroupId, actor.familyGroupId)),
    };
  });
}

export async function familySnapshot(actor: EstrelaAuthority) {
  return db.transaction(async (tx) => {
    const access = await estrelaAccessInTransaction(tx, actor);
    const family = await readFamily(tx, actor);
    const children = await readChildren(tx, actor);
    const allowed = new Set(await enabledChildIds(tx, actor, access.childLimit));
    return {
      access,
      family,
      children: children.map((child) => ({ ...child, allowed: allowed.has(child.id) })),
    };
  });
}

import { randomUUID } from "node:crypto";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq } from "@informach/db";
import { cozyaProfiles, creditLedger, familyMigrationSources, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { describe, expect, it } from "vitest";
import { readKitchenAccess } from "@/features/billing/access-repository";
import type { CozyaAuthority } from "@/features/family/authority";
import { planFirstWeekForActor } from "@/features/kitchen/first-week-repository";
import { getWeekMeals, hasAnyMeal, saveMeal } from "@/features/kitchen/repository";
import {
  countRecipesByUser,
  findRecipeByIdForUser,
  insertRecipeForAccess,
} from "@/features/recipes/repository";

const family = createFamilyService({ db });
const recipe = {
  name: "Omelete fictícia",
  ingredients: "2 ovos",
  preparation: "Misture e cozinhe.",
  finishing: null,
  isFavorite: false,
  creationMethod: "manual" as const,
};
async function account() {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "Pessoa fictícia",
    email: `${userId}@example.invalid`,
    emailVerified: true,
  });
  const group = await family.createGroup(userId, "Família fictícia");
  return { userId, familyGroupId: group.id };
}
async function trial(actor: CozyaAuthority & { familyGroupId: string }) {
  await startCompassoTrial(
    { db, trialHashSecret: "synthetic-compasso-test-secret-32-characters" },
    actor.userId,
    actor.familyGroupId,
  );
}
async function join(owner: CozyaAuthority & { familyGroupId: string }, member: CozyaAuthority) {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, member.userId));
  if (!user) throw new Error("Missing synthetic user");
  const invitation = await family.createInvitation(owner.userId, owner.familyGroupId, user.email);
  await family.acceptInvitation(member.userId, invitation.token);
  return { userId: member.userId, familyGroupId: owner.familyGroupId };
}

describe("Cozya: personal content and selected Compasso coverage", () => {
  it("shares one trial without sharing recipes, profile preferences or another family's coverage", async () => {
    const owner = await account();
    const member = await account();
    await trial(owner);
    const shared = await join(owner, member);
    await db.insert(cozyaProfiles).values({ userId: owner.userId, householdSize: 6 });
    expect(await readKitchenAccess(owner)).toMatchObject({
      canPlan: true,
      trialActive: true,
      unlimitedRecipes: true,
      profile: { householdSize: 6 },
    });
    expect(await readKitchenAccess(shared)).toMatchObject({
      canPlan: true,
      trialActive: true,
      profile: null,
    });
    expect(await readKitchenAccess(member)).toMatchObject({ canPlan: false, canUseAi: true });
    const saved = await insertRecipeForAccess(owner, { userId: owner.userId, ...recipe });
    if (!saved.ok) throw new Error("Missing synthetic recipe");
    expect(await findRecipeByIdForUser(member.userId, saved.recipe.id)).toBeNull();
    await expect(
      readKitchenAccess({ userId: (await account()).userId, familyGroupId: owner.familyGroupId }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("keeps the free personal recipe limit atomic across concurrent inserts", async () => {
    const owner = await account();
    const actor = { userId: owner.userId, familyGroupId: null };
    const results = await Promise.all(
      Array.from({ length: 18 }, () =>
        insertRecipeForAccess(actor, { userId: actor.userId, ...recipe }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(15);
    expect(results.filter((r) => !r.ok)).toHaveLength(3);
    await expect(
      insertRecipeForAccess(actor, { userId: (await account()).userId, ...recipe }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("rechecks membership on writes while keeping personal history readable after revocation", async () => {
    const owner = await account();
    const shared = await join(owner, await account());
    await trial(owner);
    expect((await readKitchenAccess(shared)).canPlan).toBe(true);
    const saved = await insertRecipeForAccess(shared, { userId: shared.userId, ...recipe });
    if (!saved.ok) throw new Error("Missing synthetic recipe");
    const meal = {
      day: "2027-02-01",
      slot: "dinner" as const,
      recipeId: saved.recipe.id,
      label: "",
      servings: 2,
      lunchboxServings: 0,
    };
    expect(await saveMeal(shared, meal)).toBe(true);
    await family.revokeMember(owner.userId, owner.familyGroupId, shared.userId);
    await expect(saveMeal(shared, { ...meal, day: "2027-02-02" })).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      insertRecipeForAccess(shared, { userId: shared.userId, ...recipe }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(await findRecipeByIdForUser(shared.userId, saved.recipe.id)).toMatchObject({
      id: saved.recipe.id,
    });
    expect(await getWeekMeals(shared.userId, "2027-02-01")).toHaveLength(1);
    expect((await readKitchenAccess({ ...shared, familyGroupId: null })).canPlan).toBe(false);
  });

  it("does not start a local trial or issue local credits during free use", async () => {
    const owner = await account();
    const saved = await insertRecipeForAccess(owner, { userId: owner.userId, ...recipe });
    if (!saved.ok) throw new Error("Missing synthetic recipe");
    const meal = {
      day: "2027-02-01",
      slot: "dinner" as const,
      recipeId: saved.recipe.id,
      label: "",
      servings: 2,
      lunchboxServings: 0,
    };
    await expect(saveMeal(owner, meal)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(await saveMeal(owner, { ...meal, recipeId: null, label: "Comer fora" })).toBe(true);
    expect(await readKitchenAccess(owner)).toMatchObject({
      canPlan: false,
      trialStartsAt: null,
      profile: null,
    });
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.app, "cozya"), eq(creditLedger.ownerId, owner.userId))),
    ).toHaveLength(0);
  });

  it("honors only the recorded legacy trial until its original expiry without issuing another grant", async () => {
    const owner = await account();
    const startsAt = new Date(Date.now() - 86400000);
    await db
      .insert(familyMigrationSources)
      .values({ app: "cozya", sourceOwnerId: owner.userId, groupId: owner.familyGroupId });
    await db.insert(cozyaProfiles).values({ userId: owner.userId, trialStartedAt: startsAt });
    expect(await readKitchenAccess(owner)).toMatchObject({
      source: "legacy-trial",
      trialActive: true,
      trialStartsAt: startsAt,
    });
    const otherGroup = await family.createGroup(owner.userId, "Outra família");
    expect((await readKitchenAccess({ ...owner, familyGroupId: otherGroup.id })).canPlan).toBe(
      false,
    );
    await db
      .update(cozyaProfiles)
      .set({ trialStartedAt: new Date(Date.now() - 15 * 86400000) })
      .where(eq(cozyaProfiles.userId, owner.userId));
    expect(await readKitchenAccess(owner)).toMatchObject({ canPlan: false, trialActive: false });
    expect(
      await db
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.app, "cozya"), eq(creditLedger.ownerId, owner.userId))),
    ).toHaveLength(0);
  });
  it("commits one complete first week under concurrent requests", async () => {
    const owner = await account();
    await trial(owner);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        planFirstWeekForActor(owner, { starters: [0, 1, 2], recipeIds: [] }),
      ),
    );
    expect(results.filter((result) => result.ok && result.planned === 3)).toHaveLength(1);
    expect(results.filter((result) => result.ok && result.planned === 0)).toHaveLength(5);
    expect(await countRecipesByUser(owner.userId)).toBe(3);
    const first = results.find((result) => result.ok);
    if (!first?.ok) throw new Error("Missing first-week result");
    expect(await getWeekMeals(owner.userId, first.week)).toHaveLength(3);
  });

  it("rejects a foreign first-week recipe without leaving starter copies or meals", async () => {
    const owner = await account();
    const other = await account();
    await trial(owner);
    const foreign = await insertRecipeForAccess(other, { userId: other.userId, ...recipe });
    if (!foreign.ok) throw new Error("Missing fixture recipe");
    expect(
      await planFirstWeekForActor(owner, { starters: [0, 1], recipeIds: [foreign.recipe.id] }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await countRecipesByUser(owner.userId)).toBe(0);
    expect(await hasAnyMeal(owner.userId)).toBe(false);
  });
});

import { randomUUID } from "node:crypto";
import { freezeWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq } from "@informach/db";
import {
  cozyaMeals,
  cozyaProductEvents,
  cozyaProfiles,
  cozyaRecipes,
  cozyaShoppingLists,
  users,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  clearCozyaData,
  exportCozyaData,
  saveCulinaryProfile,
} from "@/features/account/repository";
import { recordProductEvent } from "@/features/kitchen/events";
import {
  addShoppingExtra,
  getTrialSummary,
  removeMeal,
  removeShoppingExtra,
  saveCookingFeedback,
  saveMeal,
  setShoppingItemState,
  updateCookingSession,
} from "@/features/kitchen/repository";
import {
  deleteRecipeForUser,
  findRecipeByIdForUser,
  findRecipesByUser,
  findRecipesPageByUser,
  insertRecipe,
  insertRecipeForAccess,
  insertRecipeWithinFreeLimit,
  setRecipeFavoriteForUser,
  updateRecipeForUser,
} from "@/features/recipes/repository";

async function account() {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "Recipe fixture",
    email: `${userId}@example.test`,
    emailVerified: true,
  });
  return userId;
}
const recipe = (userId: string, name = "Bolo de cenoura") => ({
  userId,
  name,
  ingredients: "cenoura\nfarinha\novos",
  preparation: "Misture e asse.",
  finishing: null,
  isFavorite: false,
  creationMethod: "manual" as const,
});

it("keeps the free limit atomic under concurrent personal writes", async () => {
  const userId = await account();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => insertRecipeWithinFreeLimit(recipe(userId), 3)),
  );
  expect(results.filter((result) => result.ok)).toHaveLength(3);
  expect(results.filter((result) => !result.ok)).toHaveLength(2);
  expect(await findRecipesByUser(userId)).toHaveLength(3);
});

it("sorts favorites before newer recipes and returns distinct pages", async () => {
  const userId = await account();
  const first = await insertRecipe({ ...recipe(userId, "Favorita antiga"), isFavorite: true });
  const second = await insertRecipe(recipe(userId, "Segunda"));
  const third = await insertRecipe(recipe(userId, "Terceira"));
  await db
    .update(cozyaRecipes)
    .set({ createdAt: new Date("2026-01-01") })
    .where(eq(cozyaRecipes.id, first.id));
  await db
    .update(cozyaRecipes)
    .set({ createdAt: new Date("2026-02-01") })
    .where(eq(cozyaRecipes.id, second.id));
  await db
    .update(cozyaRecipes)
    .set({ createdAt: new Date("2026-03-01") })
    .where(eq(cozyaRecipes.id, third.id));
  const page = await findRecipesPageByUser(userId, { page: 1, limit: 2 });
  expect(page.recipes.map((row) => row.id)).toEqual([first.id, third.id]);
  expect(page.hasNextPage).toBe(true);
  const last = await findRecipesPageByUser(userId, { page: 2, limit: 2 });
  expect(last.recipes.map((row) => row.id)).toEqual([second.id]);
  expect(last.hasNextPage).toBe(false);
});

it("searches all words across name and ingredients without accents or SQL wildcards", async () => {
  const userId = await account();
  const chosen = await insertRecipe({
    ...recipe(userId, "Bolo simples"),
    ingredients: "Açúcar\nfarinha",
  });
  await insertRecipe(recipe(userId, "Bolo sem açúcar"));
  await insertRecipe({ ...recipe(userId, "Sopa"), ingredients: "Açúcar" });
  await insertRecipe({ ...recipe(await account(), "Bolo simples"), ingredients: "Açúcar" });
  expect(
    (await findRecipesPageByUser(userId, { search: "bolo%_ simples acucar" })).recipes.map(
      (row) => row.id,
    ),
  ).toEqual([chosen.id]);
  expect((await findRecipesPageByUser(userId, { search: "...  " })).recipes).toHaveLength(3);
});

it("isolates reads and mutations, preserves cooking version for a favorite and updates it for changed content", async () => {
  const owner = await account(),
    other = await account();
  const saved = await insertRecipe(recipe(owner));
  expect(await findRecipeByIdForUser(other, saved.id)).toBeNull();
  expect(
    await updateRecipeForUser(other, saved.id, { ...recipe(other), name: "Denied" }),
  ).toBeNull();
  expect(await setRecipeFavoriteForUser(other, saved.id, true)).toBeNull();
  expect(await deleteRecipeForUser(other, saved.id)).toBe(false);
  const renamed = await updateRecipeForUser(owner, saved.id, { ...saved, name: "Renamed" });
  expect(renamed?.name).toBe("Renamed");
  expect(renamed?.contentUpdatedAt).toEqual(saved.contentUpdatedAt);
  const favorite = await setRecipeFavoriteForUser(owner, saved.id, true);
  expect(favorite?.isFavorite).toBe(true);
  expect(favorite?.contentUpdatedAt).toEqual(saved.contentUpdatedAt);
  await db
    .update(cozyaRecipes)
    .set({ contentUpdatedAt: new Date(0) })
    .where(eq(cozyaRecipes.id, saved.id));
  const changed = await updateRecipeForUser(owner, saved.id, {
    ...saved,
    ingredients: "New ingredients",
  });
  expect(changed?.ingredients).toBe("New ingredients");
  expect(changed?.contentUpdatedAt.getTime()).toBeGreaterThan(0);
  expect(await deleteRecipeForUser(owner, saved.id)).toBe(true);
  expect(await deleteRecipeForUser(owner, saved.id)).toBe(false);
  expect(await findRecipeByIdForUser(owner, saved.id)).toBeNull();
});

it("freezes all personal write entry points including free users without a family", async () => {
  const userId = await account();
  const saved = await insertRecipe(recipe(userId));
  const [list] = await db
    .insert(cozyaShoppingLists)
    .values({ userId, week: "2027-02-01" })
    .returning();
  if (!list) throw new Error("Missing shopping fixture");
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId, operationId: randomUUID(), expectedRevision: 0 }),
  );
  const meal = {
    day: "2027-02-01",
    slot: "dinner" as const,
    recipeId: null,
    label: "Manual meal",
    servings: 2,
    lunchboxServings: 0,
  };
  const writes = [
    () => insertRecipe(recipe(userId)),
    () => insertRecipeWithinFreeLimit(recipe(userId), 15),
    () => insertRecipeForAccess({ userId, familyGroupId: null }, recipe(userId)),
    () => updateRecipeForUser(userId, saved.id, { ...saved, ingredients: "Denied" }),
    () => setRecipeFavoriteForUser(userId, saved.id, true),
    () => deleteRecipeForUser(userId, saved.id),
    () => saveCulinaryProfile(userId, { householdSize: 8, preferences: "Denied" }),
    () => saveMeal({ userId, familyGroupId: null }, meal),
    () => removeMeal(userId, randomUUID()),
    () => setShoppingItemState(userId, randomUUID(), "bought"),
    () => removeShoppingExtra(userId, randomUUID()),
    () => addShoppingExtra(userId, { listId: list.id, name: "Denied", amount: "2" }),
    () =>
      updateCookingSession(userId, {
        recipeId: saved.id,
        operation: { type: "complete" as const },
      }),
    () =>
      saveCookingFeedback(userId, {
        recipeId: saved.id,
        verdict: "again" as const,
        note: "Denied",
      }),
    () => clearCozyaData(userId),
  ];
  for (const write of writes) await expect(write()).rejects.toMatchObject({ code: "unavailable" });
  expect(await findRecipesByUser(userId)).toEqual([]);
  expect(await findRecipeByIdForUser(userId, saved.id)).toBeNull();
  await expect(exportCozyaData(userId)).rejects.toMatchObject({ code: "unavailable" });
  await expect(
    getTrialSummary(userId, { from: new Date("2027-02-01"), to: new Date("2027-02-15") }),
  ).rejects.toMatchObject({ code: "unavailable" });
  await recordProductEvent(userId, "today_viewed", "after-freeze");
  expect(
    await db.select().from(cozyaProductEvents).where(eq(cozyaProductEvents.userId, userId)),
  ).toEqual([]);
  expect(await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, userId))).toEqual([]);
  expect(await db.select().from(cozyaMeals).where(eq(cozyaMeals.userId, userId))).toEqual([]);
  expect(
    await db
      .select({ name: cozyaRecipes.name, isFavorite: cozyaRecipes.isFavorite })
      .from(cozyaRecipes)
      .where(and(eq(cozyaRecipes.id, saved.id), eq(cozyaRecipes.userId, userId))),
  ).toEqual([{ name: saved.name, isFavorite: false }]);
  expect(await insertRecipe(recipe(await account()))).toBeDefined();
});

import { randomUUID } from "node:crypto";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { and, db, eq, inArray } from "@informach/db";
import {
  cozyaAiOperations,
  cozyaProfiles,
  cozyaRecipes,
  cozyaTrialClaims,
  creditLedger,
  creditReservations,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeLegacyCozyaAi } from "@/features/account/legacy-ai";
import { clearCozyaData, exportCozyaData } from "@/features/account/repository";
import { runAiOperation } from "@/features/ai/idempotency";
import { currentAiOperationId } from "@/features/ai/operation-context";
import { getRecentRecipePreviews } from "@/features/ai/previews";
import { recoverInterruptedAiOperation } from "@/features/ai/recovery";
import { billing } from "@/features/billing/service";
import { getKitchenAccess, startKitchenTrial } from "@/features/kitchen/access";
import { recordProductEvent } from "@/features/kitchen/events";
import { getKitchenMetrics } from "@/features/kitchen/metrics";
import {
  addShoppingExtra,
  generateShoppingList,
  getCookingSession,
  getShoppingList,
  getWeekMeals,
  removeShoppingExtra,
  repeatWeek,
  saveMeal,
  setShoppingItemState,
  updateCookingSession,
} from "@/features/kitchen/repository";
import {
  countRecipesByUser,
  insertRecipe,
  insertRecipeWithinFreeLimit,
  setRecipeFavoriteForUser,
  updateRecipeForUser,
} from "@/features/recipes/repository";
import { env } from "@/lib/env";

const ids: [string, string] = [randomUUID(), randomUUID()];
const first = {
  id: ids[0],
  email: `kitchen-${ids[0]}@e2e.local`,
  name: "Kitchen integration A",
  emailVerified: true,
};
const second = {
  id: ids[1],
  email: `kitchen-${ids[1]}@e2e.local`,
  name: "Kitchen integration B",
  emailVerified: true,
};
const mealWeek = "2027-02-01";
const recipeInput = {
  name: "Omelete de teste",
  ingredients: "2 ovos\n100 g de queijo",
  preparation: "Bata os ovos.\nMisture e cozinhe até firmar.",
  finishing: null,
  servings: 2,
  isFavorite: false,
  creationMethod: "manual" as const,
};
let recipeId = "";

beforeAll(async () => {
  await db.insert(users).values([first, second]);
  recipeId = (await insertRecipe({ userId: first.id, ...recipeInput })).id;
});
afterAll(async () => {
  // Only exact synthetic IDs created by this file; no broad environment cleanup.
  await db
    .delete(creditLedger)
    .where(and(eq(creditLedger.app, "cozya"), inArray(creditLedger.ownerId, ids)));
  await db
    .delete(creditReservations)
    .where(and(eq(creditReservations.app, "cozya"), inArray(creditReservations.ownerId, ids)));
  await db.delete(cozyaTrialClaims).where(inArray(cozyaTrialClaims.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

describe("local PostgreSQL: household lifecycle", () => {
  it("grants exactly three trial credits under concurrent activation", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => startKitchenTrial(first)));
    expect(results.every((result) => result.ok)).toBe(true);
    const balance = await billing.getBalance({ type: "user", id: first.id });
    expect(balance.available).toBe(3);
    expect((await getKitchenAccess(first.id)).canPlan).toBe(true);
    expect(await startKitchenTrial({ ...second, emailVerified: false })).toMatchObject({
      ok: false,
      code: "VERIFY_EMAIL",
    });
  });
  it("enforces the free recipe limit with 20 concurrent writers", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        insertRecipeWithinFreeLimit(
          { userId: second.id, ...recipeInput, name: `Concurrent ${index}` },
          15,
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(15);
    expect(await countRecipesByUser(second.id)).toBe(15);
  });
  it("isolates meals and shopping, combines portions, and preserves checked state only when quantities match", async () => {
    expect(
      await saveMeal(second.id, {
        day: mealWeek,
        slot: "dinner",
        recipeId,
        label: "",
        servings: 4,
      }),
    ).toBe(false);
    for (const day of ["2027-02-01", "2027-02-02", "2027-02-03"])
      expect(
        await saveMeal(first.id, { day, slot: "dinner", recipeId, label: "", servings: 4 }),
      ).toBe(true);
    await generateShoppingList(first.id, mealWeek);
    let list = await getShoppingList(first.id, mealWeek);
    const eggs = list?.items.find((item) => item.name === "ovos");
    expect(eggs?.amount).toBe("12 un");
    if (!eggs) throw new Error("Expected consolidated eggs");
    expect(await getShoppingList(second.id, mealWeek)).toBeNull();
    expect(await setShoppingItemState(second.id, eggs.id, "bought")).toHaveLength(0);
    await setShoppingItemState(first.id, eggs.id, "have");
    await generateShoppingList(first.id, mealWeek);
    list = await getShoppingList(first.id, mealWeek);
    expect(list?.items.find((item) => item.name === "ovos")?.state).toBe("have");
    await saveMeal(first.id, { day: mealWeek, slot: "dinner", recipeId, label: "", servings: 2 });
    await generateShoppingList(first.id, mealWeek);
    expect(
      (await getShoppingList(first.id, mealWeek))?.items.find((item) => item.name === "ovos"),
    ).toMatchObject({ amount: "10 un", state: "todo" });
  });
  it("repeats a week without overwriting existing meals", async () => {
    await saveMeal(first.id, {
      day: "2027-02-08",
      slot: "dinner",
      recipeId: null,
      label: "Jantar fora",
      servings: 2,
    });
    expect(await repeatWeek(first.id, "2027-02-08")).toBe(2);
    expect(await repeatWeek(first.id, "2027-02-08")).toBe(0);
    expect((await getWeekMeals(first.id, "2027-02-08"))[0]?.label).toBe("Jantar fora");
  });
  it("removes only owned manual shopping extras and keeps the removal on regeneration", async () => {
    const list = await getShoppingList(first.id, mealWeek);
    if (!list) throw new Error("Expected shopping list");
    expect(
      await addShoppingExtra(second.id, { listId: list.id, name: "Café", amount: "1 pacote" }),
    ).toBe(false);
    await addShoppingExtra(first.id, { listId: list.id, name: "Café", amount: "1 pacote" });
    const extra = (await getShoppingList(first.id, mealWeek))?.items.find(
      (item) => item.name === "Café",
    );
    if (!extra || !list.items[0]) throw new Error("Expected generated and manual items");
    expect(await removeShoppingExtra(second.id, extra.id)).toHaveLength(0);
    expect(await removeShoppingExtra(first.id, list.items[0].id)).toHaveLength(0);
    expect(await removeShoppingExtra(first.id, extra.id)).toHaveLength(1);
    await generateShoppingList(first.id, mealWeek);
    expect(
      (await getShoppingList(first.id, mealWeek))?.items.some((item) => item.name === "Café"),
    ).toBe(false);
  });
  it("preserves concurrent cooking progress and resets it after an actual recipe edit", async () => {
    await Promise.all(
      [0, 1].map((index) =>
        updateCookingSession(first.id, {
          recipeId,
          operation: { type: "step", index, checked: true },
        }),
      ),
    );
    expect((await getCookingSession(first.id, recipeId))?.completedSteps.sort()).toEqual([0, 1]);
    expect(
      await updateCookingSession(second.id, { recipeId, operation: { type: "complete" } }),
    ).toBeNull();
    const timer = await updateCookingSession(first.id, {
      recipeId,
      operation: { type: "timer", minutes: 5 },
    });
    expect((await getCookingSession(first.id, recipeId))?.timerEndsAt?.getTime()).toBe(
      timer?.timerEndsAt?.getTime(),
    );
    await setRecipeFavoriteForUser(first.id, recipeId, true);
    const afterFavorite = await updateCookingSession(first.id, {
      recipeId,
      operation: { type: "ingredient", index: 0, checked: true },
    });
    expect(afterFavorite?.completedSteps.sort()).toEqual([0, 1]);
    expect(afterFavorite?.timerEndsAt?.getTime()).toBe(timer?.timerEndsAt?.getTime());
    await updateCookingSession(first.id, {
      recipeId,
      servings: 6,
      operation: { type: "portions" },
    });
    const portionSession = await getCookingSession(first.id, recipeId);
    expect(portionSession?.servings).toBe(6);
    expect(portionSession?.checkedIngredients).toEqual([]);
    expect(portionSession?.completedSteps.sort()).toEqual([0, 1]);
    expect(portionSession?.timerEndsAt?.getTime()).toBe(timer?.timerEndsAt?.getTime());
    await updateRecipeForUser(first.id, recipeId, {
      ...recipeInput,
      ingredients: "3 ovos\n100 g de queijo",
    });
    const changed = await updateCookingSession(first.id, {
      recipeId,
      operation: { type: "ingredient", index: 0, checked: true },
    });
    expect(changed?.completedSteps).toEqual([]);
    expect(changed?.timerEndsAt).toBeNull();
  });
  it("runs one task for simultaneous retries, replays its result, and blocks another owner or changed payload", async () => {
    const key = randomUUID();
    const request = () =>
      new Request("https://cozya.test/api/ai/recipes/parse-text", {
        headers: { "Idempotency-Key": key },
      });
    let calls = 0;
    const task = async () => {
      calls++;
      expect(currentAiOperationId()).toBe(key);
      return Response.json({ example: "preview" });
    };
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => runAiOperation(request(), first.id, "same recipe", task)),
    );
    expect(calls).toBe(1);
    expect(responses.some((response) => response.status === 200)).toBe(true);
    expect(await (await runAiOperation(request(), first.id, "same recipe", task)).json()).toEqual({
      example: "preview",
    });
    expect((await runAiOperation(request(), second.id, "same recipe", task)).status).toBe(409);
    expect((await runAiOperation(request(), first.id, "different recipe", task)).status).toBe(409);
    expect(calls).toBe(1);
  });
  it("exports only owned data and queries aggregate metrics without recipe content", async () => {
    const data = await exportCozyaData(first.id);
    expect(data.recipes.map((recipe) => recipe.id)).toEqual([recipeId]);
    await recordProductEvent(first.id, "recipe_saved", recipeId);
    const metrics = await getKitchenMetrics();
    expect(metrics.funnel).toBeInstanceOf(Array);
    expect(JSON.stringify(metrics)).not.toContain(recipeInput.ingredients);
    expect(JSON.stringify(metrics)).not.toContain(first.email);
  });
  it("restores a committed credit once when the final response failed, even with concurrent recovery", async () => {
    const id = randomUUID();
    const before = (await billing.getBalance({ type: "user", id: first.id })).available;
    await db.insert(cozyaAiOperations).values({
      id,
      userId: first.id,
      fingerprint: "recovery-test",
      statusCode: 502,
      response: { code: "AI_FAILED" },
      createdAt: new Date(Date.now() - 7_200_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await billing.reserveCredits({
      reservationId: id,
      owner: { type: "user", id: first.id },
      estimatedAmount: 1,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
    });
    await billing.commitReservation({ reservationId: id, actualAmount: 1 });
    expect((await billing.getBalance({ type: "user", id: first.id })).available).toBe(before - 1);
    expect((await recoverInterruptedAiOperation(id, second.id)).operation).toBeUndefined();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => recoverInterruptedAiOperation(id, first.id)),
    );
    expect(results.filter((result) => result.compensated)).toHaveLength(1);
    expect((await billing.getBalance({ type: "user", id: first.id })).available).toBe(before);
    expect(
      results.every(
        (result) => (result.operation?.response as { creditRestored?: boolean })?.creditRestored,
      ),
    ).toBe(true);
  });
  it("recovers only successful, unexpired recipe drafts belonging to the viewer", async () => {
    const response = { isValidRecipe: true, recipe: { ...recipeInput, creationMethod: "text" } };
    const expiresAt = new Date(Date.now() + 86_400_000);
    const ownId = randomUUID();
    await db.insert(cozyaAiOperations).values([
      { id: ownId, userId: first.id, fingerprint: "preview", statusCode: 200, response, expiresAt },
      {
        id: randomUUID(),
        userId: second.id,
        fingerprint: "preview",
        statusCode: 200,
        response,
        expiresAt,
      },
      {
        id: randomUUID(),
        userId: first.id,
        fingerprint: "preview",
        statusCode: 200,
        response,
        expiresAt: new Date(Date.now() - 1000),
      },
      {
        id: randomUUID(),
        userId: first.id,
        fingerprint: "preview",
        statusCode: 502,
        response,
        expiresAt,
        createdAt: new Date(Date.now() - 7_200_000),
      },
    ]);
    expect((await getRecentRecipePreviews(first.id)).map((preview) => preview.id)).toEqual([ownId]);
    expect((await getRecentRecipePreviews(first.id))[0]?.recipe.creationMethod).toBe("text");
    await db
      .update(cozyaAiOperations)
      .set({ response: { ...response, recipe: { ...response.recipe, creationMethod: undefined } } })
      .where(eq(cozyaAiOperations.id, ownId));
    expect((await getRecentRecipePreviews(first.id))[0]?.recipe.creationMethod).toBe("prompt");
  });
  it("releases a real reservation immediately, preserving its metadata and restoring available balance", async () => {
    const id = randomUUID();
    const owner = { type: "user" as const, id: first.id };
    const before = (await billing.getBalance(owner)).available;
    await billing.reserveCredits({
      reservationId: id,
      owner,
      estimatedAmount: 1,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
      metadata: { sample: true },
    });
    expect((await billing.getBalance(owner)).available).toBe(before - 1);
    await billing.releaseReservation({ reservationId: id, reason: "llm_error" });
    expect((await billing.getBalance(owner)).available).toBe(before);
    const [released] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, id));
    expect(released).toMatchObject({
      status: "released",
      metadata: { sample: true, release_reason: "llm_error" },
    });
    await billing.releaseReservation({ reservationId: id, reason: "llm_error" });
    expect((await billing.getBalance(owner)).available).toBe(before);
  });
  it("clears kitchen data without restarting the trial or touching the other household", async () => {
    const before = (await getKitchenAccess(first.id)).trialEndsAt;
    await clearCozyaData(first.id);
    expect(await countRecipesByUser(first.id)).toBe(0);
    expect(await countRecipesByUser(second.id)).toBe(15);
    expect(await getShoppingList(first.id, mealWeek)).toBeNull();
    expect((await getKitchenAccess(first.id)).trialEndsAt).toEqual(before);
    expect(
      await db.select().from(cozyaAiOperations).where(eq(cozyaAiOperations.userId, first.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(cozyaProfiles).where(eq(cozyaProfiles.userId, first.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(cozyaRecipes).where(eq(cozyaRecipes.userId, first.id)),
    ).toHaveLength(0);
  });
  it("does not erase billing recovery evidence during data clearing and restores credit before deletion", async () => {
    const user = {
      id: randomUUID(),
      name: "Pending cleanup",
      email: `${randomUUID()}@e2e.local`,
      emailVerified: true,
    };
    await db.insert(users).values(user);
    await startKitchenTrial(user);
    const recipe = await insertRecipe({ userId: user.id, ...recipeInput });
    const id = randomUUID();
    await db.insert(cozyaAiOperations).values({
      id,
      userId: user.id,
      fingerprint: "pending-cleanup",
      expiresAt: new Date(Date.now() + 86400000),
    });
    const owner = { type: "user" as const, id: user.id };
    await billing.reserveCredits({
      owner,
      reservationId: id,
      estimatedAmount: 1,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
    });
    await billing.commitReservation({ reservationId: id, actualAmount: 1 });
    await expect(clearCozyaData(user.id)).rejects.toThrow("Uma operação de IA");
    expect((await exportCozyaData(user.id)).recipes.map((r) => r.id)).toEqual([recipe.id]);
    expect((await billing.getBalance(owner)).available).toBe(2);
    await db
      .update(cozyaAiOperations)
      .set({
        statusCode: 502,
        response: { code: "AI_FAILED" },
        createdAt: new Date(Date.now() - 7200000),
      })
      .where(eq(cozyaAiOperations.id, id));
    await clearCozyaData(user.id);
    expect((await billing.getBalance(owner)).available).toBe(3);
    expect((await exportCozyaData(user.id)).recipes).toHaveLength(0);
    expect(
      await db.select().from(cozyaAiOperations).where(eq(cozyaAiOperations.id, id)),
    ).toHaveLength(0);
  });
  it("deletes legacy culinary threads and their messages while preserving another app's thread", async () => {
    const store = createPostgresStore({
      connectionString: env.DATABASE_URL,
      disableInit: true,
      max: 1,
    });
    const memory = await store.getStore("memory");
    if (!memory) {
      await store.close();
      throw new Error("Memory storage unavailable");
    }
    const own = `cozya:${first.id}:${randomUUID()}`;
    const other = `agenda:${first.id}:${randomUUID()}`;
    const messageIds = [randomUUID(), randomUUID()];
    try {
      for (const [index, id] of [own, other].entries()) {
        await memory.saveThread({
          thread: {
            id,
            resourceId: first.id,
            title: "Synthetic privacy test",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await memory.saveMessages({
          messages: [
            {
              id: messageIds[index] ?? randomUUID(),
              threadId: id,
              resourceId: first.id,
              role: "user",
              createdAt: new Date(),
              content: { format: 2, parts: [{ type: "text", text: "Synthetic private data" }] },
            },
          ],
        });
      }
      await memory.saveResource({
        resource: {
          id: first.id,
          workingMemory: "# Perfil culinário do usuário\nSynthetic preference",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      expect(await purgeLegacyCozyaAi(first.id)).toBe(1);
      expect(await memory.getThreadById({ threadId: own })).toBeNull();
      expect(await memory.getThreadById({ threadId: other })).not.toBeNull();
      const remaining = await memory.listMessagesById({ messageIds });
      expect(remaining.messages.map((message) => message.id)).toEqual([messageIds[1]]);
      expect((await memory.getResourceById({ resourceId: first.id }))?.workingMemory).toBeFalsy();
    } finally {
      await memory.deleteThread({ threadId: own });
      await memory.deleteThread({ threadId: other });
      await store.db.none("DELETE FROM ai_mastra.mastra_resources WHERE id = $1", [first.id]);
      await store.close();
    }
  });
});

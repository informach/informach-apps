import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { and, db, eq } from "@informach/db";
import {
  agentRuns,
  cozyaTrialClaims,
  creditLedger,
  creditReservations,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { clearCozyaData } from "@/features/account/repository";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
import { billing } from "@/features/billing/service";
import { startKitchenTrial } from "@/features/kitchen/access";
import { env } from "@/lib/env";

// Explicitly paid, opt-in smoke through the production Mastra/service/ledger path, local DB only.
const id = randomUUID();
const user = {
  id,
  name: "Synthetic AI smoke",
  email: `ai-smoke-${id}@e2e.local`,
  emailVerified: true,
};
beforeAll(async () => {
  await db.insert(users).values(user);
  await startKitchenTrial(user);
});
afterAll(async () => {
  await clearCozyaData(id);
  await db
    .delete(creditLedger)
    .where(and(eq(creditLedger.ownerId, id), eq(creditLedger.app, "cozya")));
  await db
    .delete(creditReservations)
    .where(and(eq(creditReservations.ownerId, id), eq(creditReservations.app, "cozya")));
  await db.delete(cozyaTrialClaims).where(eq(cozyaTrialClaims.userId, id));
  await db.delete(users).where(eq(users.id, id));
});
it("extracts through Mastra, debits once, replays, refuses incomplete input without debit, and stores no conversation", async () => {
  const operationId = randomUUID();
  const request = () =>
    new Request("https://cozya.test/api/ai/recipes/parse-text", {
      headers: { "Idempotency-Key": operationId },
    });
  const text =
    "Omelete simples. Rende 2 porções. Ingredientes: 2 ovos e 20 g de queijo. Preparo: bata os ovos, misture o queijo e cozinhe na frigideira até firmar.";
  let calls = 0;
  const call = async () => {
    calls++;
    return Response.json(await parseRecipeFromText({ userId: id, text }));
  };
  const first = await runAiOperation(request(), id, text, call);
  const result = await first.json();
  expect(first.status).toBe(200);
  expect(result).toMatchObject({ isValidRecipe: true, servings: 2 });
  expect(result.ingredients).toMatch(/2\s+ovos/iu);
  expect(result.ingredients).toMatch(/20\s*g/iu);
  expect((await billing.getBalance({ type: "user", id })).available).toBe(2);
  const replay = await runAiOperation(request(), id, text, call);
  expect(await replay.json()).toEqual(result);
  expect(calls).toBe(1);
  const refusal = await runAiOperation(
    new Request("https://cozya.test/api/ai/recipes/parse-text", {
      headers: { "Idempotency-Key": randomUUID() },
    }),
    id,
    "Tenho ovos, mas não há receita nem preparo.",
    async () =>
      Response.json(
        await parseRecipeFromText({
          userId: id,
          text: "Tenho ovos, mas não há receita nem preparo.",
        }),
      ),
  );
  expect(await refusal.json()).toMatchObject({ isValidRecipe: false, charged: false });
  expect((await billing.getBalance({ type: "user", id })).available).toBe(2);
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, operationId));
  expect(run?.status).toBe("succeeded");
  expect(run?.metadata?.providerCostUsd).toBeGreaterThan(0);
  expect(JSON.stringify(run?.metadata)).not.toContain("Omelete");
  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  try {
    const memory = await store.getStore("memory");
    expect(
      (await memory?.listThreads({ filter: { resourceId: id }, perPage: false }))?.threads,
    ).toEqual([]);
  } finally {
    await store.close();
  }
  await mkdir("tmp", { recursive: true });
  await writeFile(
    "tmp/ai-service-smoke.json",
    `${JSON.stringify({ executedAt: new Date().toISOString(), passed: true, callsForRepeatedOperation: calls, remainingCredits: 2, providerCostUsd: run?.metadata?.providerCostUsd ?? null, mastraThreads: 0 }, null, 2)}\n`,
  );
});

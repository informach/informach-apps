import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { startCompassoTrial } from "@informach/billing/compasso";
import { db, eq } from "@informach/db";
import { agentRuns, aiOperationReceipts, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { beforeAll, expect, it } from "vitest";
import { COZYA_AI_COSTS } from "@/features/ai/costs";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
import { type CozyaAiActor, getCozyaAiBalance } from "@/features/ai/wallet-repository";
import { env } from "@/lib/env";

// Explicitly paid, opt-in smoke through the production Mastra/service/ledger path, local DB only.
const id = randomUUID();
const user = {
  id,
  name: "Synthetic AI smoke",
  email: `ai-smoke-${id}@e2e.local`,
  emailVerified: true,
};
let actor: CozyaAiActor;
const costHeaders = {
  "X-Compasso-AI-Tariff": COZYA_AI_COSTS.text.version,
  "X-Compasso-AI-Credits": String(COZYA_AI_COSTS.text.maxCredits),
};
beforeAll(async () => {
  await db.insert(users).values(user);
  const group = await createFamilyService({ db }).createGroup(id, "Família fictícia de IA");
  actor = { userId: id, familyGroupId: group.id };
  await startCompassoTrial(
    { db, trialHashSecret: "synthetic-live-test-secret-32-characters" },
    id,
    group.id,
  );
});
// The opt-in runner owns and removes this whole disposable database, including financial facts.
it("extracts through Mastra, debits once, replays, refuses incomplete input without debit, and stores no conversation", async () => {
  const operationId = randomUUID();
  const request = () =>
    new Request("https://cozya.test/api/ai/recipes/parse-text", {
      headers: { ...costHeaders, "Idempotency-Key": operationId },
    });
  const text =
    "Omelete simples. Rende 2 porções. Ingredientes: 2 ovos e 20 g de queijo. Preparo: bata os ovos, misture o queijo e cozinhe na frigideira até firmar.";
  let calls = 0;
  const call = async () => {
    calls++;
    return Response.json(await parseRecipeFromText({ userId: id, text }));
  };
  const first = await runAiOperation(request(), actor, text, call);
  const result = await first.json();
  expect(first.status).toBe(200);
  expect(result).toMatchObject({ isValidRecipe: true, servings: 2 });
  expect(result.ingredients).toMatch(/2\s+ovos/iu);
  expect(result.ingredients).toMatch(/20\s*g/iu);
  expect((await getCozyaAiBalance(actor)).available).toBe(19);
  const replay = await runAiOperation(request(), actor, text, call);
  expect(await replay.json()).toEqual(result);
  expect(calls).toBe(1);
  const refusal = await runAiOperation(
    new Request("https://cozya.test/api/ai/recipes/parse-text", {
      headers: { ...costHeaders, "Idempotency-Key": randomUUID() },
    }),
    actor,
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
  expect((await getCozyaAiBalance(actor)).available).toBe(19);
  const [receipt] = await db
    .select()
    .from(aiOperationReceipts)
    .where(eq(aiOperationReceipts.scopeKey, operationId));
  if (!receipt) throw new Error("Missing receipt");
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, receipt.runId));
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
    `${JSON.stringify({ executedAt: new Date().toISOString(), passed: true, callsForRepeatedOperation: calls, remainingCredits: 19, providerCostUsd: run?.metadata?.providerCostUsd ?? null, mastraThreads: 0 }, null, 2)}\n`,
  );
});

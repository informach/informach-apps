import { createHash, randomUUID } from "node:crypto";
import { encodeSpeechPcm } from "@informach/ai-core/speech-audio";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq } from "@informach/db";
import {
  agentRuns,
  aiOperationReceipts,
  cozyaAiOperations,
  creditLedger,
  creditReservations,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());
vi.mock("@/ai", () => ({ getMastra: () => ({ getAgent: () => ({ generate }) }) }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: search,
}));

import {
  clearCozyaData,
  exportCozyaData,
  PendingAiCleanupError,
} from "@/features/account/repository";
import { recipeFromAudio } from "@/features/ai/audio-recipe-service";
import { type AiCostAcceptance, COZYA_AI_COSTS } from "@/features/ai/costs";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromImage } from "@/features/ai/parse-recipe-image-service";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
import { getRecentRecipePreviews } from "@/features/ai/previews";
import { recipeResponse } from "@/features/ai/recipe-output";
import { researchRecipeFromPrompt } from "@/features/ai/research-recipe-from-prompt-service";
import { type CozyaAiActor, getCozyaAiBalance } from "@/features/ai/wallet-repository";
import { readKitchenAccess } from "@/features/billing/access-repository";

it.each([false, true])(
  "does not retain an HTTP or provider output after freeze (resumed=%s)",
  async (resumed) => {
    const actor = await account();
    const id = randomUUID();
    const transition = { userId: actor.userId, operationId: randomUUID(), expectedRevision: 0 };
    generate.mockImplementationOnce(async () => {
      await db.transaction((tx) => freezeWebParticipation(tx, transition));
      if (resumed)
        await db.transaction((tx) =>
          resumeWebParticipation(tx, { ...transition, expectedRevision: 1 }),
        );
      return { object: recipe, usage: { inputTokens: 100, outputTokens: 100 } };
    });
    const response = await textCall(actor, id);
    expect([403, 410]).toContain(response.status);
    expect(await response.text()).not.toContain(recipe.name);
    const [operation] = await db
      .select()
      .from(cozyaAiOperations)
      .where(eq(cozyaAiOperations.id, id));
    const [receipt] = await db
      .select()
      .from(aiOperationReceipts)
      .where(eq(aiOperationReceipts.scopeKey, id));
    expect(operation?.response).toBeNull();
    expect(receipt?.result).toBeNull();
    if (!receipt) throw new Error("Missing admitted operation receipt");
    expect(await consumption(actor)).toEqual([]);
    const [hold] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, receipt.runId));
    expect(hold?.status).toBe("released");
    if (!resumed)
      await db.transaction((tx) =>
        resumeWebParticipation(tx, { ...transition, expectedRevision: 1 }),
      );
    expect((await getCozyaAiBalance(actor)).available).toBe(20);
    expect(await getRecentRecipePreviews(actor.userId)).toEqual([]);
    const replay = await textCall(actor, id);
    expect(replay.status).toBe(410);
    expect(generate).toHaveBeenCalledTimes(1);
  },
);

const family = createFamilyService({ db });
const recipe = {
  isValidRecipe: true,
  reason: null,
  name: "Arroz fictício",
  ingredients: "1 xícara de arroz",
  preparation: "Cozinhe o arroz.",
  finishing: null,
  servings: 2,
  totalMinutes: 20,
  sourceUrl: null,
  sourceName: null,
};
const url = "https://example.invalid/receita";
const audio = new Blob([encodeSpeechPcm(new Float32Array(16000))], { type: "audio/wav" });
const endpoint = "http://localhost:3002/api/ai/recipes/parse-text";
function gate() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve() {
      if (!release) throw new Error("Uninitialized test gate");
      release();
    },
  };
}
async function account(withTrial = true): Promise<CozyaAiActor> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "Pessoa fictícia",
    email: `${userId}@example.invalid`,
    emailVerified: true,
  });
  const group = await family.createGroup(userId, "Família fictícia");
  if (withTrial)
    await startCompassoTrial(
      { db, trialHashSecret: "synthetic-compasso-test-secret-32-characters" },
      userId,
      group.id,
    );
  return { userId, familyGroupId: group.id };
}
function request(id: string, quote: AiCostAcceptance) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Idempotency-Key": id,
      "X-Compasso-AI-Tariff": quote.version,
      "X-Compasso-AI-Credits": String(quote.maxCredits),
    },
  });
}
function textCall(
  actor: CozyaAiActor,
  id = randomUUID(),
  text = "Uma receita fictícia",
  quote = COZYA_AI_COSTS.text,
) {
  return runAiOperation(request(id, quote), actor, text, async () =>
    Response.json(
      recipeResponse(await parseRecipeFromText({ userId: actor.userId, text }), "text"),
    ),
  );
}
async function consumption(actor: CozyaAiActor) {
  return db
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.app, "compasso"),
        eq(creditLedger.ownerId, actor.familyGroupId),
        eq(creditLedger.entryType, "consumption"),
      ),
    );
}
beforeEach(() => {
  vi.clearAllMocks();
  generate.mockResolvedValue({
    object: recipe,
    usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 },
  });
  search.mockResolvedValue({
    text: `FONTE_URL: ${url}\nNOME: Arroz\nINGREDIENTES: 1 xícara de arroz\nPREPARO: Cozinhe.`,
    sources: [{ sourceType: "url", id: url, url, title: "Fonte fictícia" }],
    usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
    providerMetadata: { openrouter: { usage: { cost: 0.008 } } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        text: "Arroz: cozinhe uma xícara de arroz.",
        usage: { seconds: 1, cost: 0.0001, input_tokens: 20, output_tokens: 10 },
      }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Cozya AI: real shared wallet and durable results; synthetic provider boundary", () => {
  it("normalizes a decoded photo before the provider and fits the trial wallet", async () => {
    const actor = await account();
    const imageDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=";
    const runPhoto = (input: string) =>
      runAiOperation(request(randomUUID(), COZYA_AI_COSTS.photo), actor, input, async () =>
        Response.json(
          recipeResponse(
            await parseRecipeFromImage({ userId: actor.userId, imageDataUrl: input }),
            "image",
          ),
        ),
      );
    expect(COZYA_AI_COSTS.photo.maxCredits).toBeLessThanOrEqual(20);
    expect((await runPhoto(imageDataUrl)).status).toBe(200);
    expect(generate.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: "image",
            image: expect.stringMatching(/^data:image\/jpeg;base64,/),
          }),
        ]),
      }),
    ]);
    expect((await getCozyaAiBalance(actor)).available).toBe(19);
    const invalid = await runPhoto("data:image/png;base64,YmFk");
    expect(invalid.status).toBe(400);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await consumption(actor)).toHaveLength(1);
  });
  it("spends a non-expiring purchased balance with no subscription or trial coverage", async () => {
    const actor = await account(false);
    // A settled purchase fixture; Stripe ingestion is covered in the billing integration suite.
    await db.insert(creditLedger).values({
      ownerType: "family",
      ownerId: actor.familyGroupId,
      app: "compasso",
      entryType: "purchase",
      amount: 100,
      expiresAt: null,
    });
    expect(await readKitchenAccess(actor)).toMatchObject({ canPlan: false, canUseAi: true });
    expect((await textCall(actor)).status).toBe(200);
    expect((await getCozyaAiBalance(actor)).available).toBe(99);
  });
  it("requires an explicit matching price before any provider call or reservation", async () => {
    const actor = await account();
    const missing = await runAiOperation(
      new Request(endpoint, { headers: { "Idempotency-Key": randomUUID() } }),
      actor,
      "receita",
      async () =>
        Response.json(await parseRecipeFromText({ userId: actor.userId, text: "receita" })),
    );
    expect(missing.status).toBe(400);
    expect(
      (await textCall(actor, randomUUID(), "receita", { ...COZYA_AI_COSTS.text, maxCredits: 1 }))
        .status,
    ).toBe(409);
    expect(generate).not.toHaveBeenCalled();
    expect(
      await db
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.ownerId, actor.familyGroupId)),
    ).toHaveLength(0);
  });
  it("charges once, replays without a provider call and binds the UUID to content, family and price", async () => {
    const actor = await account(),
      id = randomUUID();
    expect((await textCall(actor, id)).status).toBe(200);
    expect((await textCall(actor, id)).status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await getCozyaAiBalance(actor)).available).toBe(19);
    expect(await consumption(actor)).toHaveLength(1);
    expect((await textCall(actor, id, "Outro conteúdo")).status).toBe(409);
    const other = await family.createGroup(actor.userId, "Outra família");
    expect((await textCall({ ...actor, familyGroupId: other.id }, id)).status).toBe(409);
    expect(
      (
        await textCall(actor, id, "Uma receita fictícia", {
          ...COZYA_AI_COSTS.text,
          maxCredits: 99,
        })
      ).status,
    ).toBe(409);
    const [receipt] = await db
      .select()
      .from(aiOperationReceipts)
      .where(eq(aiOperationReceipts.scopeKey, id));
    expect(receipt).toMatchObject({
      phase: "complete",
      groupId: actor.familyGroupId,
      actualCredits: 1,
    });
  });
  it("recovers a committed output after the HTTP response fails without charging or generating again", async () => {
    const actor = await account(),
      id = randomUUID(),
      text = "Uma receita fictícia";
    const first = await runAiOperation(request(id, COZYA_AI_COSTS.text), actor, text, async () => {
      await parseRecipeFromText({ userId: actor.userId, text });
      throw new Error("Synthetic response loss");
    });
    expect(first.status).toBe(502);
    expect(await getRecentRecipePreviews(actor.userId)).toEqual([
      expect.objectContaining({ id, recipe: expect.objectContaining({ name: recipe.name }) }),
    ]);
    expect((await textCall(actor, id)).status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await consumption(actor)).toHaveLength(1);
  });
  it("serializes concurrent requests through the receipt without holding a database transaction during generation", async () => {
    const actor = await account(),
      id = randomUUID();
    const entered = gate(),
      resume = gate();
    generate.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { object: recipe, usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const first = textCall(actor, id);
    await entered.promise;
    try {
      expect((await textCall(actor, id)).status).toBe(409);
      await expect(clearCozyaData(actor.userId)).rejects.toBeInstanceOf(PendingAiCleanupError);
    } finally {
      resume.resolve();
    }
    expect((await first).status).toBe(200);
    expect(await consumption(actor)).toHaveLength(1);
  });
  it("reauthorizes replay after a family member is revoked", async () => {
    const owner = await account(),
      member = await account();
    const [user] = await db.select().from(users).where(eq(users.id, member.userId));
    if (!user) throw new Error("Missing fixture");
    const invitation = await family.createInvitation(owner.userId, owner.familyGroupId, user.email);
    await family.acceptInvitation(member.userId, invitation.token);
    const actor = { ...member, familyGroupId: owner.familyGroupId },
      id = randomUUID();
    expect((await textCall(actor, id)).status).toBe(200);
    await family.revokeMember(owner.userId, owner.familyGroupId, member.userId);
    expect((await textCall(actor, id)).status).toBe(403);
    expect((await exportCozyaData(member.userId)).aiPreviews).toHaveLength(0);
    expect(await getRecentRecipePreviews(member.userId)).toHaveLength(0);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("releases the shared reservation on invalid recipe and never invents missing usage", async () => {
    const actor = await account();
    generate.mockResolvedValueOnce({ object: { ...recipe, preparation: null }, usage: {} });
    expect(await (await textCall(actor)).json()).toMatchObject({
      isValidRecipe: false,
      charged: false,
    });
    generate.mockResolvedValueOnce({ object: recipe, usage: {} });
    expect((await textCall(actor)).status).toBe(502);
    expect(await consumption(actor)).toHaveLength(0);
    expect((await getCozyaAiBalance(actor)).available).toBe(20);
  });
  it("verifies source citations and charges one reservation for both research stages", async () => {
    const actor = await account(),
      id = randomUUID();
    const response = await runAiOperation(
      request(id, COZYA_AI_COSTS.research),
      actor,
      "arroz",
      async () =>
        Response.json(
          recipeResponse(await researchRecipeFromPrompt({ userId: actor.userId, prompt: "arroz" })),
        ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recipe: { sourceUrl: url, sourceName: "Fonte fictícia" },
    });
    expect((await consumption(actor)).map((row) => row.amount)).toEqual([-2]);
    const holds = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.ownerId, actor.familyGroupId));
    expect(holds).toHaveLength(1);
    search.mockResolvedValueOnce({
      text: "FONTE_URL: https://forged.invalid",
      sources: [],
      usage: {},
    });
    const failed = await runAiOperation(
      request(randomUUID(), COZYA_AI_COSTS.research),
      actor,
      "ausente",
      async () =>
        Response.json(await researchRecipeFromPrompt({ userId: actor.userId, prompt: "ausente" })),
    );
    expect(await failed.json()).toMatchObject({ isValidRecipe: false, charged: false });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await consumption(actor)).toHaveLength(1);
  });
  it("includes transcription and parsing in one debit and releases everything if the second stage fails", async () => {
    const actor = await account();
    const run = () =>
      runAiOperation(request(randomUUID(), COZYA_AI_COSTS.audioRecipe), actor, audio, async () =>
        Response.json(
          recipeResponse(await recipeFromAudio({ userId: actor.userId, audio, mode: "recipe" })),
        ),
      );
    expect((await run()).status).toBe(200);
    expect((await consumption(actor)).map((row) => row.amount)).toEqual([-2]);
    generate.mockRejectedValueOnce(new Error("Synthetic provider failure"));
    expect((await run()).status).toBe(502);
    expect(await consumption(actor)).toHaveLength(1);
    const logs = await db.select().from(agentRuns).where(eq(agentRuns.app, "cozya"));
    expect(JSON.stringify(logs)).not.toContain(recipe.preparation);
  });
  it("rejects forged audio before the provider and retains old completed results without a new debit", async () => {
    const actor = await account();
    const invalid = await runAiOperation(
      request(randomUUID(), COZYA_AI_COSTS.audioRecipe),
      actor,
      "invalid audio",
      async () =>
        Response.json(
          await recipeFromAudio({
            userId: actor.userId,
            audio: new Blob(["not PCM"], { type: "audio/wav" }),
            mode: "recipe",
          }),
        ),
    );
    expect(invalid.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const id = randomUUID(),
      text = "Uma receita fictícia";
    await db.insert(cozyaAiOperations).values({
      id,
      userId: actor.userId,
      fingerprint: createHash("sha256")
        .update(new URL(endpoint).pathname)
        .update(text)
        .digest("hex"),
      response: recipeResponse(recipe, "text"),
      statusCode: 200,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect((await textCall(actor, id)).status).toBe(200);
    expect(generate).not.toHaveBeenCalled();
    expect(await consumption(actor)).toHaveLength(0);
  });
  it("clears private outputs and leaves a tombstone that prevents a delayed request from charging again", async () => {
    const actor = await account(),
      id = randomUUID();
    expect((await textCall(actor, id)).status).toBe(200);
    await clearCozyaData(actor.userId);
    expect(
      await db
        .select()
        .from(aiOperationReceipts)
        .where(eq(aiOperationReceipts.actorUserId, actor.userId)),
    ).toHaveLength(0);
    expect(await getRecentRecipePreviews(actor.userId)).toHaveLength(0);
    expect(JSON.stringify(await exportCozyaData(actor.userId))).not.toContain(recipe.preparation);
    expect((await textCall(actor, id)).status).toBe(410);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await consumption(actor)).toHaveLength(1);
  });
});

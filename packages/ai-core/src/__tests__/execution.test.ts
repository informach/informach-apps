import { describe, expect, it, vi } from "vitest";
import type { CreditAwareBillingClient } from "../billing";
import { runBillableAgentCall, runRecordedAiCall } from "../execution";
import type { AgentRunRecorder } from "../telemetry";

const owner = { type: "user" as const, id: "user-1" };
const futureExpiry = new Date(Date.now() + 60_000);

function makeBilling(overrides: Partial<CreditAwareBillingClient> = {}): CreditAwareBillingClient {
  return {
    reserveCredits: vi.fn(async (input) => ({
      id: input.reservationId ?? "11111111-1111-4111-8111-111111111111",
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      estimatedAmount: input.estimatedAmount,
      expiresAt: futureExpiry,
    })),
    commitReservation: vi.fn(async () => ({
      ledgerEntryId: "ledger-1",
      balanceAfter: 10,
    })),
    releaseReservation: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeRecorder(): AgentRunRecorder {
  return {
    start: vi.fn(async () => undefined),
    finish: vi.fn(async () => undefined),
  };
}

describe("runBillableAgentCall", () => {
  it("wraps credits, retry-free audit, usage normalization and commit", async () => {
    const billing = makeBilling();
    const recorder = makeRecorder();

    const out = await runBillableAgentCall<{
      reservationId: string;
      runId: string;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    }>({
      billing,
      recorder,
      owner,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
      model: "openai/gpt-4o-mini",
      agent: "recipeParser",
      retry: false,
      getUsage: (result) => result.usage,
      call: async ({ reservation, runId }) => ({
        reservationId: reservation.id,
        runId,
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      }),
    });

    expect(out.result.runId).toBe(out.reservationId);
    expect(out.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        app: "cozya",
        feature: "cozya.recipe.extract_from_text",
        model: "openai/gpt-4o-mini",
        estimatedAmount: 1,
      }),
    );
    expect(recorder.start).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: out.reservationId,
        app: "cozya",
        agent: "recipeParser",
        metadata: expect.objectContaining({
          feature: "cozya.recipe.extract_from_text",
          model: "openai/gpt-4o-mini",
        }),
      }),
    );
    expect(recorder.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: out.reservationId,
        status: "succeeded",
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      }),
    );
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: out.reservationId, actualAmount: 1 }),
    );
  });

  it("supports a separate audit run id for multi-stage flows", async () => {
    const billing = makeBilling();
    const recorder = makeRecorder();
    const stageRunId = "22222222-2222-4222-8222-222222222222";

    const out = await runBillableAgentCall<{ runId: string }>({
      billing,
      recorder,
      owner,
      app: "cozya",
      feature: "cozya.recipe.generate_from_prompt",
      agent: "recipeResearcher",
      recordRunId: stageRunId,
      retry: false,
      call: async ({ runId }) => ({ runId }),
    });

    expect(out.result.runId).toBe(stageRunId);
    expect(recorder.start).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: stageRunId,
        metadata: expect.objectContaining({
          reservationId: out.reservationId,
          feature: "cozya.recipe.generate_from_prompt",
        }),
      }),
    );
  });

  it("marks the audit run failed and releases credits when the call fails", async () => {
    const billing = makeBilling();
    const recorder = makeRecorder();
    const error = new Error("provider down");

    await expect(
      runBillableAgentCall({
        billing,
        recorder,
        owner,
        app: "cozya",
        feature: "cozya.recipe.extract_from_text",
        agent: "recipeParser",
        retry: false,
        call: async () => {
          throw error;
        },
      }),
    ).rejects.toThrow(error);

    expect(recorder.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({ error: "provider down" }),
      }),
    );
    expect(billing.releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "llm_error" }),
    );
    expect(billing.commitReservation).not.toHaveBeenCalled();
  });
});

describe("runRecordedAiCall", () => {
  it("records success metadata without billing", async () => {
    const recorder = makeRecorder();

    const out = await runRecordedAiCall({
      recorder,
      app: "cozya",
      agent: "recipeResearcher",
      runId: "33333333-3333-4333-8333-333333333333",
      retry: false,
      metadata: { stage: "research" },
      getSuccessMetadata: () => ({ outcome: "research_found" }),
      call: async () => "ok",
    });

    expect(out.result).toBe("ok");
    expect(recorder.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        metadata: { stage: "research", outcome: "research_found" },
      }),
    );
  });
});

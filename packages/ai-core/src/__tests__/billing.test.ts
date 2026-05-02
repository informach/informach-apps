import { describe, expect, it, vi } from "vitest";
import {
  type CreditAwareBillingClient,
  CreditValidationError,
  computeCreditsFromUsage,
  withCredits,
} from "../billing";

const owner = { type: "user" as const, id: "user-1" };
const futureExpiry = new Date(Date.now() + 60_000);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeBilling(overrides: Partial<CreditAwareBillingClient> = {}): CreditAwareBillingClient {
  return {
    reserveCredits: vi.fn(async (input) => ({
      id: input.reservationId ?? "res-1",
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      estimatedAmount: input.estimatedAmount,
      expiresAt: futureExpiry,
    })),
    commitReservation: vi.fn(async () => ({
      ledgerEntryId: "ledger-1",
      balanceAfter: 800,
    })),
    releaseReservation: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("withCredits", () => {
  it("reserves estimated, runs the call, then commits actual", async () => {
    const billing = makeBilling();
    const out = await withCredits({
      billing,
      owner,
      app: "cozya",
      feature: "llm.text",
      model: "claude-sonnet-4-6",
      estimateCost: () => ({ estimatedAmount: 200 }),
      call: async () => ({
        text: "hi",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      }),
      computeActualCost: (r) => ({
        actualAmount: computeCreditsFromUsage(r.usage, {
          promptCostPer1k: 30,
          completionCostPer1k: 150,
        }),
      }),
    });
    expect(out.estimatedAmount).toBe(200);
    expect(out.actualAmount).toBe(11); // ceil(100/1000*30 + 50/1000*150) = ceil(3 + 7.5) = 11
    expect(out.ledgerEntryId).toBe("ledger-1");
    expect(out.reservationId).toMatch(uuidPattern);
    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: expect.stringMatching(uuidPattern),
        runId: expect.stringMatching(uuidPattern),
        estimatedAmount: 200,
        feature: "llm.text",
        model: "claude-sonnet-4-6",
      }),
    );
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: expect.stringMatching(uuidPattern),
        actualAmount: 11,
      }),
    );
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it("uses an explicit runId as the reservation id for cross-schema correlation", async () => {
    const billing = makeBilling();
    const runId = "11111111-1111-4111-8111-111111111111";
    const out = await withCredits({
      billing,
      owner,
      app: "cozya",
      feature: "llm.text",
      runId,
      estimateCost: () => ({ estimatedAmount: 200 }),
      call: async () => "ok",
      computeActualCost: () => ({ actualAmount: 100 }),
    });
    expect(out.reservationId).toBe(runId);
    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: runId, runId }),
    );
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: runId }),
    );
  });

  it("releases the reservation with reason 'llm_error' when call() throws", async () => {
    const billing = makeBilling();
    const error = new Error("anthropic 500");
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 200 }),
        call: async () => {
          throw error;
        },
        computeActualCost: () => ({ actualAmount: 0 }),
      }),
    ).rejects.toThrow(error);
    expect(billing.releaseReservation).toHaveBeenCalledWith({
      reservationId: expect.stringMatching(uuidPattern),
      reason: "llm_error",
    });
    expect(billing.commitReservation).not.toHaveBeenCalled();
  });

  it("classifies AbortError / TimeoutError as 'timeout'", async () => {
    const billing = makeBilling();
    const abort = new Error("aborted");
    abort.name = "AbortError";
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 100 }),
        call: async () => {
          throw abort;
        },
        computeActualCost: () => ({ actualAmount: 0 }),
      }),
    ).rejects.toThrow(abort);
    expect(billing.releaseReservation).toHaveBeenCalledWith({
      reservationId: expect.stringMatching(uuidPattern),
      reason: "timeout",
    });
  });

  it("releases with reason 'validation_failed' when computeActualCost throws", async () => {
    const billing = makeBilling();
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 100 }),
        call: async () => "ok",
        computeActualCost: () => {
          throw new Error("bad usage shape");
        },
      }),
    ).rejects.toThrow(/bad usage shape/);
    expect(billing.releaseReservation).toHaveBeenCalledWith({
      reservationId: expect.stringMatching(uuidPattern),
      reason: "validation_failed",
    });
  });

  it("releases with reason 'validation_failed' when computeActualCost returns an invalid amount", async () => {
    const billing = makeBilling();
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 100 }),
        call: async () => "ok",
        computeActualCost: () => ({ actualAmount: 0 }),
      }),
    ).rejects.toThrow(CreditValidationError);
    expect(billing.releaseReservation).toHaveBeenCalledWith({
      reservationId: expect.stringMatching(uuidPattern),
      reason: "validation_failed",
    });
    expect(billing.commitReservation).not.toHaveBeenCalled();
  });

  it("rejects invalid explicit runId before reserving credits", async () => {
    const billing = makeBilling();
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        runId: "run-1",
        estimateCost: () => ({ estimatedAmount: 100 }),
        call: async () => "ok",
        computeActualCost: () => ({ actualAmount: 100 }),
      }),
    ).rejects.toThrow("runId must be a UUID");
    expect(billing.reserveCredits).not.toHaveBeenCalled();
  });

  it("propagates the original error even if releaseReservation also fails", async () => {
    const billing = makeBilling({
      releaseReservation: vi.fn(async () => {
        throw new Error("billing down");
      }),
    });
    const original = new Error("anthropic 503");
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 100 }),
        call: async () => {
          throw original;
        },
        computeActualCost: () => ({ actualAmount: 0 }),
      }),
    ).rejects.toThrow(original);
  });

  it("propagates InsufficientCreditsError from reserveCredits without calling LLM", async () => {
    const insufficient = Object.assign(new Error("insufficient"), {
      name: "InsufficientCreditsError",
    });
    const billing = makeBilling({
      reserveCredits: vi.fn(async () => {
        throw insufficient;
      }),
    });
    const llmCall = vi.fn(async () => "should not run");
    await expect(
      withCredits({
        billing,
        owner,
        app: "cozya",
        feature: "llm.text",
        estimateCost: () => ({ estimatedAmount: 5000 }),
        call: llmCall,
        computeActualCost: () => ({ actualAmount: 0 }),
      }),
    ).rejects.toThrow(insufficient);
    expect(llmCall).not.toHaveBeenCalled();
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it("commits actualAmount > estimatedAmount (caller may overrun)", async () => {
    const billing = makeBilling();
    const out = await withCredits({
      billing,
      owner,
      app: "cozya",
      feature: "llm.text",
      estimateCost: () => ({ estimatedAmount: 100 }),
      call: async () => ({ tokens: 999 }),
      computeActualCost: () => ({ actualAmount: 250 }),
    });
    expect(out.actualAmount).toBe(250);
    expect(out.estimatedAmount).toBe(100);
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 250 }),
    );
  });
});

describe("computeCreditsFromUsage", () => {
  it("rounds up to nearest integer credit", () => {
    expect(
      computeCreditsFromUsage(
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        { promptCostPer1k: 30, completionCostPer1k: 150 },
      ),
    ).toBe(11);
  });

  it("returns at least 1 credit even for tiny usage", () => {
    expect(
      computeCreditsFromUsage(
        { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        { promptCostPer1k: 1, completionCostPer1k: 1 },
      ),
    ).toBe(1);
  });

  it("handles zero pricing (free tier)", () => {
    expect(
      computeCreditsFromUsage(
        { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 },
        { promptCostPer1k: 0, completionCostPer1k: 0 },
      ),
    ).toBe(1);
  });

  it("rejects inconsistent token usage", () => {
    expect(() =>
      computeCreditsFromUsage(
        { promptTokens: 100, completionTokens: 50, totalTokens: 10 },
        { promptCostPer1k: 1, completionCostPer1k: 1 },
      ),
    ).toThrow(CreditValidationError);
  });

  it("rejects negative pricing", () => {
    expect(() =>
      computeCreditsFromUsage(
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        { promptCostPer1k: -1, completionCostPer1k: 1 },
      ),
    ).toThrow(CreditValidationError);
  });
});

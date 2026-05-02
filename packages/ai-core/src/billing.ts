import type { CreditOwner, ReservationHandle } from "@informach/billing";
import type { AppName, TokenUsage } from "./types";

/**
 * Minimal slice of `BillingService` used by this wrapper. Importing the
 * concrete `BillingService` type would create a heavy coupling to every method
 * — this slice keeps the contract small and easy to mock in tests.
 */
export type CreditAwareBillingClient = {
  reserveCredits(input: {
    owner: CreditOwner;
    estimatedAmount: number;
    app: string;
    feature: string;
    model?: string;
    runId?: string;
    requestId?: string;
    ttlSeconds?: number;
    metadata?: Record<string, unknown>;
  }): Promise<ReservationHandle>;
  commitReservation(input: {
    reservationId: string;
    actualAmount: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ ledgerEntryId: string; balanceAfter: number }>;
  releaseReservation(input: {
    reservationId: string;
    reason: "user_cancel" | "llm_error" | "timeout" | "validation_failed";
  }): Promise<void>;
};

export type CostEstimate = {
  /** Credits to reserve before the LLM call. */
  estimatedAmount: number;
};

export type CostActual = {
  /** Credits to actually debit on commit. May be smaller, equal or larger than the estimate. */
  actualAmount: number;
};

export type WithCreditsContext = {
  /** Reservation handle returned by reserveCredits. Useful for tracing/logging. */
  reservation: ReservationHandle;
};

export type WithCreditsInput<TResult> = {
  billing: CreditAwareBillingClient;
  owner: CreditOwner;
  app: AppName;
  feature: string;
  model?: string;
  runId?: string;
  requestId?: string;
  ttlSeconds?: number;
  reserveMetadata?: Record<string, unknown>;
  /** Compute the credits to reserve. Called BEFORE the LLM call. */
  estimateCost: () => Promise<CostEstimate> | CostEstimate;
  /**
   * Run the actual LLM (or other paid) operation. Receives the reservation
   * handle in case the inner call wants to attach it to telemetry.
   */
  call: (ctx: WithCreditsContext) => Promise<TResult>;
  /**
   * Compute the credits to debit after the call succeeds. Most LLM SDKs return
   * a `usage` object; map it to credits here using your pricing function.
   * Called AFTER the LLM call, before commit.
   */
  computeActualCost: (result: TResult) => Promise<CostActual> | CostActual;
};

export type WithCreditsResult<TResult> = {
  result: TResult;
  ledgerEntryId: string;
  reservationId: string;
  estimatedAmount: number;
  actualAmount: number;
  balanceAfter: number;
};

/**
 * Higher-order helper that wraps any paid operation (typically an LLM call)
 * with the billing reserve+commit/release pattern.
 *
 *   1. estimateCost() → reserve those credits (throws InsufficientCreditsError)
 *   2. call(ctx) → run the LLM
 *   3a. on success: computeActualCost(result) → commitReservation(actualAmount)
 *   3b. on error:   releaseReservation(reason: "llm_error" | "timeout")
 *
 * The owner of the saldo is determined by the app:
 *   - apps with organizations enabled (e.g., agenda-da-turma) typically pass
 *     `{ type: "organization", id: activeOrgId }`.
 *   - single-user apps (e.g., cozya) pass `{ type: "user", id: user.id }`.
 *
 * Errors from `call()` and `computeActualCost()` propagate to the caller AFTER
 * the reservation is released (so the saldo is freed). Errors from
 * `releaseReservation` are swallowed and replaced with the original error so
 * the caller sees the underlying LLM failure, not a billing-side glitch.
 */
export async function withCredits<TResult>(
  input: WithCreditsInput<TResult>,
): Promise<WithCreditsResult<TResult>> {
  const estimate = await input.estimateCost();
  const reservation = await input.billing.reserveCredits({
    owner: input.owner,
    estimatedAmount: estimate.estimatedAmount,
    app: input.app,
    feature: input.feature,
    model: input.model,
    runId: input.runId,
    requestId: input.requestId,
    ttlSeconds: input.ttlSeconds,
    metadata: input.reserveMetadata,
  });

  let result: TResult;
  try {
    result = await input.call({ reservation });
  } catch (err) {
    await safeRelease(input.billing, reservation.id, classifyReleaseReason(err));
    throw err;
  }

  let actual: CostActual;
  try {
    actual = await input.computeActualCost(result);
  } catch (err) {
    // Computing the actual cost failed — release the reservation and surface the error.
    await safeRelease(input.billing, reservation.id, "validation_failed");
    throw err;
  }

  const commitResult = await input.billing.commitReservation({
    reservationId: reservation.id,
    actualAmount: actual.actualAmount,
    metadata: input.reserveMetadata,
  });

  return {
    result,
    ledgerEntryId: commitResult.ledgerEntryId,
    reservationId: reservation.id,
    estimatedAmount: estimate.estimatedAmount,
    actualAmount: actual.actualAmount,
    balanceAfter: commitResult.balanceAfter,
  };
}

/**
 * Maps an LLM token usage to a credit cost using a flat per-1k pricing.
 * Apps can use this helper inside `computeActualCost` when their pricing
 * follows the standard "credits per 1k prompt + credits per 1k completion"
 * model. For more complex pricing, write a custom function.
 */
export function computeCreditsFromUsage(
  usage: TokenUsage,
  pricing: { promptCostPer1k: number; completionCostPer1k: number },
): number {
  const promptCredits = (usage.promptTokens / 1000) * pricing.promptCostPer1k;
  const completionCredits = (usage.completionTokens / 1000) * pricing.completionCostPer1k;
  return Math.max(1, Math.ceil(promptCredits + completionCredits));
}

function classifyReleaseReason(
  err: unknown,
): "llm_error" | "timeout" | "validation_failed" | "user_cancel" {
  if (!err || typeof err !== "object") return "llm_error";
  const name = (err as { name?: string }).name;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  return "llm_error";
}

async function safeRelease(
  billing: CreditAwareBillingClient,
  reservationId: string,
  reason: "user_cancel" | "llm_error" | "timeout" | "validation_failed",
): Promise<void> {
  try {
    await billing.releaseReservation({ reservationId, reason });
  } catch {
    // Swallow: the caller's original error is the priority. The reservation
    // will eventually expire and be reaped by `releaseExpiredReservations`.
  }
}

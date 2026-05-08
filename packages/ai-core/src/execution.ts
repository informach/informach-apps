import type { CreditOwner, ReservationHandle } from "@informach/billing";
import type { CostActual, CostEstimate, CreditAwareBillingClient } from "./billing";
import { withCredits } from "./billing";
import type { RetryOptions } from "./retry";
import { withRetry } from "./retry";
import type { AgentRunRecorder } from "./telemetry";
import type { AgentName, AppName, TokenUsage } from "./types";
import { normalizeUsage } from "./usage";

export type AiCallContext = {
  reservation: ReservationHandle;
  /** ID usado em `ai.agent_runs` e, quando aplicável, no `runId` do Mastra. */
  runId: string;
};

export type RecordedAiCallInput<TResult> = {
  recorder: AgentRunRecorder;
  app: AppName;
  agent: AgentName;
  runId: string;
  metadata?: Record<string, unknown>;
  retry?: RetryOptions | false;
  call: () => Promise<TResult>;
  getUsage?: (result: TResult) => unknown;
  getSuccessMetadata?: (result: TResult) => Record<string, unknown> | undefined;
  getErrorMetadata?: (error: unknown) => Record<string, unknown> | undefined;
};

export type BillableAiCallInput<TResult> = Omit<RecordedAiCallInput<TResult>, "runId" | "call"> & {
  billing: CreditAwareBillingClient;
  owner: CreditOwner;
  feature: string;
  model?: string;
  requestId?: string;
  ttlSeconds?: number;
  reserveMetadata?: Record<string, unknown>;
  /**
   * Optional preallocated UUID used as billing reservation/run id. By default
   * `withCredits` creates it and the audit run reuses `reservation.id`.
   */
  runId?: string;
  /**
   * Override the audit run id. Use this for multi-stage flows where several
   * `ai.agent_runs` rows share the same billing reservation id in metadata.
   */
  recordRunId?: string | ((ctx: { reservation: ReservationHandle }) => string);
  estimateCost?: () => Promise<CostEstimate> | CostEstimate;
  computeActualCost?: (result: TResult) => Promise<CostActual> | CostActual;
  call: (ctx: AiCallContext) => Promise<TResult>;
};

export type BillableAiCallResult<TResult> = {
  result: TResult;
  usage?: TokenUsage;
  ledgerEntryId: string;
  reservationId: string;
  estimatedAmount: number;
  actualAmount: number;
  balanceAfter: number;
};

/**
 * Audita uma chamada de IA sem mexer em billing. Útil para estágios internos
 * que compartilham uma única reserva de crédito, como pesquisa + parsing.
 */
export async function runRecordedAiCall<TResult>(
  input: RecordedAiCallInput<TResult>,
): Promise<{ result: TResult; usage?: TokenUsage }> {
  await input.recorder.start({
    runId: input.runId,
    app: input.app,
    agent: input.agent,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  try {
    const result =
      input.retry === false
        ? await input.call()
        : await withRetry(input.call, input.retry === undefined ? {} : input.retry);
    const usage = input.getUsage ? normalizeUsage(input.getUsage(result)) : undefined;
    await input.recorder.finish({
      runId: input.runId,
      status: "succeeded",
      ...(usage ? { usage } : {}),
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.getSuccessMetadata?.(result) ?? {}),
      },
    });
    return { result, ...(usage ? { usage } : {}) };
  } catch (err) {
    await input.recorder.finish({
      runId: input.runId,
      status: "failed",
      metadata: {
        ...(input.metadata ?? {}),
        error: err instanceof Error ? err.message : String(err),
        ...(input.getErrorMetadata?.(err) ?? {}),
      },
    });
    throw err;
  }
}

/**
 * Executa uma chamada paga de IA com reserva/commit de créditos, retry e
 * auditoria `ai.agent_runs` em um único contrato.
 */
export async function runBillableAiCall<TResult>(
  input: BillableAiCallInput<TResult>,
): Promise<BillableAiCallResult<TResult>> {
  let recordedUsage: TokenUsage | undefined;
  const out = await withCredits({
    billing: input.billing,
    owner: input.owner,
    app: input.app,
    feature: input.feature,
    model: input.model,
    runId: input.runId,
    requestId: input.requestId,
    ttlSeconds: input.ttlSeconds,
    reserveMetadata: {
      ...(input.reserveMetadata ?? {}),
      ...(input.metadata ?? {}),
    },
    estimateCost: input.estimateCost ?? oneCreditEstimate,
    computeActualCost: input.computeActualCost ?? oneCreditActual,
    call: async ({ reservation }) => {
      const runId = resolveRecordedRunId(input.recordRunId, reservation);
      const { result, usage } = await runRecordedAiCall({
        recorder: input.recorder,
        app: input.app,
        agent: input.agent,
        runId,
        retry: input.retry,
        call: () => input.call({ reservation, runId }),
        getUsage: input.getUsage,
        getSuccessMetadata: input.getSuccessMetadata,
        getErrorMetadata: input.getErrorMetadata,
        metadata: {
          feature: input.feature,
          ...(input.model ? { model: input.model } : {}),
          ...(runId === reservation.id ? {} : { reservationId: reservation.id }),
          ...(input.metadata ?? {}),
        },
      });
      recordedUsage = usage;
      return result;
    },
  });

  return {
    ...out,
    ...(recordedUsage ? { usage: recordedUsage } : {}),
  };
}

export const runBillableAgentCall = runBillableAiCall;
export const runBillableTextCall = runBillableAiCall;

function resolveRecordedRunId(
  recordRunId: BillableAiCallInput<unknown>["recordRunId"],
  reservation: ReservationHandle,
): string {
  if (typeof recordRunId === "function") return recordRunId({ reservation });
  return recordRunId ?? reservation.id;
}

function oneCreditEstimate(): CostEstimate {
  return { estimatedAmount: 1 };
}

function oneCreditActual(): CostActual {
  return { actualAmount: 1 };
}

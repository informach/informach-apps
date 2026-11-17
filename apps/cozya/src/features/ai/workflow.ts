import "server-only";
import { agentRunRecorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS, type CozyaFeature } from "@/ai/models";
import { type AiCostAcceptance, assertCostAcceptance } from "./costs";
import { currentAiOperation } from "./operation-context";
import { createCozyaAiOperations } from "./wallet-repository";

/** One durable output and one debit for all stages of the accepted task. */
export function runCozyaAiWorkflow<T>(input: {
  userId: string;
  feature: CozyaFeature;
  agent: string;
  quote: AiCostAcceptance;
  parseResult: (value: unknown) => T;
  call: (runId: string) => Promise<{
    value: T;
    actualCredits: number;
    usage?: unknown;
    metadata?: Record<string, unknown>;
  }>;
}) {
  const operation = currentAiOperation(input.userId);
  assertCostAcceptance(operation.acceptedCost, input.quote);
  return createCozyaAiOperations(operation.actor, operation.id).run({
    feature: input.feature,
    model: COZYA_MODELS[input.feature],
    agent: input.agent,
    recorder: agentRunRecorder,
    tariff: input.quote.version,
    maxCredits: input.quote.maxCredits,
    inputHash: operation.fingerprint,
    parseResult: input.parseResult,
    call: input.call,
  });
}

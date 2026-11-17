import { AsyncLocalStorage } from "node:async_hooks";
import type { AiCostAcceptance } from "./costs";
import type { CozyaAiActor } from "./wallet-repository";

// The HTTP operation and credit reservation use the same UUID for reconciliation.
export const aiOperationContext = new AsyncLocalStorage<{
  id: string;
  actor: CozyaAiActor;
  fingerprint: string;
  acceptedCost: AiCostAcceptance;
}>();
export function currentAiOperation(userId: string) {
  const operation = aiOperationContext.getStore();
  if (!operation || operation.actor.userId !== userId) throw new Error("AI_CONTEXT_REQUIRED");
  return operation;
}

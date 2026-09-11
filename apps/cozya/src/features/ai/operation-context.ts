import { AsyncLocalStorage } from "node:async_hooks";

// The HTTP operation and credit reservation use the same UUID for reconciliation.
export const aiOperationContext = new AsyncLocalStorage<string>();
export const currentAiOperationId = () => aiOperationContext.getStore();

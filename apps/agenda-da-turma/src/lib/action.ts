import { createActionFactory } from "@informach/auth/server-actions";
import { authResult } from "./auth";
import { logger } from "./logger";

const factory = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => {
    logger.info({ eventType, actorId }, "action.invoke");
  },
});

export const { action, ok, err } = factory;
export type { Result } from "@informach/auth/server-actions";

import { createActionFactory } from "@informach/auth/server-actions";
import { logger } from "./logger";
import { authResult } from "./auth";

const factory = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => {
    logger.info({ eventType, actorId }, "action.invoke");
  },
});

export const { action, ok, err } = factory;
export type { Result } from "@informach/auth/server-actions";

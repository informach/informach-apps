import { createActionFactory } from "@informach/auth/server-actions";
import { authResult } from "./auth";
import { logger } from "./logger";
import { captureActionException } from "./observability";

const factory = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => {
    logger.info({ eventType, actorId }, "action.invoke");
  },
  onError: ({ error, actorId }) => {
    captureActionException(error, { actorId });
  },
});

export const { action, ok, err } = factory;
export type { Result } from "@informach/auth/server-actions";

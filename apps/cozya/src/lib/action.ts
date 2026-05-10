import { redisRateLimitStorage } from "@informach/auth/redis-rate-limit-storage";
import { createActionFactory } from "@informach/auth/server-actions";
import { authResult } from "./auth";
import { logger } from "./logger";
import { captureActionException } from "./observability";
import { redis } from "./redis";

const factory = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => {
    logger.info({ eventType, actorId }, "action.invoke");
  },
  onError: ({ error, actorId }) => {
    captureActionException(error, { actorId });
  },
  rateLimitStorage: redis
    ? redisRateLimitStorage({ client: redis, keyPrefix: "cozya:rl:" })
    : undefined,
});

export const { action, ok, err } = factory;
export type { Result } from "@informach/auth/server-actions";

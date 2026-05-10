import { redisRateLimitStorage } from "@informach/auth/redis-rate-limit-storage";
import { createActionFactory } from "@informach/auth/server-actions";
import { authResult } from "./auth";
import { logger } from "./logger";
import { redis } from "./redis";

const factory = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => {
    logger.info({ eventType, actorId }, "action.invoke");
  },
  rateLimitStorage: redis
    ? redisRateLimitStorage({ client: redis, keyPrefix: "agenda-da-turma:rl:" })
    : undefined,
});

export const { action, ok, err } = factory;
export type { Result } from "@informach/auth/server-actions";

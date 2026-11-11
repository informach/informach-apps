import "server-only";
import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

// Construct lazily: builds have no private network. Commands queue during the
// initial connection, but time out if Redis is unavailable at runtime.
const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      commandTimeout: 5000,
    })
  : undefined;
redis?.on("error", () => logger.error("redis.connection_failed"));

export { redis };

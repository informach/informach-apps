import { redisStorage } from "@better-auth/redis-storage";
import type { SecondaryStorage } from "@informach/auth";
import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

type GlobalWithRedis = typeof globalThis & {
  __cozyaRedis?: IORedis | null;
};

function createRedis(): IORedis | null {
  if (!env.REDIS_URL) return null;
  // Railway's build workers cannot resolve the private Redis hostname. Keep
  // connection lazy so builds do not open a socket; the default offline queue
  // safely holds the first runtime command while the connection is established.
  const client = new IORedis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 3000,
    commandTimeout: 5000,
  });
  client.on("error", (err) => {
    logger.warn({ err }, "redis.connection_error");
  });
  return client;
}

const g = globalThis as GlobalWithRedis;
g.__cozyaRedis ??= createRedis();
export const redis = g.__cozyaRedis;

export const authSecondaryStorage: SecondaryStorage | undefined = redis
  ? redisStorage({ client: redis, keyPrefix: "cozya:auth:" })
  : undefined;

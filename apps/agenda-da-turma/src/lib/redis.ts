import { redisStorage } from "@better-auth/redis-storage";
import type { SecondaryStorage } from "@informach/auth";
import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

type GlobalWithRedis = typeof globalThis & {
  __agendaRedis?: IORedis | null;
};

function createRedis(): IORedis | null {
  if (!env.REDIS_URL) return null;
  // `lazyConnect: true` combined with `enableOfflineQueue: false` is a trap:
  // the first command triggers an async connect, but the offline queue is
  // disabled, so the command is rejected before the socket is ready
  // ("Stream isn't writeable"). Defaults connect eagerly and queue commands
  // during the brief handshake; `maxRetriesPerRequest` still bounds the wait
  // when Redis is genuinely down.
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
  });
  client.on("error", (err) => {
    logger.warn({ err }, "redis.connection_error");
  });
  return client;
}

const g = globalThis as GlobalWithRedis;
g.__agendaRedis ??= createRedis();
export const redis = g.__agendaRedis;

export const authSecondaryStorage: SecondaryStorage | undefined = redis
  ? redisStorage({ client: redis, keyPrefix: "agenda-da-turma:auth:" })
  : undefined;

import { redisStorage } from "@better-auth/redis-storage";
import type { SecondaryStorage } from "@informach/auth";
import IORedis from "ioredis";
import { env } from "./env";

export const redis = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
  : null;

export const authSecondaryStorage: SecondaryStorage | undefined = redis
  ? redisStorage({ client: redis, keyPrefix: "agenda-da-turma:auth:" })
  : undefined;

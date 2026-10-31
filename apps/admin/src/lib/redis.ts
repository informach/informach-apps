import "server-only";
import { redisStorage } from "@better-auth/redis-storage";
import type { SessionStore } from "@informach/auth/sessions";
import IORedis from "ioredis";
import { getEnv } from "./env";
import { logger } from "./logger";

type GlobalWithRedis = typeof globalThis & { __bastidoresRedis?: IORedis | null };

function createRedis(): IORedis | null {
  const url = getEnv().REDIS_URL;
  if (!url) return null;
  // Igual aos apps: conexão preguiçosa, porque o build não enxerga a rede privada.
  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    commandTimeout: 5000,
  });
  client.on("error", (err) => logger.warn({ err }, "redis.connection_error"));
  return client;
}

function redis(): IORedis | null {
  const g = globalThis as GlobalWithRedis;
  if (g.__bastidoresRedis === undefined) g.__bastidoresRedis = createRedis();
  return g.__bastidoresRedis;
}

/**
 * Apps que guardam as sessões no Redis, com o prefixo que cada um passa ao
 * `redisStorage`. Edi e o próprio Bastidores guardam no Postgres (`core.sessions`).
 * `cookieCacheMinutes` é quanto tempo a sessão ainda vale no navegador depois de
 * apagada, por causa do cache em cookie do Better Auth.
 */
export const REDIS_SESSION_APPS = [
  { app: "cozya", name: "Cozya", keyPrefix: "cozya:auth:", cookieCacheMinutes: 5 },
  {
    app: "agenda-da-turma",
    name: "Agenda da Turma",
    keyPrefix: "agenda-da-turma:auth:",
    cookieCacheMinutes: 5,
  },
  {
    app: "missao-saber",
    name: "Missão Saber",
    keyPrefix: "missao-saber:auth:",
    cookieCacheMinutes: 0,
  },
  {
    app: "bora-treinar",
    name: "Bora Treinar",
    keyPrefix: "bora-treinar:auth:",
    cookieCacheMinutes: 0,
  },
] as const;

export type RedisSessionApp = (typeof REDIS_SESSION_APPS)[number]["app"];

/** Armazenamento de sessões de um app, ou `null` quando não há Redis configurado. */
export function sessionStore(app: RedisSessionApp): SessionStore | null {
  const client = redis();
  if (!client) return null;
  const entry = REDIS_SESSION_APPS.find((item) => item.app === app);
  if (!entry) return null;
  return redisStorage({ client, keyPrefix: entry.keyPrefix });
}

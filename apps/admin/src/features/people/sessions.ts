import "server-only";
import {
  type CachedSession,
  listCachedSessions,
  revokeCachedSessions,
} from "@informach/auth/sessions";
import { reportOperationalError } from "@/lib/observability";
import { REDIS_SESSION_APPS, type RedisSessionApp, sessionStore } from "@/lib/redis";
import { deleteDatabaseSessions } from "./repository";

export type AppSessions = {
  app: RedisSessionApp;
  name: string;
  /** null quando o Redis não está configurado ou não respondeu. */
  sessions: CachedSession[] | null;
};

/** Sessões de Cozya, Agenda e Missão, que vivem no Redis de cada app. */
export async function cachedSessionsByApp(userId: string): Promise<AppSessions[]> {
  return Promise.all(
    REDIS_SESSION_APPS.map(async ({ app, name }) => {
      const store = sessionStore(app);
      if (!store) return { app, name, sessions: null };
      try {
        return { app, name, sessions: await listCachedSessions(store, userId) };
      } catch (error) {
        reportOperationalError("redis.unavailable", error, { service: app });
        return { app, name, sessions: null };
      }
    }),
  );
}

export type RevokeResult = {
  databaseCount: number;
  perApp: Array<{
    app: RedisSessionApp;
    name: string;
    count: number | null;
    cookieCacheMinutes: number;
  }>;
};

/**
 * Encerra a conta em todos os produtos: apaga `core.sessions` (Suíte Edi e
 * Bastidores) e as sessões do Redis de cada app. O computador da Suíte Edi
 * segue com a própria licença, que não é sessão.
 */
export async function revokeEverywhere(userId: string): Promise<RevokeResult> {
  const [databaseCount, perApp] = await Promise.all([
    deleteDatabaseSessions(userId),
    Promise.all(
      REDIS_SESSION_APPS.map(async ({ app, name, cookieCacheMinutes }) => {
        const store = sessionStore(app);
        if (!store) return { app, name, count: null, cookieCacheMinutes };
        try {
          return {
            app,
            name,
            count: await revokeCachedSessions(store, userId),
            cookieCacheMinutes,
          };
        } catch (error) {
          reportOperationalError("redis.unavailable", error, { service: app });
          return { app, name, count: null, cookieCacheMinutes };
        }
      }),
    ),
  ]);
  return { databaseCount, perApp };
}

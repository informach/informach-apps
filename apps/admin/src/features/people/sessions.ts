import "server-only";
import {
  type CachedSession,
  listCachedSessions,
  revokeCachedSessions,
  revokeTrustedDevices,
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

/** Sessões de Cozya, Agenda, Missão e Bora Treinar, que vivem no Redis de cada app. */
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
  /** Sessões do Postgres que estavam valendo; null quando o banco falhou. */
  databaseCount: number | null;
  /** Aparelhos confiados das duas etapas apagados (o cookie que dispensaria o código); null quando falhou. */
  trustedDevices: number | null;
  perApp: Array<{
    app: RedisSessionApp;
    name: string;
    /** Sessões que estavam valendo; null quando o Redis não está configurado ou não respondeu. */
    count: number | null;
    cookieCacheMinutes: number;
  }>;
};

/** Uma parte do encerramento que falhou vira `null`, para a tela dizer o que faltou. */
async function partOrNull(work: () => Promise<number>, service: string): Promise<number | null> {
  try {
    return await work();
  } catch (error) {
    reportOperationalError("sessions.revoke_failed", error, { service });
    return null;
  }
}

/**
 * Encerra a conta em todos os produtos: apaga `core.sessions` (Suíte Edi e
 * Bastidores), as sessões do Redis de cada app e os aparelhos confiados das
 * duas etapas, que deixariam a senha bastar na próxima entrada. O computador da
 * Suíte Edi segue com a própria licença, que não é sessão, e os aparelhos de
 * estudo da Missão Saber também (só o banimento os bloqueia).
 *
 * Nunca lança: cada parte que falha volta como `null`. Quem chama pode já ter
 * mudado algo (o banimento faz commit antes), e uma exceção aqui viraria "nada
 * foi alterado" na tela.
 */
export async function revokeEverywhere(userId: string): Promise<RevokeResult> {
  const [databaseCount, trustedDevices, perApp] = await Promise.all([
    partOrNull(() => deleteDatabaseSessions(userId), "postgres"),
    partOrNull(() => revokeTrustedDevices(userId), "trusted-devices"),
    Promise.all(
      REDIS_SESSION_APPS.map(async ({ app, name, cookieCacheMinutes }) => {
        try {
          const store = sessionStore(app);
          if (!store) return { app, name, count: null, cookieCacheMinutes };
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
  return { databaseCount, trustedDevices, perApp };
}

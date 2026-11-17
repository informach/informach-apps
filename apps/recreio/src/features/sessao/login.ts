import "server-only";
import { type AuthSessionReader, isAuthSessionLive } from "@informach/auth/sessions";
import { authSecondaryStorage } from "@/lib/redis";

/**
 * A sessão de login (Better Auth) de uma sessão de aparelho continua de pé?
 * Consulta sem cookie, pelo id guardado em `device_sessions.auth_session_id`:
 * no Redis do app quando ele existe (é lá que as sessões moram em produção),
 * senão em `core.sessions`.
 */
export function sessaoDeLoginViva(
  entrada: {
    authSessionId: string;
    contaId: string;
  },
  reader: AuthSessionReader,
): Promise<boolean> {
  return isAuthSessionLive({
    sessionId: entrada.authSessionId,
    userId: entrada.contaId,
    store: authSecondaryStorage,
    reader,
  });
}

/** Caminho externo explícito; dentro de transação, usar `sessaoDeLoginViva` com seu reader. */
export function sessaoDeLoginVivaForaDeTransacao(entrada: {
  authSessionId: string;
  contaId: string;
}): Promise<boolean> {
  return isAuthSessionLive({
    sessionId: entrada.authSessionId,
    userId: entrada.contaId,
    store: authSecondaryStorage,
  });
}

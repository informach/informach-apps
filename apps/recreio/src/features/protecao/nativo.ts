import "server-only";
import { cache } from "react";
import { referenciaNativaDoLogin } from "@/features/sessao/service";
import { getSession } from "@/lib/auth";
import { temContextoPareado } from "./http";

/** Mesmo cookie nativo pode estar restrito. Somente PIN/saída usam esta referência. */
export const identidadeNativaDoAparelho = cache(async () => {
  if (await temContextoPareado()) return null;
  const login = await getSession();
  if (!login?.user.emailVerified) return null;
  return referenciaNativaDoLogin({
    authSessionId: login.session.id,
    contaId: login.user.id,
    expiraEm: new Date(login.session.expiresAt),
  });
});

import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { atorAtual } from "@/features/sessao/ator";
import { getSession } from "@/lib/auth";
import { assertAllowed } from "@/lib/errors";

/** Sem campos de identidade no formulário; não exige perfil de jogador. */
export async function autorDaFamilia(): Promise<AutorNativoRecente> {
  const atual = await getSession();
  const ator = await atorAtual();
  assertAllowed(
    atual?.user.emailVerified && ator && atual.user.id === ator.contaId,
    "AUTH",
    "Entre novamente para continuar.",
  );
  return {
    contaId: ator.contaId,
    sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
    login: {
      authSessionId: atual.session.id,
      criadoEm: new Date(atual.session.createdAt),
      expiraEm: new Date(atual.session.expiresAt),
    },
  };
}

import "server-only";
import { perfilAtivo } from "@/features/sessao/ator";
import { getSession } from "@/lib/auth";
import { assertAllowed } from "@/lib/errors";
import type { AutorDaResponsabilidade } from "./responsabilidade-repository";

/** Sem parâmetros: login, conta e perfil vêm exclusivamente do pedido autenticado. */
export async function autorDaResponsabilidade(): Promise<AutorDaResponsabilidade> {
  const atual = await getSession();
  const ator = await perfilAtivo();
  assertAllowed(
    atual?.user.emailVerified && atual.user.id === ator.contaId,
    "AUTH",
    "Entre novamente para continuar.",
  );
  return {
    contaId: ator.contaId,
    perfilId: ator.perfil.id,
    sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
    login: {
      authSessionId: atual.session.id,
      criadoEm: new Date(atual.session.createdAt),
      expiraEm: new Date(atual.session.expiresAt),
    },
  };
}

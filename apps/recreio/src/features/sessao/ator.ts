import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession, requirePageUser } from "@/lib/auth";
import { type Ator, type AtorComPerfil, type ContextoDoAtor, resolverAtor } from "./service";

export type { Ator, AtorComPerfil } from "./service";

/**
 * A sessão de login vira ator uma vez por pedido. Conta sem e-mail confirmado
 * ainda não é ator. Nada aqui lê cookie próprio nem campo do pedido: o perfil
 * ativo vem da linha da sessão de aparelho.
 */
const contexto = cache(async (): Promise<ContextoDoAtor | null> => {
  const atual = await getSession();
  if (!atual?.user.emailVerified) return null;
  return resolverAtor({
    authSessionId: atual.session.id,
    contaId: atual.user.id,
    expiraEm: new Date(atual.session.expiresAt),
  });
});

/** Quem está pedindo, ou `null` sem conta confirmada ou com a sessão de aparelho encerrada. */
export const atorAtual = cache(async (): Promise<Ator | null> => (await contexto())?.ator ?? null);

/**
 * Para ações e rotas que só valem com alguém jogando. Lança `NAO_AUTENTICADO`
 * ou `SEM_PERFIL` (`ErroDoRecreio`); quem chama traduz para a resposta.
 */
export async function perfilAtivo(): Promise<AtorComPerfil> {
  const ator = await atorAtual();
  if (!ator) throw new ErroDoRecreio("NAO_AUTENTICADO");
  if (!ator.perfil) throw new ErroDoRecreio("SEM_PERFIL");
  return { ...ator, perfil: ator.perfil };
}

/**
 * Página que exige a conta, com ou sem perfil escolhido (`/comecar`,
 * `/perfis`). Sessão de aparelho encerrada com o login ainda de pé (a saída
 * parou no meio) manda entrar de novo.
 */
export async function paginaDaConta(next?: string) {
  const user = await requirePageUser(next);
  const atual = await contexto();
  if (!atual) redirect("/entrar?encerrada=1");
  return { user, ...atual };
}

/** Página do portal: exige alguém jogando. Sem perfil vai criar; sem escolha vai escolher. */
export async function paginaDoPortal() {
  const pagina = await paginaDaConta();
  const perfil = pagina.ator.perfil;
  if (!perfil) redirect(pagina.perfis.length > 0 ? "/perfis" : "/comecar");
  return { ...pagina, ator: { ...pagina.ator, perfil } };
}

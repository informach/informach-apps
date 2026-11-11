import "server-only";
import { type ContaId, ContaIdSchema, type SessaoDeAparelhoId } from "@informach/recreio";
import { type PerfilDoRecreio, perfisSelecionaveis } from "@/features/perfis/service";
import {
  carregarOuCriarSessaoDaConta,
  limparPerfilAtivo,
  revogarSessaoDaConta,
} from "./repository";

/**
 * Quem está pedindo. A conta e a sessão de aparelho saem da sessão de login; o
 * perfil ativo sai da linha da sessão de aparelho, no servidor. Nenhum campo
 * enviado pelo navegador escolhe o perfil.
 */
export type Ator = {
  contaId: ContaId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  perfil: PerfilDoRecreio | null;
};

export type AtorComPerfil = Ator & { perfil: PerfilDoRecreio };

export type ContextoDoAtor = {
  ator: Ator;
  /** Os perfis que a conta pode escolher, na ordem em que aparecem em "Quem vai jogar?". */
  perfis: PerfilDoRecreio[];
};

/**
 * Monta o ator a partir de uma sessão de login já conferida. Carrega ou cria a
 * sessão de aparelho e confere de novo, a cada pedido, que o perfil ativo
 * ainda está na lista que o servidor monta para a conta: se saiu dela, a
 * sessão fica sem perfil e a pessoa escolhe de novo.
 *
 * Devolve `null` quando a sessão de aparelho foi encerrada: a pessoa precisa
 * entrar de novo.
 */
export async function resolverAtor(entrada: {
  authSessionId: string;
  contaId: string;
  expiraEm: Date;
  agora?: Date;
}): Promise<ContextoDoAtor | null> {
  const contaId = ContaIdSchema.parse(entrada.contaId);
  const sessao = await carregarOuCriarSessaoDaConta({
    authSessionId: entrada.authSessionId,
    contaId,
    expiraEm: entrada.expiraEm,
    agora: entrada.agora ?? new Date(),
  });
  if (!sessao || sessao.revogadaEm !== null) return null;
  const perfis = await perfisSelecionaveis(contaId);
  const perfil = perfis.find((item) => item.id === sessao.perfilAtivoId) ?? null;
  if (sessao.perfilAtivoId !== null && perfil === null) await limparPerfilAtivo(sessao.id);
  return { ator: { contaId, sessaoDeAparelhoId: sessao.id, perfil }, perfis };
}

/** Sair da conta encerra a sessão de aparelho; ela não volta a valer. */
export async function encerrarSessaoDeAparelho(entrada: {
  authSessionId: string;
  contaId: string;
  agora?: Date;
}): Promise<SessaoDeAparelhoId | null> {
  return revogarSessaoDaConta({
    authSessionId: entrada.authSessionId,
    contaId: ContaIdSchema.parse(entrada.contaId),
    agora: entrada.agora ?? new Date(),
  });
}

import "server-only";
import {
  type ContaId,
  ContaIdSchema,
  type PerfilId,
  type SessaoDeAparelhoId,
} from "@informach/recreio";
import { type PerfilDoRecreio, perfisSelecionaveis } from "@/features/perfis/service";
import { sessaoDeLoginViva } from "./login";
import {
  carregarOuCriarSessaoDaConta,
  lerSessaoDeAparelho,
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

export type VidaDaSessaoDeAparelho =
  | { viva: true; contaId: ContaId; perfil: PerfilDoRecreio }
  | { viva: false; motivo: "signed_out" | "expired" };

/**
 * A sessão de aparelho ainda sustenta este perfil jogando? É a conferência de
 * `resolverAtor` para quem não tem o cookie: a troca do ingresso e a renovação
 * da sessão de jogo chegam só com um token.
 *
 * Vale se a linha existe, não foi revogada, está no prazo, continua com este
 * perfil ativo, o perfil ainda está na lista que o servidor monta para a
 * conta, e a sessão de login por trás dela continua de pé. Sair por outro
 * caminho (expiração do login, encerramento pelo Bastidores) não marca
 * `revoked_at`; é a consulta à sessão de login que pega esses casos.
 */
export async function conferirSessaoDeAparelho(entrada: {
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  perfilId: PerfilId;
  agora?: Date;
}): Promise<VidaDaSessaoDeAparelho> {
  const agora = entrada.agora ?? new Date();
  const sessao = await lerSessaoDeAparelho(entrada.sessaoDeAparelhoId);
  if (!sessao || sessao.revogadaEm !== null || sessao.contaId === null)
    return { viva: false, motivo: "signed_out" };
  if (sessao.expiraEm.getTime() <= agora.getTime()) return { viva: false, motivo: "expired" };
  if (sessao.perfilAtivoId !== entrada.perfilId) return { viva: false, motivo: "signed_out" };
  const perfil = (await perfisSelecionaveis(sessao.contaId)).find(
    (item) => item.id === entrada.perfilId,
  );
  if (!perfil) return { viva: false, motivo: "signed_out" };
  if (
    sessao.authSessionId !== null &&
    !(await sessaoDeLoginViva({ authSessionId: sessao.authSessionId, contaId: sessao.contaId }))
  )
    return { viva: false, motivo: "signed_out" };
  return { viva: true, contaId: sessao.contaId, perfil };
}

/**
 * Sair da conta encerra a sessão de aparelho, que não volta a valer, e junto
 * as sessões de jogo abertas por ela.
 */
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

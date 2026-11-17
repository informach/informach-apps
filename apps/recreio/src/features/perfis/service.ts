import "server-only";
import {
  type ContaId,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
} from "@informach/recreio";
import type { IdentidadeNativa } from "@/features/account/autoridade-repository";
import { definirPerfilAtivo } from "@/features/sessao/repository";
import { AppError } from "@/lib/errors";
import { EdicaoDoPerfilSchema, NovoPerfilSchema } from "./regras";
import {
  criarPerfilDaConta,
  editarPerfilDaConta,
  type PerfilDoRecreio,
  perfisDaConta,
} from "./repository";

export type { PerfilDoRecreio } from "./repository";

/**
 * Os perfis que esta conta pode escolher em "Quem vai jogar?". Nesta etapa é
 * só o perfil dela mesma; os perfis sem login do grupo entram depois, aqui.
 * Quem decide a lista é sempre o servidor.
 */
export function perfisSelecionaveis(contaId: ContaId): Promise<PerfilDoRecreio[]> {
  return perfisDaConta(contaId);
}

/** Cria o perfil da própria conta. Uma conta tem um só; repetir devolve o que já existe. */
export async function criarPerfilProprio(
  ator: IdentidadeNativa,
  entrada: unknown,
): Promise<{ perfil: PerfilDoRecreio; criado: boolean }> {
  return criarPerfilDaConta(ator, NovoPerfilSchema.parse(entrada));
}

export async function editarPerfilProprio(
  ator: { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId },
  entrada: unknown,
): Promise<PerfilDoRecreio> {
  return editarPerfilDaConta(ator, EdicaoDoPerfilSchema.parse(entrada));
}

/**
 * Escolhe quem vai jogar neste aparelho. O id pedido só vale se estiver na
 * lista que o servidor montou para a conta. Perfil de outra conta e perfil que
 * não existe dão a mesma recusa, para a resposta não revelar qual dos dois é.
 */
export async function selecionarPerfil(
  ator: { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId },
  perfilId: unknown,
): Promise<PerfilDoRecreio> {
  const pedido: PerfilId = PerfilIdSchema.parse(perfilId);
  const perfil = (await perfisSelecionaveis(ator.contaId)).find((item) => item.id === pedido);
  const gravou =
    perfil !== undefined &&
    (await definirPerfilAtivo({
      sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
      contaId: ator.contaId,
      perfilId: perfil.id,
    }));
  if (!perfil || !gravou) throw new AppError("PERFIL", "Perfil não encontrado.");
  return perfil;
}

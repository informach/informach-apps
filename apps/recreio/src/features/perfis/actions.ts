"use server";
import { ErroDoRecreio } from "@informach/recreio";
import { atorAtual } from "@/features/sessao/ator";
import { runAction, verifiedUser } from "@/lib/action";
import { criarPerfilProprio, editarPerfilProprio, selecionarPerfil } from "./service";

// As duas ações devolvem o destino, e a tela vai até ele carregando a página
// inteira: o portal é montado de novo com o perfil escolhido, sem cache do
// roteador para invalidar.

/** A conta e a sessão de aparelho de quem chama. O perfil nunca vem do navegador. */
async function contaAtual() {
  await verifiedUser();
  const ator = await atorAtual();
  if (!ator) throw new ErroDoRecreio("NAO_AUTENTICADO");
  return ator;
}

/**
 * Primeiro uso: cria o perfil da própria conta e já o escolhe neste aparelho.
 * Pedir de novo não cria um segundo perfil; a pessoa segue com o que já tem.
 */
export async function criarPerfilAction(entrada: unknown) {
  return runAction(async () => {
    const ator = await contaAtual();
    const { perfil } = await criarPerfilProprio(ator.contaId, entrada);
    await selecionarPerfil(ator, perfil.id);
    return { destination: "/estante" };
  });
}

/** "Quem vai jogar?": o id pedido só vale se estiver na lista que o servidor monta. */
export async function selecionarPerfilAction(perfilId: unknown) {
  return runAction(async () => {
    const ator = await contaAtual();
    await selecionarPerfil(ator, perfilId);
    return { destination: "/estante" };
  });
}

/** Só apelido/avatar; o repository revalida a sessão e deriva o perfil da conta. */
export async function editarPerfilAction(entrada: unknown) {
  return runAction(async () => {
    const ator = await contaAtual();
    await editarPerfilProprio(ator, entrada);
    return { destination: "/conta" };
  });
}

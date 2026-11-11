"use server";
import { ErroDoRecreio } from "@informach/recreio";
import { atorAtual } from "@/features/sessao/ator";
import { runAction, verifiedUser } from "@/lib/action";
import { audit } from "@/lib/observability";
import { criarPerfilProprio, selecionarPerfil } from "./service";

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
    const { perfil, criado } = await criarPerfilProprio(ator.contaId, entrada);
    if (criado)
      audit({
        eventType: "recreio.profile_created",
        actorId: ator.contaId,
        payload: { profileId: perfil.id, kind: perfil.tipo },
      });
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

"use server";
import { perfilAtivo } from "@/features/sessao/ator";
import { runAction, verifiedUser } from "@/lib/action";
import { sairDoMundo } from "./saida";
import { aceitarConvite, criarConvite, criarMundo } from "./service";

// As ações do portal chamam os mesmos serviços das rotas do SDK. O perfil é
// sempre o ativo da sessão de aparelho; nenhum id de perfil vem da tela.

/** O perfil ativo de quem chama, com a conta confirmada. */
async function quemPede() {
  await verifiedUser();
  const ator = await perfilAtivo();
  return { perfilId: ator.perfil.id, sessaoDeAparelhoId: ator.sessaoDeAparelhoId };
}

/** "Criar mundo": cria o mundo do jogo e leva a pessoa até ele. */
export async function criarMundoAction(entrada: { jogo: unknown; nome: unknown }) {
  return runAction(async () => {
    const autor = await quemPede();
    const mundo = await criarMundo(
      { ...autor, jogo: typeof entrada.jogo === "string" ? entrada.jogo : "" },
      { nome: entrada.nome },
    );
    return { destination: `/mundos/${mundo.id}` };
  });
}

/** Gera um convite de membro. O código volta uma vez, para a tela de quem convidou. */
export async function criarConviteAction(mundoId: unknown) {
  return runAction(async () => {
    const autor = await quemPede();
    return criarConvite({ ...autor, jogo: null }, mundoId, { forma: "member" });
  });
}

/** "Entrar com código": aceita o convite para o perfil ativo e leva ao mundo. */
export async function aceitarConviteAction(codigo: unknown) {
  return runAction(async () => {
    const autor = await quemPede();
    const aceito = await aceitarConvite(autor, { codigo });
    return { destination: `/mundos/${aceito.mundoId}` };
  });
}

/** A autoridade inteira vem da sessão; não recebe outro perfil ou conta da tela. */
export async function sairDoMundoAction(mundoId: unknown) {
  return runAction(async () => {
    await verifiedUser();
    const ator = await perfilAtivo();
    await sairDoMundo(
      {
        contaId: ator.contaId,
        perfilId: ator.perfil.id,
        sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
      },
      mundoId,
    );
    return { destination: "/estante" };
  });
}

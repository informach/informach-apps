"use server";
import { perfilAtivo } from "@/features/sessao/ator";
import { runAction, verifiedUser } from "@/lib/action";
import { aceitarConvite, criarConvite, criarMundo } from "./service";

// As ações do portal chamam os mesmos serviços das rotas do SDK. O perfil é
// sempre o ativo da sessão de aparelho; nenhum id de perfil vem da tela.

/** O perfil ativo de quem chama, com a conta confirmada. */
async function quemPede() {
  await verifiedUser();
  return (await perfilAtivo()).perfil.id;
}

/** "Criar mundo": cria o mundo do jogo e leva a pessoa até ele. */
export async function criarMundoAction(entrada: { jogo: unknown; nome: unknown }) {
  return runAction(async () => {
    const perfilId = await quemPede();
    const mundo = await criarMundo(
      { perfilId, jogo: typeof entrada.jogo === "string" ? entrada.jogo : "" },
      { nome: entrada.nome },
    );
    return { destination: `/mundos/${mundo.id}` };
  });
}

/** Gera um convite de membro. O código volta uma vez, para a tela de quem convidou. */
export async function criarConviteAction(mundoId: unknown) {
  return runAction(async () => {
    const perfilId = await quemPede();
    return criarConvite({ perfilId, jogo: null }, mundoId, { forma: "member" });
  });
}

/** "Entrar com código": aceita o convite para o perfil ativo e leva ao mundo. */
export async function aceitarConviteAction(codigo: unknown) {
  return runAction(async () => {
    const perfilId = await quemPede();
    const aceito = await aceitarConvite({ perfilId }, { codigo });
    return { destination: `/mundos/${aceito.mundoId}` };
  });
}

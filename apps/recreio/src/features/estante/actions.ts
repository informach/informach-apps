"use server";
import { jogadorDoAparelho } from "@/features/autoridade-de-jogo/http";
import { criarMundo } from "@/features/mundos/service";
import { runAction } from "@/lib/action";

/** A credencial do aparelho escolhe o perfil. Não empresta a conta do responsável. */
export async function criarMundoProtegidoAction(entrada: { jogo: unknown; nome: unknown }) {
  return runAction(async () => {
    const jogador = await jogadorDoAparelho();
    const mundo = await criarMundo(
      {
        perfilId: jogador.perfil.id,
        sessaoDeAparelhoId: jogador.sessaoDeAparelhoId,
        jogo: typeof entrada.jogo === "string" ? entrada.jogo : "",
      },
      { nome: entrada.nome },
    );
    return { destination: `/aparelho?mundoCriado=${mundo.id}` };
  });
}

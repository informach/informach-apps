import "server-only";
import type { MutacaoDeVisitaSchema } from "@informach/recreio/contrato";
import type { z } from "zod";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { caixaDeVisitas, consultarReciboDeVisita } from "./consulta-repository";
import { conferirConviteDeVisita } from "./detalhe-repository";
import { traduzirRecusaDeVisita } from "./http";
import { presencaDoJogadorParaConvite } from "./presenca-do-jogador-repository";
import { emitirConviteDeVisita, responderConviteDeVisita } from "./service";

export function consultarCaixaDeVisitasPeloSdk(autor: SessaoDeJogoAtiva, entrada: unknown) {
  return caixaDeVisitas(autor, entrada).catch(traduzirRecusaDeVisita);
}
export async function executarVisitaPeloSdk(
  autor: SessaoDeJogoAtiva,
  pedido: z.infer<typeof MutacaoDeVisitaSchema>,
) {
  const { operacao: _operacao, ...dados } = pedido;
  try {
    switch (pedido.operacao) {
      case "presenca":
        return await presencaDoJogadorParaConvite(autor, pedido.mundoId);
      case "emitir":
        return await emitirConviteDeVisita(autor, dados);
      case "responder":
        return await responderConviteDeVisita(autor, dados);
      case "consultar":
        return await consultarReciboDeVisita(autor, pedido.conviteId);
      case "conferir":
        return await conferirConviteDeVisita(autor, pedido.conviteId);
    }
  } catch (erro) {
    return traduzirRecusaDeVisita(erro);
  }
}

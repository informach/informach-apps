import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import type { MutacaoDeConviteDirigidoSchema } from "@informach/recreio/contrato";
import type { z } from "zod";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { traduzirRecusaSocial } from "@/features/social/http";
import { AppError } from "@/lib/errors";
import {
  caixaDeConvitesDirigidos,
  conferirConviteDirigido,
  consultarConviteDirigido,
} from "./convites-dirigidos-consulta-repository";
import { emitirConviteDirigido, responderConviteDirigido } from "./convites-dirigidos-service";

export function traduzirRecusaDeConvite(erro: unknown): never {
  if (erro instanceof AppError && erro.code === "MUNDO") throw new ErroDoRecreio("NAO_ENCONTRADO");
  return traduzirRecusaSocial(erro);
}
export function consultarCaixaPeloSdk(autor: SessaoDeJogoAtiva, entrada: unknown) {
  return caixaDeConvitesDirigidos(autor, entrada).catch(traduzirRecusaDeConvite);
}
export async function executarConvitePeloSdk(
  autor: SessaoDeJogoAtiva,
  pedido: z.infer<typeof MutacaoDeConviteDirigidoSchema>,
) {
  try {
    switch (pedido.operacao) {
      case "emitir":
        return await emitirConviteDirigido(autor, {
          mundoId: pedido.mundoId,
          perfilId: pedido.perfilId,
          pedidoId: pedido.pedidoId,
          participacao: pedido.participacao,
        });
      case "responder":
        return await responderConviteDirigido(autor, {
          conviteId: pedido.conviteId,
          acao: pedido.acao,
        });
      case "consultar":
        return await consultarConviteDirigido(autor, pedido.conviteId);
      case "conferir":
        return await conferirConviteDirigido(autor, pedido.conviteId);
    }
  } catch (erro) {
    return traduzirRecusaDeConvite(erro);
  }
}

import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import type { MutacaoSocialSchema } from "@informach/recreio/contrato";
import type { z } from "zod";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  aceitarAmizade,
  alterarPresencaSocial,
  consultarSocial,
  emitirCodigoDeAmigo,
  encerrarPedidoDeAmizade,
  pedirAmizade,
  protegerContato,
  removerAmizade,
} from "./service";

export function exigirSocialDisponivel() {
  if (env.RECREIO_SOCIAL_MODE !== "on") throw new ErroDoRecreio("INDISPONIVEL");
}

export async function executarMutacaoSocial(
  sessao: SessaoDeJogoAtiva,
  pedido: z.infer<typeof MutacaoSocialSchema>,
) {
  try {
    if (["codigo", "pedir", "aceitar"].includes(pedido.operacao)) exigirSocialDisponivel();
    switch (pedido.operacao) {
      case "presenca":
        return await alterarPresencaSocial(sessao, pedido.presenca);
      case "codigo":
        return await emitirCodigoDeAmigo(sessao);
      case "pedir":
        return await pedirAmizade(sessao, { codigo: pedido.codigo, pedidoId: pedido.pedidoId });
      case "aceitar":
        return await aceitarAmizade(sessao, pedido.pedidoId);
      case "encerrar":
        return await encerrarPedidoDeAmizade(sessao, {
          pedidoId: pedido.pedidoId,
          acao: pedido.acao,
        });
      case "proteger":
        return await protegerContato(sessao, {
          perfilId: pedido.perfilId,
          bloqueado: pedido.bloqueado,
          silenciado: pedido.silenciado,
        });
      case "remover":
        return await removerAmizade(sessao, pedido.perfilId);
    }
  } catch (erro) {
    return traduzirRecusaSocial(erro);
  }
}

export async function consultarSocialPeloSdk(sessao: SessaoDeJogoAtiva, entrada: unknown) {
  try {
    return await consultarSocial(sessao, entrada);
  } catch (erro) {
    return traduzirRecusaSocial(erro);
  }
}

function traduzirRecusaSocial(erro: unknown): never {
  if (erro instanceof AppError) {
    if (["CONTATO", "PEDIDO", "CONTATO_EXISTENTE"].includes(erro.code))
      throw new ErroDoRecreio("NAO_ENCONTRADO");
    if (["CONFLITO", "PEDIDO_PENDENTE"].includes(erro.code))
      throw new ErroDoRecreio("REVISAO_DIVERGENTE");
    if (erro.code === "AUTH") throw new ErroDoRecreio("SESSAO_INVALIDA");
    if (erro.code === "LIMITE_DE_CONTATOS") throw new ErroDoRecreio("MUITAS_TENTATIVAS");
    if (erro.code === "PERMISSAO") throw new ErroDoRecreio("SEM_PERMISSAO");
  }
  throw erro;
}

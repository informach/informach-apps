import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import {
  ChaveDeDadosSchema,
  MutacaoDeDadosSchema,
  PedidoDeConquistaSchema,
} from "@informach/recreio/contrato";
import { jogoQueAbre } from "@/features/jogos/config";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { limitarTentativas } from "@/lib/rate-limit";
import { lerDados, mutarDados, registrarConquista } from "./repository";

async function exigirCapacidade(sessao: SessaoDeJogoAtiva, escrita: boolean) {
  const manifesto = jogoQueAbre(sessao.jogo);
  if (!manifesto.capacidades.dadosDePerfil) throw new ErroDoRecreio("SEM_PERMISSAO");
  await limitarTentativas({
    chave: `dados-${escrita ? "escrita" : "leitura"}:${sessao.perfilId}:${sessao.jogo}`,
    max: escrita ? 30 : 120,
    janelaEmSegundos: 60,
  });
}

export async function consultarDados(
  sessao: SessaoDeJogoAtiva,
  chave: unknown,
  historico: boolean,
) {
  await exigirCapacidade(sessao, false);
  return lerDados(sessao, ChaveDeDadosSchema.parse(chave), historico);
}

export async function alterarDados(sessao: SessaoDeJogoAtiva, entrada: unknown) {
  const pedido = MutacaoDeDadosSchema.parse(entrada);
  await exigirCapacidade(sessao, true);
  const resultado = await mutarDados(sessao, pedido);
  if ("conflito" in resultado)
    throw new ErroDoRecreio("REVISAO_DIVERGENTE", {
      versaoId: resultado.versaoId,
      revisaoAtual: resultado.revisaoAtual,
    });
  return resultado;
}

export async function desbloquearConquista(sessao: SessaoDeJogoAtiva, entrada: unknown) {
  const pedido = PedidoDeConquistaSchema.parse(entrada);
  const manifesto = jogoQueAbre(sessao.jogo);
  if (!manifesto.capacidades.conquistas || !manifesto.conquistas?.includes(pedido.id))
    throw new ErroDoRecreio("SEM_PERMISSAO");
  await limitarTentativas({
    chave: `conquista:${sessao.perfilId}:${sessao.jogo}`,
    max: 30,
    janelaEmSegundos: 60,
  });
  return registrarConquista(sessao, pedido.id, pedido.chaveIdem);
}

import type { z } from "zod";
import {
  ConviteCriadoSchema,
  ListaDeMundosSchema,
  type MudancaDeAcesso,
  MundoAbertoSchema,
  MundoRefSchema,
  type RecreioGameContext,
  SessaoAbertaSchema,
  SessaoRenovadaSchema,
} from "../contrato/sdk";
import { FRACAO_PARA_RENOVAR } from "../contrato/tokens";
import { ErroDoRecreio, ehErroDoRecreio } from "../dominio/erros";
import { type Buscar, lerCorpo, pedir, semBarraFinal } from "../transporte/http";

/**
 * SDK do Recreio para o cliente de um jogo. Só usa `fetch` e temporizadores:
 * não impõe React, DOM, Three.js nem WebSocket, e não toca em chave nenhuma.
 *
 * A página que hospeda o jogo entrega `obterIngresso`, que pede o ingresso ao
 * Recreio com o cookie do portal. O SDK troca o ingresso por uma sessão de
 * jogo, renova a sessão em silêncio e avisa o jogo quando o acesso cai.
 */

export const CAMINHO_DA_API_DO_SDK = "/api/sdk/v1";

/** Se o Recreio não respondeu, a renovação tenta de novo depois deste intervalo. */
export const REPETIR_RENOVACAO_APOS_MS = 15_000;

/** Agenda uma chamada e devolve a função que a cancela. */
export type Agendar = (chamar: () => void, emMs: number) => () => void;

export type OpcoesDoRecreio = {
  /** Origem do Recreio. Vazio serve quando o jogo roda na própria origem do portal. */
  baseUrl: string;
  /** O id do jogo no catálogo. */
  jogo: string;
  /**
   * Pede um ingresso ao Recreio (`POST /api/sdk/v1/ingresso`, com o cookie do
   * portal) e devolve o token. Quem fornece é a página que hospeda o jogo.
   */
  obterIngresso: () => Promise<string>;
  /** Encerra a sessão de jogo aberta em outro aparelho e continua neste. */
  continuarAqui?: boolean;
  fetch?: Buscar;
  /** Relógio em milissegundos; existe para os testes. */
  agora?: () => number;
  /** Temporizador; existe para os testes. */
  agendar?: Agendar;
};

const agendarComTimeout: Agendar = (chamar, emMs) => {
  const id = setTimeout(chamar, emMs);
  return () => clearTimeout(id);
};

export async function criarRecreio(opcoes: OpcoesDoRecreio): Promise<RecreioGameContext> {
  const buscar: Buscar = opcoes.fetch ?? ((url, init) => fetch(url, init));
  const agora = opcoes.agora ?? (() => Date.now());
  const agendar = opcoes.agendar ?? agendarComTimeout;
  const base = `${semBarraFinal(opcoes.baseUrl)}${CAMINHO_DA_API_DO_SDK}`;

  async function enviar<T>(
    caminho: string,
    esquema: z.ZodType<T>,
    init: { method: "GET" | "POST"; token?: string; corpo?: unknown },
  ): Promise<T> {
    const resposta = await pedir(buscar, `${base}${caminho}`, {
      method: init.method,
      headers: {
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
        ...(init.corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.corpo === undefined ? {} : { body: JSON.stringify(init.corpo) }),
      // O token vai no cabeçalho; nenhum cookie do portal acompanha o jogo.
      credentials: "omit",
    });
    return lerCorpo(resposta, esquema);
  }

  const ingresso = await opcoes.obterIngresso();
  const aberta = await enviar("/sessao", SessaoAbertaSchema, {
    method: "POST",
    corpo: {
      ingresso,
      ...(opcoes.continuarAqui === undefined ? {} : { continuarAqui: opcoes.continuarAqui }),
    },
  });

  let token = aberta.token;
  let expiraEm = aberta.expiraEm;
  /** Depois de sair ou de perder o acesso, nada mais é renovado. */
  let encerrada = false;
  let cancelar: (() => void) | null = null;
  const aoRenovar = new Set<(token: string) => void>();
  const aoMudarAcesso = new Set<(mudanca: MudancaDeAcesso) => void>();

  function parar(): void {
    encerrada = true;
    cancelar?.();
    cancelar = null;
  }

  function perder(mudanca: MudancaDeAcesso): void {
    if (encerrada) return;
    parar();
    for (const ouvinte of [...aoMudarAcesso]) ouvinte(mudanca);
  }

  function agendarRenovacao(emMs: number): void {
    cancelar?.();
    cancelar = agendar(() => void renovar(), Math.max(0, emMs));
  }

  /** Renova quando passou `FRACAO_PARA_RENOVAR` do tempo que a sessão ainda tem. */
  function agendarPelaValidade(): void {
    agendarRenovacao(Math.floor((Date.parse(expiraEm) - agora()) * FRACAO_PARA_RENOVAR));
  }

  async function renovar(): Promise<void> {
    if (encerrada) return;
    try {
      const renovada = await enviar("/sessao/renovar", SessaoRenovadaSchema, {
        method: "POST",
        token,
      });
      if (encerrada) return;
      token = renovada.token;
      expiraEm = renovada.expiraEm;
      agendarPelaValidade();
      for (const ouvinte of [...aoRenovar]) ouvinte(token);
    } catch (erro) {
      if (encerrada) return;
      if (ehErroDoRecreio(erro) && erro.codigo !== "INDISPONIVEL") {
        // O Recreio recusou: o acesso caiu, e o jogo é avisado uma vez.
        const { estado, motivo } = erro.detalhe;
        perder({
          tipo: "perdido",
          codigo: erro.codigo,
          ...(typeof estado === "string" ? { estado } : {}),
          ...(typeof motivo === "string" ? { motivo } : {}),
        });
        return;
      }
      // Sem resposta do Recreio: tenta de novo enquanto a sessão não vence.
      const resta = Date.parse(expiraEm) - agora();
      if (resta <= 0) perder({ tipo: "perdido", codigo: "INDISPONIVEL" });
      else agendarRenovacao(Math.min(REPETIR_RENOVACAO_APOS_MS, resta));
    }
  }

  agendarPelaValidade();

  const mundo = (id: string) => `/mundos/${encodeURIComponent(id)}`;

  return {
    perfil: aberta.perfil,
    politica: aberta.politica,
    sessao: {
      get expiraEm() {
        return expiraEm;
      },
      token: () => token,
      aoRenovar(ouvinte) {
        aoRenovar.add(ouvinte);
        return () => aoRenovar.delete(ouvinte);
      },
      aoMudarAcesso(ouvinte) {
        aoMudarAcesso.add(ouvinte);
        return () => aoMudarAcesso.delete(ouvinte);
      },
      async sair() {
        const jaEncerrada = encerrada;
        parar();
        if (jaEncerrada) return;
        try {
          const resposta = await pedir(buscar, `${base}/sessao/sair`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
            credentials: "omit",
          });
          await resposta.body?.cancel();
        } catch (erro) {
          // Sessão que o Recreio já não reconhece (venceu, foi encerrada) está fora: é o que se queria.
          if (ehErroDoRecreio(erro, "SESSAO_INVALIDA") || ehErroDoRecreio(erro, "SESSAO_ENCERRADA"))
            return;
          throw erro;
        }
      },
    },
    mundos: {
      async listar() {
        const consulta = new URLSearchParams({ jogo: opcoes.jogo });
        const lista = await enviar(`/mundos?${consulta}`, ListaDeMundosSchema, {
          method: "GET",
          token,
        });
        return lista.mundos;
      },
      criar: (novo) => enviar("/mundos", MundoRefSchema, { method: "POST", token, corpo: novo }),
      abrir: (id) => enviar(`${mundo(id)}/abrir`, MundoAbertoSchema, { method: "POST", token }),
      convidar: (id, convite) =>
        enviar(`${mundo(id)}/convites`, ConviteCriadoSchema, {
          method: "POST",
          token,
          corpo: convite,
        }),
    },
  };
}

export type { MudancaDeAcesso, RecreioGameContext };
export { ErroDoRecreio, ehErroDoRecreio };

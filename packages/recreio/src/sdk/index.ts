import type { z } from "zod";
import {
  ChaveDeDadosSchema,
  ConquistaSchema,
  DadoLidoSchema,
  DadosDescartadosSchema,
  DadosGravadosSchema,
  LIMITES_DOS_DADOS,
  MutacaoDeDadosSchema,
  PedidoDeConquistaSchema,
  type VersaoDeDadosHttp,
  VersoesDeDadosSchema,
} from "../contrato/dados";
import { DenunciaRecebidaSchema } from "../contrato/denuncias";
import {
  EstadoDeSalvamentoSchema,
  type PedidoDeSalvamentoDePerfil,
  PedidoDeSalvamentoDePerfilSchema,
  type ResultadoDeSalvamento,
  ResultadoDeSalvamentoSchema,
  type SalvamentoDaSessao,
} from "../contrato/salvamento";
import {
  ConfirmacaoDeCheckpointSchema,
  ControleDaSessaoSchema,
  ConviteCriadoSchema,
  ListaDeMundosSchema,
  type MudancaDeAcesso,
  MundoAbertoSchema,
  MundoRefSchema,
  type RecreioGameContext,
  ResultadoDeCheckpointSchema,
  SessaoAbertaSchema,
  SessaoRenovadaSchema,
} from "../contrato/sdk";
import {
  AceiteDeAmizadeSchema,
  AmizadeRemovidaSchema,
  CodigoDeAmigoEmitidoSchema,
  ConsultaSocialSchema,
  ListaSocialSchema,
  MutacaoSocialSchema,
  PedidoDeAmizadeCriadoSchema,
  PedidoDeAmizadeEncerradoSchema,
  PresencaSocialSalvaSchema,
  ProtecaoSocialSalvaSchema,
  type SocialDoPerfil,
} from "../contrato/social";
import { FRACAO_PARA_RENOVAR } from "../contrato/tokens";
import { ErroDoRecreio, ehErroDoRecreio } from "../dominio/erros";
import { base64ParaBytes, bytesParaBase64 } from "../transporte/bytes";
import { type Buscar, erroDaResposta, lerCorpo, pedir, semBarraFinal } from "../transporte/http";
import { comPrazoDePedido, TEMPO_LIMITE_DO_PEDIDO_MS } from "../transporte/prazo";

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
  obterIngresso: (signal: AbortSignal) => Promise<string>;
  /** Solicita continuar neste aparelho, sujeito ao checkpoint ou à saída anterior. */
  continuarAqui?: boolean;
  /** Só ativar depois dos leitores do recibo no servidor. Não persiste a prova. */
  recuperarAbertura?: boolean;
  /** Negocia a capacidade restrita; somente após implantação dos seus leitores/escritores. */
  salvamentoRestrito?: boolean;
  /** Negociação explícita, após os leitores sociais do servidor estarem implantados. */
  social?: boolean;
  /** Aguarda o ACK de outro aparelho, conservando o mesmo ingresso e prova. */
  aguardarCheckpoint?: boolean;
  aoAguardarCheckpoint?: () => void;
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
    tempoLimiteMs = TEMPO_LIMITE_DO_PEDIDO_MS,
  ): Promise<T> {
    return comPrazoDePedido(async (signal) => {
      const resposta = await pedir(buscar, `${base}${caminho}`, {
        method: init.method,
        headers: {
          ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
          ...(init.corpo === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(init.corpo === undefined ? {} : { body: JSON.stringify(init.corpo) }),
        // O token vai no cabeçalho; nenhum cookie do portal acompanha o jogo.
        credentials: "omit",
        signal,
      });
      signal.throwIfAborted();
      return lerCorpo(resposta, esquema, LIMITES_DOS_DADOS.respostaBytes);
    }, tempoLimiteMs);
  }

  const ingresso = await comPrazoDePedido(opcoes.obterIngresso);
  const chaveDeTroca = opcoes.recuperarAbertura
    ? bytesParaBase64(crypto.getRandomValues(new Uint8Array(32)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "")
    : undefined;
  const pedidoDeAbertura = {
    method: "POST",
    corpo: {
      ingresso,
      ...(opcoes.continuarAqui === undefined ? {} : { continuarAqui: opcoes.continuarAqui }),
      ...(chaveDeTroca === undefined ? {} : { chaveDeTroca }),
      ...(opcoes.salvamentoRestrito ? { suportaSalvamento: true } : {}),
      ...(opcoes.social ? { suportaSocial: true } : {}),
    },
  } as const;
  const aberta = await (async () => {
    const inicioDaEspera = agora();
    let fimDaEspera = inicioDaEspera + 30_000;
    let recuperacaoTentada = false;
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await enviar(
          "/sessao",
          SessaoAbertaSchema,
          pedidoDeAbertura,
          Math.max(1, Math.min(TEMPO_LIMITE_DO_PEDIDO_MS, fimDaEspera - agora())),
        );
      } catch (erro) {
        if (ehErroDoRecreio(erro, "CHECKPOINT_PENDENTE") && erro.detalhe.motivo === "saving")
          fimDaEspera = inicioDaEspera + 35_000;
        // Somente este pedido tem recibo/prova: repetir preserva ingresso e SID.
        if (chaveDeTroca && !recuperacaoTentada && ehErroDoRecreio(erro, "INDISPONIVEL")) {
          recuperacaoTentada = true;
          continue;
        }
        if (
          !chaveDeTroca ||
          !opcoes.aguardarCheckpoint ||
          tentativa >= 35 ||
          !ehErroDoRecreio(erro, "CHECKPOINT_PENDENTE") ||
          (!opcoes.continuarAqui && erro.detalhe.motivo !== "saving") ||
          !["requested", "pending", "confirmed", "saving"].includes(String(erro.detalhe.motivo)) ||
          agora() + 1000 >= fimDaEspera
        )
          throw erro;
        opcoes.aoAguardarCheckpoint?.();
        await new Promise<void>((resolve) => {
          agendar(resolve, 1000);
        });
      }
    }
  })();

  let token = aberta.token;
  let expiraEm = aberta.expiraEm;
  let capacidadeDeSalvamento = opcoes.salvamentoRestrito ? aberta.salvamento : undefined;
  /** Depois de sair ou de perder o acesso, nada mais é renovado. */
  let encerrada = false;
  let saidaConfirmada = false;
  let saidaEmCurso: Promise<void> | null = null;
  let cancelar: (() => void) | null = null;
  let renovacaoSuspensa = false;
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
    if (encerrada || renovacaoSuspensa) return;
    const restante = Date.parse(expiraEm) - agora();
    if (restante <= 0) {
      perder({ tipo: "perdido", codigo: "INDISPONIVEL" });
      return;
    }
    try {
      const renovada = await enviar(
        "/sessao/renovar",
        SessaoRenovadaSchema,
        { method: "POST", token },
        Math.min(TEMPO_LIMITE_DO_PEDIDO_MS, restante),
      );
      if (encerrada) return;
      const prazoAnterior = expiraEm;
      token = renovada.token;
      expiraEm = renovada.expiraEm;
      if (opcoes.salvamentoRestrito && renovada.salvamento)
        capacidadeDeSalvamento = renovada.salvamento;
      if (!renovacaoSuspensa) {
        if (Date.parse(expiraEm) <= Date.parse(prazoAnterior))
          // Um limite que não avançou encerra no prazo já confirmado. Fracionar
          // o restante repetidamente produz uma tempestade perto do vencimento.
          agendarRenovacao(Date.parse(expiraEm) - agora());
        else agendarPelaValidade();
      }
      for (const ouvinte of [...aoRenovar]) ouvinte(token);
    } catch (erro) {
      if (encerrada) return;
      if (
        renovacaoSuspensa &&
        ehErroDoRecreio(erro, "SESSAO_ENCERRADA") &&
        erro.detalhe.motivo === "checkpoint"
      )
        return;
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
      else if (!renovacaoSuspensa) agendarRenovacao(Math.min(REPETIR_RENOVACAO_APOS_MS, resta));
    }
  }

  agendarPelaValidade();

  const mundo = (id: string) => `/mundos/${encodeURIComponent(id)}`;
  function exigirSessao(): void {
    if (encerrada) throw new ErroDoRecreio("SESSAO_ENCERRADA");
  }
  const versaoDeDados = ({ conteudo, ...versao }: VersaoDeDadosHttp) => ({
    ...versao,
    dados: base64ParaBytes(conteudo),
  });
  const consultaDeDados = (chave: string, historico = false) =>
    `/dados?${new URLSearchParams({ chave: ChaveDeDadosSchema.parse(chave), ...(historico ? { historico: "1" } : {}) })}`;

  let finalizacao: {
    corpo: PedidoDeSalvamentoDePerfil;
    texto: string;
    promessa: Promise<ResultadoDeSalvamento> | null;
    resultado: ResultadoDeSalvamento | null;
  } | null = null;
  function exigirCapacidadeDeSalvamento() {
    if (!capacidadeDeSalvamento) throw new ErroDoRecreio("SEM_PERMISSAO");
    return capacidadeDeSalvamento;
  }
  const salvamento: SalvamentoDaSessao = {
    parar,
    async estado() {
      const estado = await enviar("/sessao/salvamento", EstadoDeSalvamentoSchema, {
        method: "GET",
        token: exigirCapacidadeDeSalvamento().token,
      });
      if (estado.estado !== "ready") {
        parar();
        saidaConfirmada = true;
      }
      return estado;
    },
    async finalizarDados(dados) {
      exigirCapacidadeDeSalvamento();
      if (
        dados.length > LIMITES_DOS_DADOS.chaves ||
        dados.some((dado) => dado.dados.byteLength > LIMITES_DOS_DADOS.bytesPorVersao)
      )
        throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
      const corpo = PedidoDeSalvamentoDePerfilSchema.parse({
        dados: dados.map((dado) => ({
          operacao: "gravar",
          chave: dado.chave,
          revisao: dado.revisao,
          conteudo: bytesParaBase64(dado.dados),
        })),
      });
      corpo.dados.sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
      const texto = JSON.stringify(corpo);
      if (finalizacao && finalizacao.texto !== texto) throw new ErroDoRecreio("FATO_DUPLICADO");
      finalizacao ??= { corpo, texto, promessa: null, resultado: null };
      const tentativa = finalizacao;
      if (tentativa.resultado) return ResultadoDeSalvamentoSchema.parse(tentativa.resultado);
      if (tentativa.promessa) return tentativa.promessa;
      parar();
      const concluir = async () => {
        for (let repeticao = 0; ; repeticao++) {
          try {
            const resultado = await enviar("/sessao/salvamento", ResultadoDeSalvamentoSchema, {
              method: "POST",
              token: exigirCapacidadeDeSalvamento().token,
              corpo: tentativa.corpo,
            });
            tentativa.resultado = ResultadoDeSalvamentoSchema.parse(resultado);
            saidaConfirmada = true;
            return ResultadoDeSalvamentoSchema.parse(resultado);
          } catch (erro) {
            // Esta escrita tem recibo próprio: só uma recuperação com o lote idêntico.
            if (repeticao > 0 || !ehErroDoRecreio(erro, "INDISPONIVEL")) throw erro;
          }
        }
      };
      const promessa = concluir();
      tentativa.promessa = promessa;
      try {
        return await promessa;
      } finally {
        if (tentativa.promessa === promessa) tentativa.promessa = null;
      }
    },
  };

  const social: SocialDoPerfil = {
    async listar(apos) {
      exigirSessao();
      const consulta = ConsultaSocialSchema.parse(apos === undefined ? {} : { apos });
      return enviar(
        `/social${consulta.apos ? `?apos=${encodeURIComponent(consulta.apos)}` : ""}`,
        ListaSocialSchema,
        { method: "GET", token },
      );
    },
    async presenca(presenca) {
      exigirSessao();
      return enviar("/social", PresencaSocialSalvaSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ operacao: "presenca", presenca }),
      });
    },
    async codigo() {
      exigirSessao();
      return enviar("/social", CodigoDeAmigoEmitidoSchema, {
        method: "POST",
        token,
        corpo: { operacao: "codigo" },
      });
    },
    async pedir(codigo, pedidoId) {
      exigirSessao();
      return enviar("/social", PedidoDeAmizadeCriadoSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ operacao: "pedir", codigo, pedidoId }),
      });
    },
    async aceitar(pedidoId) {
      exigirSessao();
      return enviar("/social", AceiteDeAmizadeSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ operacao: "aceitar", pedidoId }),
      });
    },
    async encerrar(pedidoId, acao) {
      exigirSessao();
      return enviar("/social", PedidoDeAmizadeEncerradoSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ operacao: "encerrar", pedidoId, acao }),
      });
    },
    async proteger(entrada) {
      exigirSessao();
      return enviar("/social", ProtecaoSocialSalvaSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ ...entrada, operacao: "proteger" }),
      });
    },
    async denunciar(entrada) {
      exigirSessao();
      return enviar("/social", DenunciaRecebidaSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ ...entrada, operacao: "denunciar" }),
      });
    },
    async remover(perfilId) {
      exigirSessao();
      await enviar("/social", AmizadeRemovidaSchema, {
        method: "POST",
        token,
        corpo: MutacaoSocialSchema.parse({ operacao: "remover", perfilId }),
      });
    },
  };
  return {
    ...(opcoes.social && aberta.social ? { social } : {}),
    dados: {
      async ler(chave) {
        exigirSessao();
        const { versao } = await enviar(consultaDeDados(chave), DadoLidoSchema, {
          method: "GET",
          token,
        });
        return versao ? versaoDeDados(versao) : null;
      },
      async gravar(chave, dados, revisao = 0) {
        exigirSessao();
        if (dados.byteLength > LIMITES_DOS_DADOS.bytesPorVersao)
          throw new ErroDoRecreio("TAMANHO_EXCEDIDO");
        const corpo = MutacaoDeDadosSchema.parse({
          operacao: "gravar",
          chave,
          revisao,
          conteudo: bytesParaBase64(dados),
        });
        return (await enviar("/dados", DadosGravadosSchema, { method: "POST", token, corpo }))
          .revisao;
      },
      async versoes(chave) {
        exigirSessao();
        const lidas = await enviar(consultaDeDados(chave, true), VersoesDeDadosSchema, {
          method: "GET",
          token,
        });
        return { revisaoAtual: lidas.revisaoAtual, versoes: lidas.versoes.map(versaoDeDados) };
      },
      async resolver(chave, versaoId, revisao) {
        exigirSessao();
        const corpo = MutacaoDeDadosSchema.parse({
          operacao: "resolver",
          chave,
          versaoId,
          revisao,
        });
        return (await enviar("/dados", DadosGravadosSchema, { method: "POST", token, corpo }))
          .revisao;
      },
      async descartar(chave, versaoId) {
        exigirSessao();
        const corpo = MutacaoDeDadosSchema.parse({ operacao: "descartar", chave, versaoId });
        await enviar("/dados", DadosDescartadosSchema, { method: "POST", token, corpo });
      },
    },
    conquista: async (id, chaveIdem) => {
      exigirSessao();
      return enviar("/conquistas", ConquistaSchema, {
        method: "POST",
        token,
        corpo: PedidoDeConquistaSchema.parse({ id, chaveIdem }),
      });
    },
    perfil: aberta.perfil,
    politica: aberta.politica,
    sessao: {
      get salvamento() {
        return capacidadeDeSalvamento ? salvamento : undefined;
      },
      async controle() {
        exigirSessao();
        const controle = await enviar("/sessao/controle", ControleDaSessaoSchema, {
          method: "GET",
          token,
        });
        if (controle.pausada || controle.checkpoint?.estado === "requested") {
          renovacaoSuspensa = true;
          cancelar?.();
          cancelar = null;
        } else if (renovacaoSuspensa && controle.checkpoint === null) {
          renovacaoSuspensa = false;
          agendarPelaValidade();
        }
        return controle;
      },
      async checkpoint(id, confirmado) {
        exigirSessao();
        const corpo = ConfirmacaoDeCheckpointSchema.parse({ id, confirmado });
        if (confirmado) {
          renovacaoSuspensa = true;
          cancelar?.();
          cancelar = null;
        }
        const resultado = await enviar("/sessao/checkpoint", ResultadoDeCheckpointSchema, {
          method: "POST",
          token,
          corpo,
        });
        if (resultado.pausada) {
          renovacaoSuspensa = true;
          cancelar?.();
          cancelar = null;
        } else if (renovacaoSuspensa) {
          renovacaoSuspensa = false;
          agendarPelaValidade();
        }
        return resultado;
      },
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
        parar();
        if (saidaConfirmada) return;
        if (saidaEmCurso) return saidaEmCurso;
        const pedido = (async () => {
          try {
            await comPrazoDePedido(async (signal) => {
              const resposta = await pedir(buscar, `${base}/sessao/sair`, {
                method: "POST",
                headers: { authorization: `Bearer ${token}` },
                credentials: "omit",
                signal,
              });
              signal.throwIfAborted();
              await resposta.body?.cancel();
            });
          } catch (erro) {
            // Essas recusas confirmam que o servidor já encerrou a sessão.
            if (
              !ehErroDoRecreio(erro, "SESSAO_INVALIDA") &&
              !ehErroDoRecreio(erro, "SESSAO_ENCERRADA")
            )
              throw erro;
          }
          saidaConfirmada = true;
        })();
        saidaEmCurso = pedido;
        try {
          await pedido;
        } finally {
          saidaEmCurso = null;
        }
      },
    },
    mundos: {
      async listar() {
        exigirSessao();
        const consulta = new URLSearchParams({ jogo: opcoes.jogo });
        const lista = await enviar(`/mundos?${consulta}`, ListaDeMundosSchema, {
          method: "GET",
          token,
        });
        return lista.mundos;
      },
      async criar(novo) {
        exigirSessao();
        return enviar("/mundos", MundoRefSchema, { method: "POST", token, corpo: novo });
      },
      async abrir(id) {
        exigirSessao();
        return enviar(`${mundo(id)}/abrir`, MundoAbertoSchema, { method: "POST", token });
      },
      async convidar(id, convite) {
        exigirSessao();
        return enviar(`${mundo(id)}/convites`, ConviteCriadoSchema, {
          method: "POST",
          token,
          corpo: convite,
        });
      },
    },
  };
}

export type { ControleDaSessao } from "../contrato/sdk";
export type { ProtecaoDeContato, SocialDoPerfil } from "../contrato/social";
export type { JogoMontado, ModuloDoJogo, OpcoesDeMontagem } from "./modulo";
export type { MudancaDeAcesso, RecreioGameContext };
/**
 * `erroDaResposta` serve a quem fornece `obterIngresso`: transforma a recusa de
 * `POST /api/sdk/v1/ingresso` no mesmo `ErroDoRecreio` que o SDK lança.
 */
export {
  comPrazoDePedido,
  ErroDoRecreio,
  ehErroDoRecreio,
  erroDaResposta,
  TEMPO_LIMITE_DO_PEDIDO_MS,
};

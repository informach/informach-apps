"use client";
import "@/lib/zod-sem-eval";
import type { MundoId } from "@informach/recreio";
import {
  criarRecreio,
  ErroDoRecreio,
  ehErroDoRecreio,
  type JogoMontado,
  type RecreioGameContext,
  type SocialDoPerfil,
} from "@informach/recreio/sdk";
import { LogOut, Users } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { PainelSocialDaPartida } from "@/features/social/components/painel-da-partida";
import { carregadorDoJogo } from "../carregadores";
import { type AvisoDaTroca, observarTrocaDaPartida } from "../controle";
import {
  ESTADO_INICIAL,
  type Parada,
  paradaDaMudanca,
  paradaDoErro,
  reduzir,
  textoDaParada,
} from "../estado";
import { confirmarFinalizacao } from "../finalizacao";
import { pedirIngresso } from "../ingresso";
import { AvisoDoJogo, TelaDoJogo } from "./aviso-do-jogo";

/** O que está de pé enquanto a pessoa joga: a sessão de jogo e o jogo montado. */
type Partida = {
  contexto: RecreioGameContext;
  montado: JogoMontado | null;
  cancelarAcesso: () => void;
  cancelarControle: () => void;
  intencaoDeSaida: { parada: Parada | null } | null;
  finalizacao: Promise<void> | null;
};

/**
 * Solta tudo de uma partida: o jogo primeiro (ele salva o que precisa), a
 * sessão de jogo depois. Com pressa, o pedido de encerrar a sessão parte na
 * hora, sem esperar o jogo: é o caso da página que está indo embora.
 */
async function encerrar(partida: Partida, comPressa = false): Promise<void> {
  partida.cancelarControle();
  partida.cancelarAcesso();
  // Sem resposta do Recreio a sessão vence sozinha, e a próxima abertura pergunta.
  const sairDaSessao = () => partida.contexto.sessao.sair().catch(() => undefined);
  const jaPedido = comPressa ? sairDaSessao() : null;
  try {
    const capacidade = partida.contexto.sessao.salvamento;
    const montado = partida.montado;
    if (comPressa && capacidade && montado?.finalizar) {
      // Melhor esforço com keepalive: o leitor da margem protege a próxima
      // abertura se o navegador encerrar o processo antes da confirmação.
      await confirmarFinalizacao(capacidade, montado.finalizar.bind(montado)).catch(
        () => undefined,
      );
    }
    await partida.montado?.dispose();
  } catch {
    // O jogo não conseguiu se desmontar direito; a sessão é encerrada do mesmo jeito.
  }
  await (jaPedido ?? sairDaSessao());
}

/**
 * Hospeda um jogo na janela inteira. Pede o ingresso com o cookie do portal,
 * abre a sessão de jogo pelo SDK, baixa o cliente do jogo sob demanda e o
 * monta. Recebe só o id do jogo, o id do mundo e textos de exibição: nenhum id
 * de perfil ou de conta, e-mail ou token vem do servidor para cá.
 *
 * Um perfil tem uma sessão de jogo por vez. Por isso tudo o que para o jogo
 * (sair, falha, troca de página) encerra a sessão antes de qualquer nova
 * tentativa, e as tentativas correm uma depois da outra.
 */
export function Hospedeiro({
  jogo,
  mundo,
  estante = "/estante",
  trocaCoordenada = false,
  supervisionado = false,
}: {
  jogo: { id: string; nome: string; origemDaArte?: string | null };
  mundo: { id: MundoId; nome: string } | null;
  estante?: "/estante" | "/aparelho";
  trocaCoordenada?: boolean;
  supervisionado?: boolean;
}) {
  const [estado, despachar] = useReducer(reduzir, ESTADO_INICIAL);
  /** O jogo montado tem o próprio controle de saída: a página não desenha o dela. */
  const [saidaDoJogo, definirSaidaDoJogo] = useState(false);
  const [avisoDaTroca, definirAvisoDaTroca] = useState<AvisoDaTroca | null>(null);
  const [aguardandoTroca, definirAguardandoTroca] = useState(false);
  const [salvamento, definirSalvamento] = useState<"salvando" | "falhou" | null>(null);
  const [confirmacao, definirConfirmacao] = useState(false);
  const [apiSocial, definirApiSocial] = useState<SocialDoPerfil | null>(null);
  const [painelSocial, definirPainelSocial] = useState(false);
  const palco = useRef<HTMLDivElement>(null);
  const partida = useRef<Partida | null>(null);
  /** Cada tentativa de abrir tem um número; a que não é mais a atual desiste. */
  const tentativa = useRef(0);
  /** As tentativas e as limpezas em fila: uma só começa quando a anterior acabou. */
  const fila = useRef<Promise<void>>(Promise.resolve());
  /** A página está saindo de cena: os pedidos de encerramento precisam sobreviver a ela. */
  const fechando = useRef(false);

  /**
   * Desmonta o jogo e encerra a sessão de jogo, na fila. Repetir não faz nada.
   * Quem já está dentro da fila não espera por esta função: chama `encerrar`.
   */
  const desmontar = useCallback((): Promise<void> => {
    const atual = partida.current;
    partida.current = null;
    if (atual) fila.current = fila.current.then(() => encerrar(atual));
    return fila.current;
  }, []);

  const tentarFinalizar = useCallback(
    (parada: Parada | null): boolean => {
      const atual = partida.current;
      const capacidade = atual?.contexto.sessao.salvamento;
      const montado = atual?.montado;
      if (!atual || !capacidade || !montado?.finalizar) return false;
      atual.intencaoDeSaida ??= { parada };
      if (atual.finalizacao) return true;
      atual.cancelarControle();
      atual.cancelarAcesso();
      definirSalvamento("salvando");
      const finalizar = montado.finalizar.bind(montado);
      const tarefa = confirmarFinalizacao(capacidade, finalizar)
        .then(async (resultado) => {
          if (partida.current !== atual) return;
          definirSalvamento(null);
          definirConfirmacao(resultado === "completed");
          if (resultado === "conflicted") {
            despachar({ tipo: "parou", parada: "conflito_preservado" });
            await desmontar();
          } else if (atual.intencaoDeSaida?.parada === null) {
            tentativa.current += 1;
            despachar({ tipo: "sair" });
            await desmontar();
            window.location.assign(estante);
          } else {
            despachar({
              tipo: "parou",
              parada: atual.intencaoDeSaida?.parada ?? "sessao_encerrada",
            });
            await desmontar();
          }
        })
        .catch(() => {
          if (partida.current === atual) definirSalvamento("falhou");
        })
        .finally(() => {
          if (atual.finalizacao === tarefa) atual.finalizacao = null;
        });
      atual.finalizacao = tarefa;
      return true;
    },
    [desmontar, estante],
  );

  const parar = useCallback(
    (parada: Parada) => {
      definirPainelSocial(false);
      if (
        [
          "acesso_perdido",
          "sessao_encerrada",
          "saiu_do_jogo",
          "rede",
          "falha",
          "fim_do_tempo",
          "fora_do_horario",
          "novo_dia",
        ].includes(parada) &&
        tentarFinalizar(parada)
      )
        return;
      definirSalvamento(null);
      despachar({ tipo: "parou", parada });
      void desmontar();
    },
    [desmontar, tentarFinalizar],
  );

  const sairSemConfirmar = useCallback(() => {
    tentativa.current += 1;
    definirSalvamento(null);
    despachar({ tipo: "sair" });
    void desmontar().finally(() => window.location.assign(estante));
  }, [desmontar, estante]);
  const sair = useCallback(() => {
    if (!tentarFinalizar(null)) sairSemConfirmar();
  }, [tentarFinalizar, sairSemConfirmar]);

  const abrir = useCallback(
    (continuarAqui: boolean) => {
      tentativa.current += 1;
      const minha = tentativa.current;
      const atual = () => minha === tentativa.current;
      definirAvisoDaTroca(null);
      definirPainelSocial(false);
      definirApiSocial(null);
      definirSalvamento(null);
      definirConfirmacao(false);
      definirAguardandoTroca(false);
      despachar({ tipo: "abrir" });
      void desmontar();
      fila.current = fila.current.then(async () => {
        if (!atual()) return;
        try {
          const carregar = carregadorDoJogo(jogo.id);
          if (!carregar) throw new ErroDoRecreio("JOGO_INDISPONIVEL");
          const contexto = await criarRecreio({
            baseUrl: "",
            jogo: jogo.id,
            social: true,
            salvamentoRestrito: trocaCoordenada,
            obterIngresso: (signal) => pedirIngresso(jogo.id, signal),
            ...(continuarAqui ? { continuarAqui: true } : {}),
            ...(trocaCoordenada
              ? {
                  recuperarAbertura: true,
                  aguardarCheckpoint: true,
                  aoAguardarCheckpoint: () => {
                    if (atual()) definirAguardandoTroca(true);
                  },
                }
              : {}),
            // `keepalive` deixa o pedido de encerrar a sessão terminar mesmo
            // com a página indo embora.
            fetch: (url, init) =>
              fetch(url, fechando.current ? { ...init, keepalive: true } : init),
          });
          const nova: Partida = {
            contexto,
            montado: null,
            intencaoDeSaida: null,
            finalizacao: null,
            cancelarControle: () => {},
            cancelarAcesso: contexto.sessao.aoMudarAcesso((mudanca) =>
              parar(paradaDaMudanca(mudanca)),
            ),
          };
          partida.current = nova;
          /** Desiste desta partida, a não ser que alguém de fora da fila já a tenha levado. */
          const desistir = async () => {
            if (partida.current !== nova) return;
            partida.current = null;
            await encerrar(nova);
          };
          if (!atual()) return await desistir();
          const modulo = await carregar();
          const host = palco.current;
          if (!atual() || partida.current !== nova || !host) return await desistir();
          const montado = modulo.montar(host, contexto, {
            mundoId: mundo?.id,
            origemDaArte: jogo.origemDaArte ?? undefined,
            aoSair: sair,
            aoFalhar: (erro) => parar(paradaDoErro(erro)),
          });
          // O jogo pode ter falhado ainda dentro de `montar`: a partida já foi levada.
          if (partida.current !== nova) {
            await montado.dispose();
            return;
          }
          nova.montado = montado;
          if (trocaCoordenada || supervisionado)
            nova.cancelarControle = observarTrocaDaPartida(
              contexto,
              montado,
              (aviso) => {
                if (partida.current === nova) {
                  if (aviso?.bloqueia) definirPainelSocial(false);
                  definirAvisoDaTroca(aviso);
                }
              },
              (erro) => {
                if (partida.current === nova) parar(paradaDoErro(erro));
              },
              (motivo) => {
                if (partida.current === nova)
                  parar(
                    motivo === "daily_limit"
                      ? "fim_do_tempo"
                      : motivo === "schedule"
                        ? "fora_do_horario"
                        : "novo_dia",
                  );
              },
            );
          definirAguardandoTroca(false);
          definirSaidaDoJogo(modulo.saidaPropria === true);
          definirApiSocial(contexto.social ?? null);
          despachar({ tipo: "montado" });
        } catch (erro) {
          if (!atual()) return;
          definirAguardandoTroca(false);
          if (ehErroDoRecreio(erro, "JA_ABERTO")) despachar({ tipo: "ja_aberto" });
          else parar(paradaDoErro(erro));
        }
      });
    },
    [
      jogo.id,
      jogo.origemDaArte,
      mundo?.id,
      desmontar,
      parar,
      sair,
      trocaCoordenada,
      supervisionado,
    ],
  );

  useEffect(() => {
    fechando.current = false;
    abrir(false);
    const aoEsconder = () => {
      fechando.current = true;
      tentativa.current += 1;
      // A página pode sumir a qualquer instante: o encerramento parte agora,
      // fora da fila e sem esperar o jogo.
      const atual = partida.current;
      partida.current = null;
      if (atual) void encerrar(atual, true);
    };
    // Uma página que volta do cache do navegador traz um jogo já desmontado.
    const aoMostrar = (evento: PageTransitionEvent) => {
      if (evento.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", aoEsconder);
    window.addEventListener("pageshow", aoMostrar);
    return () => {
      window.removeEventListener("pagehide", aoEsconder);
      window.removeEventListener("pageshow", aoMostrar);
      tentativa.current += 1;
      void desmontar();
    };
  }, [abrir, desmontar]);

  const jogando = estado.fase === "jogando" && salvamento === null;
  const parada = estado.fase === "parado" ? textoDaParada(estado.parada) : null;

  return (
    <TelaDoJogo titulo={mundo ? `${jogo.nome}: ${mundo.nome}` : jogo.nome}>
      {/* O jogo desenha aqui. Fora do jogo o elemento fica vazio e fora da leitura. */}
      <div
        ref={palco}
        data-palco
        className="absolute inset-0"
        inert={!jogando || avisoDaTroca?.bloqueia || painelSocial}
      />

      {jogando && apiSocial && !avisoDaTroca?.bloqueia && (
        <>
          <button
            type="button"
            aria-label="Amigos e proteção"
            title="Amigos e proteção"
            className="absolute top-1/2 left-3 z-10 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-controle border border-linha-forte bg-fundo/90 text-tinta shadow-lg"
            onClick={() => definirPainelSocial(true)}
          >
            <Users className="size-5" aria-hidden="true" />
          </button>
          {painelSocial && (
            <PainelSocialDaPartida
              api={apiSocial}
              mundoId={mundo?.id}
              aoFechar={() => definirPainelSocial(false)}
            />
          )}
        </>
      )}

      {jogando && avisoDaTroca && (
        <div
          className={
            avisoDaTroca.bloqueia
              ? "absolute inset-0 z-20 flex items-center justify-center bg-fundo/90 p-4"
              : "absolute inset-x-4 top-4 z-20 mx-auto max-w-lg rounded-controle bg-fundo p-4 shadow-lg"
          }
        >
          <div role="status" className="text-center">
            <p>{avisoDaTroca.texto}</p>
            {avisoDaTroca.bloqueia && (
              <button type="button" className="rb rb-vazado mt-4" onClick={sair}>
                Voltar à estante
              </button>
            )}
          </div>
        </div>
      )}

      {jogando && !saidaDoJogo && (
        <button
          type="button"
          onClick={sair}
          aria-label="Sair do jogo"
          className="absolute top-3 left-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-controle border border-linha-forte bg-fundo/80 px-3 text-sm font-bold text-tinta-suave opacity-70 transition-opacity hover:text-tinta hover:opacity-100 focus-visible:opacity-100"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </button>
      )}

      {/* A região existe sempre, para o leitor de tela anunciar cada mudança. */}
      <div
        aria-live="polite"
        className={
          jogando
            ? "sr-only"
            : "absolute inset-0 z-20 flex items-center justify-center overflow-auto p-4"
        }
      >
        {salvamento !== null && (
          <AvisoDoJogo
            titulo={
              salvamento === "salvando"
                ? "Salvando antes de encerrar…"
                : "O salvamento ainda não foi confirmado"
            }
            texto={
              salvamento === "salvando"
                ? "Mantenha esta página aberta enquanto conferimos seu progresso."
                : "Seu jogo continua nesta tela. Tente confirmar de novo; sair agora pode perder alterações recentes."
            }
          >
            {salvamento === "falhou" && (
              <>
                <button type="button" className="rb rb-sol" onClick={() => tentarFinalizar(null)}>
                  Tentar salvar de novo
                </button>
                <button type="button" className="rb rb-vazado" onClick={sairSemConfirmar}>
                  Voltar sem confirmar
                </button>
              </>
            )}
          </AvisoDoJogo>
        )}
        {salvamento === null && estado.fase === "carregando" && (
          <AvisoDoJogo
            titulo={
              aguardandoTroca ? "Aguardando o outro aparelho salvar…" : `Abrindo ${jogo.nome}…`
            }
            texto={
              aguardandoTroca
                ? "Mantenha a partida anterior aberta. O jogo começa aqui depois da confirmação."
                : undefined
            }
          />
        )}
        {estado.fase === "saindo" && <AvisoDoJogo titulo="Saindo…" />}
        {salvamento === null && estado.fase === "ja_aberto" && (
          <AvisoDoJogo
            titulo="Você já está jogando em outro lugar"
            texto={
              trocaCoordenada
                ? "Continuar aqui? Vamos pedir ao outro aparelho que salve antes de trocar."
                : "Continuar aqui? Primeiro salve e saia pelo jogo no outro aparelho."
            }
          >
            <button type="button" className="rb rb-sol" onClick={() => abrir(true)}>
              Continuar aqui
            </button>
            <a href={estante} className="rb rb-vazado">
              Voltar à estante
            </a>
          </AvisoDoJogo>
        )}
        {salvamento === null && parada && (
          <AvisoDoJogo titulo={parada.titulo} texto={parada.texto}>
            {confirmacao && (
              <p role="status" className="w-full text-sm text-tinta-suave">
                Progresso salvo e confirmado.
              </p>
            )}
            {parada.acao === "tentar" && (
              <button type="button" className="rb rb-sol" onClick={() => abrir(false)}>
                {parada.rotulo ?? "Tentar de novo"}
              </button>
            )}
            {parada.acao === "entrar" && (
              <button type="button" className="rb rb-sol" onClick={() => window.location.reload()}>
                {parada.rotulo ?? "Entrar de novo"}
              </button>
            )}
            <a href={estante} className="rb rb-vazado">
              Voltar à estante
            </a>
          </AvisoDoJogo>
        )}
      </div>
    </TelaDoJogo>
  );
}

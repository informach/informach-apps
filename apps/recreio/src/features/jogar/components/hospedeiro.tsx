"use client";
import "@/lib/zod-sem-eval";
import type { MundoId } from "@informach/recreio";
import {
  criarRecreio,
  ErroDoRecreio,
  ehErroDoRecreio,
  type JogoMontado,
  type RecreioGameContext,
} from "@informach/recreio/sdk";
import { LogOut } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ESTADO_INICIAL,
  type Parada,
  paradaDaMudanca,
  paradaDoErro,
  reduzir,
  textoDaParada,
} from "../estado";
import { pedirIngresso } from "../ingresso";
import { carregadorDoJogo } from "../registro";
import { AvisoDoJogo, TelaDoJogo } from "./aviso-do-jogo";

/** O que está de pé enquanto a pessoa joga: a sessão de jogo e o jogo montado. */
type Partida = {
  contexto: RecreioGameContext;
  montado: JogoMontado | null;
  cancelarAcesso: () => void;
};

/**
 * Solta tudo de uma partida: o jogo primeiro (ele salva o que precisa), a
 * sessão de jogo depois. Com pressa, o pedido de encerrar a sessão parte na
 * hora, sem esperar o jogo: é o caso da página que está indo embora.
 */
async function encerrar(partida: Partida, comPressa = false): Promise<void> {
  partida.cancelarAcesso();
  // Sem resposta do Recreio a sessão vence sozinha, e a próxima abertura pergunta.
  const sairDaSessao = () => partida.contexto.sessao.sair().catch(() => undefined);
  const jaPedido = comPressa ? sairDaSessao() : null;
  try {
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
}: {
  jogo: { id: string; nome: string };
  mundo: { id: MundoId; nome: string };
}) {
  const [estado, despachar] = useReducer(reduzir, ESTADO_INICIAL);
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

  const parar = useCallback(
    (parada: Parada) => {
      despachar({ tipo: "parou", parada });
      void desmontar();
    },
    [desmontar],
  );

  const sair = useCallback(() => {
    tentativa.current += 1;
    despachar({ tipo: "sair" });
    void desmontar().finally(() => window.location.assign("/estante"));
  }, [desmontar]);

  const abrir = useCallback(
    (continuarAqui: boolean) => {
      tentativa.current += 1;
      const minha = tentativa.current;
      const atual = () => minha === tentativa.current;
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
            obterIngresso: () => pedirIngresso(jogo.id),
            ...(continuarAqui ? { continuarAqui: true } : {}),
            // `keepalive` deixa o pedido de encerrar a sessão terminar mesmo
            // com a página indo embora.
            fetch: (url, init) =>
              fetch(url, fechando.current ? { ...init, keepalive: true } : init),
          });
          const nova: Partida = {
            contexto,
            montado: null,
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
            mundoId: mundo.id,
            aoSair: sair,
            aoFalhar: (erro) => parar(paradaDoErro(erro)),
          });
          // O jogo pode ter falhado ainda dentro de `montar`: a partida já foi levada.
          if (partida.current !== nova) {
            await montado.dispose();
            return;
          }
          nova.montado = montado;
          despachar({ tipo: "montado" });
        } catch (erro) {
          if (!atual()) return;
          if (ehErroDoRecreio(erro, "JA_ABERTO")) despachar({ tipo: "ja_aberto" });
          else parar(paradaDoErro(erro));
        }
      });
    },
    [jogo.id, mundo.id, desmontar, parar, sair],
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

  const jogando = estado.fase === "jogando";
  const parada = estado.fase === "parado" ? textoDaParada(estado.parada) : null;

  return (
    <TelaDoJogo titulo={`${jogo.nome}: ${mundo.nome}`}>
      {/* O jogo desenha aqui. Fora do jogo o elemento fica vazio e fora da leitura. */}
      <div ref={palco} data-palco className="absolute inset-0" inert={!jogando} />

      {jogando && (
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
        {estado.fase === "carregando" && <AvisoDoJogo titulo={`Abrindo ${jogo.nome}…`} />}
        {estado.fase === "saindo" && <AvisoDoJogo titulo="Saindo…" />}
        {estado.fase === "ja_aberto" && (
          <AvisoDoJogo
            titulo="Você já está jogando em outro lugar"
            texto="Continuar aqui? O jogo aberto no outro lugar será desconectado."
          >
            <button type="button" className="rb rb-sol" onClick={() => abrir(true)}>
              Continuar aqui
            </button>
            <a href="/estante" className="rb rb-vazado">
              Voltar à estante
            </a>
          </AvisoDoJogo>
        )}
        {parada && (
          <AvisoDoJogo titulo={parada.titulo} texto={parada.texto}>
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
            <a href="/estante" className="rb rb-vazado">
              Voltar à estante
            </a>
          </AvisoDoJogo>
        )}
      </div>
    </TelaDoJogo>
  );
}

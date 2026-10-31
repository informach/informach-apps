"use client";
import { cn } from "@informach/ui/lib/utils";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  FlipHorizontal2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { type Acao, type EstadoMesa, estadoInicial, mesa } from "../mesa-estado";
import { montagemInicial, solucaoComoMontagem } from "../montagem";
import { teclaParaAcao } from "../plano";
import { type Desafio, ehMalha, type Montagem } from "../tipos";
import { verificar } from "../verificar";

const Cena = dynamic(() => import("./cena"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-tinta-suave">Preparando a mesa…</div>
  ),
});

function webglDisponivel() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Props = {
  desafio: Desafio;
  /** Mesma semente, mesma arrumação inicial: a vez da competição não muda ao recarregar. */
  semente: number;
  /** Mostra a solução de referência e trava a mesa. */
  mostrarSolucao?: boolean;
  bloqueada?: boolean;
  aoMontar?: (montagem: Montagem, movimentos: number) => void;
  className?: string;
};

function redutor(desafio: Desafio) {
  return (estado: EstadoMesa, acao: Acao) => mesa(desafio, estado, acao);
}

export function Mesa({ desafio, semente, mostrarSolucao, bloqueada, aoMontar, className }: Props) {
  const reduzir = useMemo(() => redutor(desafio), [desafio]);
  const [estado, despachar] = useReducer(reduzir, undefined, () =>
    estadoInicial(montagemInicial(desafio, semente)),
  );
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const montou = useRef(false);
  const travada = bloqueada || mostrarSolucao;

  useEffect(() => setWebgl(webglDisponivel()), []);
  useEffect(() => {
    if (mostrarSolucao) despachar({ tipo: "definir", montagem: solucaoComoMontagem(desafio) });
  }, [mostrarSolucao, desafio]);

  // Conferência a cada movimento terminado (o arrasto em curso não conta).
  const resultado = useMemo(() => verificar(desafio, estado.montagem), [desafio, estado.montagem]);
  useEffect(() => {
    if (mostrarSolucao || !resultado.montado || montou.current) return;
    montou.current = true;
    aoMontar?.(estado.montagem, estado.movimentos);
  }, [resultado.montado, mostrarSolucao, aoMontar, estado.montagem, estado.movimentos]);

  const agir = useCallback(
    (acao: Acao) => {
      if (travada) return;
      despachar(acao);
    },
    [travada],
  );
  const selecionada = desafio.pecas.find((p) => p.id === estado.selecionada) ?? null;
  const malha = ehMalha(desafio);
  const espaco = desafio.tipo === "malha-espaco" || desafio.tipo === "livre-espaco";
  const podeVirar =
    desafio.tipo === "malha-plano" || (desafio.tipo === "livre-plano" && desafio.espelho);
  const passo = desafio.tipo === "livre-plano" ? 0.1 : 1;

  /**
   * Cada botão de peça age sobre a própria peça: a seleção vai junto, na mesma
   * fila de ações, então teclas rápidas nunca caem na peça anterior.
   */
  const teclado = (pecaId: string) => (evento: React.KeyboardEvent) => {
    if (travada) return;
    const acao = teclaParaAcao(evento.key);
    if (!acao) return;
    if (acao.tipo === "virar" && !podeVirar) return;
    if ((acao.tipo === "girarEixo" || (acao.tipo === "mover" && acao.dz)) && !espaco) return;
    evento.preventDefault();
    despachar({ tipo: "selecionar", id: pecaId });
    agir(acao.tipo === "mover" ? { ...acao, dx: acao.dx * passo, dy: acao.dy * passo } : acao);
    if (acao.tipo === "mover" && desafio.tipo === "livre-plano")
      agir({ tipo: "soltar", id: pecaId });
  };

  const total = desafio.pecas.length;
  const anuncio = resultado.montado
    ? "Montado!"
    : `${resultado.encaixadas} de ${total} ${total === 1 ? "peça encaixada" : "peças encaixadas"}`;

  const botao =
    "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-controle border-2 border-sombra bg-creme px-2 text-sm font-display font-semibold text-tinta shadow-chapa-sm active:translate-y-[3px] active:shadow-none disabled:opacity-50 motion-reduce:active:translate-y-0";
  const semPeca = travada || !selecionada;

  return (
    <div
      className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]", className)}
      data-desafio={desafio.id}
      data-semente={semente}
      data-montado={resultado.montado ? "sim" : "nao"}
      data-movimentos={estado.movimentos}
    >
      <figure className="relative m-0 h-[min(62vh,34rem)] min-h-72 overflow-hidden rounded-card border border-sombra bg-[#ECE6D3]">
        {webgl === false ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <p>
              Este aparelho não mostrou a mesa 3D. Tente em outro navegador ou aparelho; se estiver
              numa competição, quem coordena pode encerrar este desafio.
            </p>
          </div>
        ) : webgl ? (
          <Cena
            desafio={desafio}
            montagem={estado.montagem}
            selecionada={estado.selecionada}
            bloqueada={!!travada}
            aoSelecionar={(id) => despachar({ tipo: "selecionar", id })}
            aoArrastar={(id, x, y) => agir({ tipo: "arrastar", id, x, y })}
            aoSoltar={(id) => agir({ tipo: "soltar", id })}
          />
        ) : null}
        <figcaption className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-creme/90 px-3 py-1 text-sm font-semibold text-tinta-suave">
          {espaco
            ? "Arraste uma peça. Arraste o fundo para girar a mesa."
            : "Arraste uma peça para movê-la."}
        </figcaption>
      </figure>

      <div className="flex flex-col gap-4">
        <p
          aria-live="polite"
          className={cn(
            "rounded-controle px-4 py-2.5 font-display font-semibold",
            resultado.montado ? "bg-verde-solido text-sobre-verde" : "bg-verde-claro text-tinta",
          )}
        >
          {anuncio}
        </p>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-bold text-tinta-suave">Peças</legend>
          <ul className="flex flex-wrap gap-2">
            {desafio.pecas.map((peca) => (
              <li key={peca.id}>
                <button
                  type="button"
                  aria-pressed={peca.id === estado.selecionada}
                  disabled={!!travada}
                  onClick={() => despachar({ tipo: "selecionar", id: peca.id })}
                  onFocus={() => despachar({ tipo: "selecionar", id: peca.id })}
                  onKeyDown={teclado(peca.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm font-bold",
                    peca.id === estado.selecionada
                      ? "border-tinta bg-creme"
                      : "border-sombra bg-papel",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-[4px]"
                    style={{ background: peca.cor }}
                  />
                  {peca.nome}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "girar", sentido: 1 })}
          >
            <RotateCcw size={20} aria-hidden="true" /> Girar
          </button>
          <button
            type="button"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "girar", sentido: -1 })}
          >
            <RotateCw size={20} aria-hidden="true" /> Girar de volta
          </button>
          {podeVirar && (
            <button
              type="button"
              className={botao}
              disabled={semPeca}
              onClick={() => agir({ tipo: "virar" })}
            >
              <FlipHorizontal2 size={20} aria-hidden="true" /> Virar
            </button>
          )}
          {espaco && (
            <>
              <button
                type="button"
                className={botao}
                disabled={semPeca}
                onClick={() => agir({ tipo: "girarEixo", eixo: "x" })}
              >
                Tombar à frente
              </button>
              <button
                type="button"
                className={botao}
                disabled={semPeca}
                onClick={() => agir({ tipo: "girarEixo", eixo: "y" })}
              >
                Tombar de lado
              </button>
              <button
                type="button"
                className={botao}
                disabled={semPeca}
                onClick={() => agir({ tipo: "mover", dx: 0, dy: 0, dz: 1 })}
              >
                <ChevronsUp size={20} aria-hidden="true" /> Subir
              </button>
              <button
                type="button"
                className={botao}
                disabled={semPeca}
                onClick={() => agir({ tipo: "mover", dx: 0, dy: 0, dz: -1 })}
              >
                <ChevronsDown size={20} aria-hidden="true" /> Descer
              </button>
            </>
          )}
        </div>

        <fieldset className="m-0 grid w-fit grid-cols-3 gap-1.5 border-0 p-0">
          <legend className="sr-only">Mover a peça</legend>
          <span />
          <button
            type="button"
            aria-label="Mover para cima"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "mover", dx: 0, dy: passo })}
          >
            <ArrowUp size={20} aria-hidden="true" />
          </button>
          <span />
          <button
            type="button"
            aria-label="Mover para a esquerda"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "mover", dx: -passo, dy: 0 })}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Mover para baixo"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "mover", dx: 0, dy: -passo })}
          >
            <ArrowDown size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Mover para a direita"
            className={botao}
            disabled={semPeca}
            onClick={() => agir({ tipo: "mover", dx: passo, dy: 0 })}
          >
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </fieldset>

        <p className="text-sm text-tinta-suave">
          No teclado, com o foco no nome de uma peça: setas movem, R e E giram
          {podeVirar ? ", F vira" : ""}
          {espaco ? ", X e Y tombam, Page Up e Page Down sobem e descem" : ""}.
          {malha ? "" : " As peças não atravessam umas às outras."}
        </p>
      </div>
    </div>
  );
}

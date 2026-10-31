"use client";
import { cn } from "@informach/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { formatarTempo } from "@/lib/texto";

const RAIO = 84;
const VOLTA = 2 * Math.PI * RAIO;

/**
 * Contagem regressiva em anel. Conta a partir do prazo do servidor corrigido
 * pela diferença de relógio (`desvio`), então recarregar a página não devolve
 * tempo. Nos dez segundos finais o anel fica âmbar e o leitor de tela é
 * avisado; nunca vermelho, porque tempo esgotado não é castigo.
 */
export function Cronometro({
  prazo,
  total,
  desvio = 0,
  pausado = false,
  aoTerminar,
  tamanho = "g",
}: {
  prazo: string;
  total: number;
  /** Relógio do servidor menos o do aparelho, em ms. */
  desvio?: number;
  pausado?: boolean;
  aoTerminar?: () => void;
  tamanho?: "g" | "p";
}) {
  const fim = new Date(prazo).getTime();
  const restante = () => Math.max(0, (fim - (Date.now() + desvio)) / 1000);
  const [segundos, setSegundos] = useState(restante);
  const terminou = useRef(false);
  const aoTerminarRef = useRef(aoTerminar);
  aoTerminarRef.current = aoTerminar;

  // Prazo novo, aviso de fim novo.
  useEffect(() => {
    if (fim) terminou.current = false;
  }, [fim]);
  useEffect(() => {
    if (pausado) return;
    let quadro = 0;
    const passo = () => {
      const s = Math.max(0, (fim - (Date.now() + desvio)) / 1000);
      setSegundos(s);
      if (s <= 0) {
        if (!terminou.current) {
          terminou.current = true;
          aoTerminarRef.current?.();
        }
        return;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [fim, desvio, pausado]);

  const fracao = total > 0 ? Math.min(1, segundos / total) : 0;
  const final = segundos <= 10;
  const px = tamanho === "g" ? 196 : 112;
  return (
    <div
      role="timer"
      aria-label={`Faltam ${Math.ceil(segundos)} segundos`}
      className="relative shrink-0"
      style={{ width: px, height: px }}
    >
      <svg width={px} height={px} viewBox="0 0 196 196" aria-hidden="true">
        <circle
          cx="98"
          cy="98"
          r={RAIO}
          fill="var(--ms-creme)"
          stroke="var(--ms-borda)"
          strokeWidth="16"
        />
        <circle
          cx="98"
          cy="98"
          r={RAIO}
          fill="none"
          stroke={final ? "var(--ms-sol)" : "var(--ms-verde)"}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={VOLTA}
          strokeDashoffset={VOLTA * (1 - fracao)}
          transform="rotate(-90 98 98)"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 grid place-items-center font-display font-semibold tabular-nums text-tinta",
          tamanho === "g" ? "text-5xl" : "text-2xl",
        )}
      >
        {formatarTempo(segundos)}
      </span>
      {final && segundos > 0 && (
        <span className="sr-only" aria-live="assertive">
          Últimos dez segundos.
        </span>
      )}
    </div>
  );
}

"use client";

import { cn } from "@informach/ui/lib/utils";
import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Leitura em voz alta pela síntese do próprio navegador.
 *
 * Custo zero e nenhum dado sai do aparelho: não há requisição, gravação nem
 * texto enviado para terceiros. É opt-in por construção — nada é falado até
 * alguém apertar o botão.
 *
 * O que o botão lê é sempre enunciado, pista ou explicação. Nunca alternativa
 * nem texto de solução: a fala não pode entregar o que a questão avalia.
 *
 * `aoUsar` existe para o modo avaliação: ler o enunciado pode alterar o
 * construto medido, então o player registra o apoio na sessão em vez de
 * apresentar o resultado como leitura autônoma.
 */
export function LerEmVoz({
  texto,
  rotulo = "Ouvir o enunciado",
  aoUsar,
  disabled = false,
  className,
}: {
  texto: string;
  rotulo?: string;
  aoUsar?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [disponivel, setDisponivel] = useState(false);
  const [falando, setFalando] = useState(false);
  const montado = useRef(true);
  const lido = useRef(texto);

  useEffect(() => {
    montado.current = true;
    setDisponivel(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      montado.current = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window)
        window.speechSynthesis.cancel();
    };
  }, []);

  /* Trocar de questão interrompe a fala anterior: ouvir o enunciado antigo
     enquanto o novo já está na tela é pior do que silêncio. */
  useEffect(() => {
    if (lido.current === texto) return;
    lido.current = texto;
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setFalando(false);
  }, [texto]);

  if (!disponivel) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={falando ? "Parar a leitura" : rotulo}
      title={falando ? "Parar a leitura" : rotulo}
      aria-pressed={falando}
      onClick={() => {
        const sintese = window.speechSynthesis;
        sintese.cancel();
        if (falando) {
          setFalando(false);
          return;
        }
        const fala = new SpeechSynthesisUtterance(texto);
        fala.lang = "pt-BR";
        fala.rate = 0.95;
        fala.onend = () => {
          if (montado.current) setFalando(false);
        };
        fala.onerror = () => {
          if (montado.current) setFalando(false);
        };
        setFalando(true);
        aoUsar?.();
        sintese.speak(fala);
      }}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border-2 transition-transform duration-100 active:translate-y-0.5 disabled:opacity-60",
        falando
          ? "border-uva-solido bg-uva-claro text-tinta"
          : "border-sombra bg-creme text-tinta-suave hover:text-tinta",
        className,
      )}
    >
      {falando ? (
        <Square size={16} strokeWidth={3} className="fill-current" aria-hidden="true" />
      ) : (
        <Volume2 size={20} aria-hidden="true" />
      )}
    </button>
  );
}

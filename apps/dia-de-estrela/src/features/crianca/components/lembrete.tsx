"use client";
import { BellRing, Check, Package, ThumbsUp, Volume2 } from "lucide-react";
import { useState } from "react";
import { Lumi } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { relogioDa } from "@/domain/relogio";
import { type EventoLembrete, formatarHora, instanteDa, MIN } from "@/domain/rotina";

/**
 * O lembrete ocupa a tela toda, em qualquer aparelho. Diz o que vem, o que
 * separar antes e o que vai acontecer se não for marcada (sem surpresas).
 */
export function Lembrete({
  evento,
  nome,
  agoraMs,
  timezone,
  ajustes,
  aoOuvir,
  aoFechar,
  aoComecar,
  aoMarcar,
}: {
  evento: EventoLembrete;
  nome: string;
  agoraMs: number;
  timezone: string;
  ajustes: { warnBefore: number; repeatEvery: number; alertAfter: number };
  aoOuvir: () => void;
  aoFechar: () => void;
  aoComecar: () => void;
  aoMarcar: () => void;
}) {
  const [separados, setSeparados] = useState<Set<string>>(() => new Set());
  const { tarefa, tipo } = evento;
  const aviso = tipo === "aviso";
  const relogio = relogioDa(agoraMs, timezone);
  const falta = Math.max(0, instanteDa(tarefa, relogio) - agoraMs);
  const minutos = Math.ceil(falta / MIN);
  const anel = aviso ? falta / (Math.max(1, ajustes.warnBefore) * MIN) : 1;
  const proximo = formatarHora(agoraMs + ajustes.repeatEvery * MIN, timezone);
  const paisJaSabem = evento.repeticao + 1 >= ajustes.alertAfter;
  const raio = 96;
  const volta = 2 * Math.PI * raio;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Lembrete: ${tarefa.title}`}
      className="entra fixed inset-0 z-50 flex flex-col items-center gap-4 overflow-y-auto bg-[#2b5cb8] px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white sm:gap-5 sm:px-8"
    >
      <div className="flex w-full max-w-5xl items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-extrabold tracking-[0.1em]">
          <BellRing className="size-5" aria-hidden="true" />
          {aviso
            ? `AVISO · DAQUI A ${minutos} ${minutos === 1 ? "MINUTO" : "MINUTOS"}`
            : evento.repeticao > 0
              ? "LEMBRETE · AINDA FALTA"
              : `É AGORA · ${tarefa.time}`}
        </span>
        <span className="font-display text-2xl font-extrabold">
          {formatarHora(agoraMs, timezone)}
        </span>
      </div>

      <div className="flex items-center gap-4 sm:gap-8">
        <Lumi tamanho={110} humor={aviso ? "calma" : "contente"} className="hidden sm:block" />
        <div className="relative size-44 sm:size-52">
          <svg viewBox="0 0 220 220" className="size-full" aria-hidden="true">
            <circle
              cx="110"
              cy="110"
              r={raio}
              fill="none"
              stroke="rgba(255,255,255,.18)"
              strokeWidth="18"
            />
            <circle
              cx="110"
              cy="110"
              r={raio}
              fill="none"
              stroke="#FFC22E"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={volta}
              strokeDashoffset={volta * (1 - Math.min(1, Math.max(0, anel)))}
              transform="rotate(-90 110 110)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Icone nome={tarefa.icon} className="size-14" strokeWidth={2.2} />
            {aviso && <strong className="font-display text-3xl leading-none">{minutos} min</strong>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl text-center">
        <h1 className="font-display text-4xl leading-[1.05] font-extrabold sm:text-6xl">
          {aviso
            ? `Daqui a pouco: ${tarefa.title.toLowerCase()}`
            : `Hora de: ${tarefa.title.toLowerCase()}`}
        </h1>
        <p className="mt-2 text-xl font-bold text-[#dce8fa]">
          {aviso
            ? "Pode terminar o que está fazendo com calma."
            : evento.repeticao > 0
              ? `${nome}, essa tarefa ainda não foi marcada. Vamos lá?`
              : `Vamos lá, ${nome}!`}
        </p>
      </div>

      {tarefa.needs.length > 0 && (
        <div className="flex w-full max-w-3xl flex-col items-center gap-2">
          <p className="text-sm font-extrabold tracking-[0.12em] text-[#dce8fa]">
            SEPARE ANTES · TOQUE QUANDO PEGAR
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {tarefa.needs.map((n) => {
              const ok = separados.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={ok}
                  onClick={() =>
                    setSeparados((s) => {
                      const novo = new Set(s);
                      if (ok) novo.delete(n);
                      else novo.add(n);
                      return novo;
                    })
                  }
                  className="flex min-h-16 items-center gap-3 rounded-3xl bg-white px-4 py-2 text-tinta shadow-[0_6px_0_#1e4690]"
                >
                  <Package className="size-6 text-ceu-escuro" aria-hidden="true" />
                  <span className="font-display text-xl font-extrabold">{n}</span>
                  <span
                    className={`grid size-8 place-items-center rounded-full ${ok ? "bg-folha-botao text-white" : "border-[3px] border-[#d6e0ee]"}`}
                  >
                    {ok && <Check className="size-5" strokeWidth={4} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={aoOuvir}
          className="b3 b3-lg border-[3px] border-white/50 bg-transparent text-white [--b3-sombra:transparent]"
        >
          <Volume2 className="size-6" aria-hidden="true" /> Ouvir
        </button>
        {aviso ? (
          <button type="button" onClick={aoFechar} className="b3 b3-estrela b3-lg sm:min-w-80">
            <ThumbsUp className="size-6" aria-hidden="true" /> Entendi, já vou!
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={tarefa.steps.length ? aoComecar : aoFechar}
              className="b3 b3-estrela b3-lg sm:min-w-72"
            >
              <ThumbsUp className="size-6" aria-hidden="true" />{" "}
              {tarefa.steps.length ? "Vamos lá!" : "Entendi!"}
            </button>
            <button
              type="button"
              onClick={aoMarcar}
              className="b3 b3-lg border-[3px] border-white/50 bg-transparent text-white [--b3-sombra:transparent]"
            >
              <Check className="size-6" strokeWidth={3} aria-hidden="true" /> Já fiz!
            </button>
          </>
        )}
      </div>
      <p className="text-center font-bold text-[#dce8fa]">
        {aviso
          ? `Às ${tarefa.time} eu aviso que chegou a hora.`
          : paisJaSabem
            ? `Se não for marcada, eu lembro de novo às ${proximo}. Os pais já foram avisados.`
            : `Se não for marcada, eu lembro de novo às ${proximo}.`}
      </p>
    </div>
  );
}

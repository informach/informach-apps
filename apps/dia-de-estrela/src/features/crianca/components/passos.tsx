"use client";
import { ArrowLeft, Check, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Estrela, Lumi } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import type { Tarefa } from "@/domain/rotina";
import { falar, pararVoz } from "../som";

const incentivos = ["Muito bem!", "Isso aí!", "Mandou bem!", "Quase lá!", "Boa!"];

/** Um passo por tela, lido em voz alta, com o próximo sempre à vista. */
export function PassoAPasso({
  tarefa,
  nome,
  voz,
  podeTerminar,
  aoVoltar,
  aoTerminar,
}: {
  tarefa: Tarefa;
  nome: string;
  voz: boolean;
  podeTerminar: boolean;
  aoVoltar: () => void;
  aoTerminar: () => void;
}) {
  const [i, setI] = useState(0);
  const passo = tarefa.steps[i];
  const ultimo = i === tarefa.steps.length - 1;
  const depois = tarefa.steps[i + 1];

  useEffect(() => {
    if (voz && passo) falar(passo.detail ? `${passo.text}. ${passo.detail}` : passo.text);
    return pararVoz;
  }, [voz, passo]);

  if (!passo) return null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar para Hoje"
          className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-linha-forte bg-white shadow-[0_4px_0_var(--de-linha-forte)]"
        >
          <ArrowLeft className="size-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-[0.12em] text-tinta-suave">
            {tarefa.title.toUpperCase()} · {tarefa.time}
          </p>
          <h1 className="font-display text-3xl font-extrabold">
            Passo {i + 1} de {tarefa.steps.length}
          </h1>
        </div>
        <ol className="flex items-center gap-1.5" aria-hidden="true">
          {tarefa.steps.map((p, k) => (
            <li
              key={`${p.text}-${k.toString()}`}
              className={`grid place-items-center rounded-full font-display font-extrabold ${
                k < i
                  ? "size-9 bg-folha-botao text-white"
                  : k === i
                    ? "size-11 bg-ceu-escuro text-lg text-white"
                    : "size-9 border-[3px] border-linha-forte bg-white text-tinta-suave"
              }`}
            >
              {k < i ? <Check className="size-5" strokeWidth={3.5} /> : k + 1}
            </li>
          ))}
          <li className="grid size-9 place-items-center rounded-full bg-estrela-clara">
            <Estrela tamanho={20} />
          </li>
        </ol>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <div className="relative grid min-h-64 place-items-center rounded-[2.5rem] bg-[#e6f0fd] p-6">
          <span className="absolute top-5 left-5 grid size-16 place-items-center rounded-full bg-ceu-escuro font-display text-3xl font-extrabold text-white shadow-[0_5px_0_#1a4a86]">
            {i + 1}
          </span>
          <span className="grid size-48 place-items-center rounded-full bg-white text-ceu-escuro shadow-[0_10px_0_#cfe0f6] sm:size-64">
            <Icone nome={tarefa.icon} className="size-24 sm:size-32" strokeWidth={1.8} />
          </span>
          <div className="absolute right-4 bottom-4 flex items-end gap-1">
            {i > 0 && (
              <span className="mb-14 rounded-2xl bg-white px-3 py-2 font-extrabold">
                {incentivos[i % incentivos.length]}
              </span>
            )}
            <Lumi tamanho={96} humor={i > 0 ? "feliz" : "contente"} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <h2 className="font-display text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
            {passo.text}
          </h2>
          {passo.detail && (
            <p className="text-xl font-bold text-tinta-suave sm:text-2xl">{passo.detail}</p>
          )}
          <div>
            <button
              type="button"
              className="b3 b3-branco"
              onClick={() => falar(passo.detail ? `${passo.text}. ${passo.detail}` : passo.text)}
            >
              <Volume2 className="size-5" aria-hidden="true" /> Ouvir de novo
            </button>
          </div>
          <div className="flex-1" />
          <div className="chapa flex items-center gap-3 px-5 py-3">
            <span className="text-sm font-extrabold tracking-[0.12em] text-tinta-suave">
              DEPOIS
            </span>
            <span className="text-lg font-bold">
              {depois ? depois.text : `Pronto, ${nome}! Você ganha +${tarefa.stars} estrelas`}
            </span>
          </div>
          {ultimo && !podeTerminar && (
            <p className="font-bold text-tinta-suave">
              Essa tarefa ainda não chegou. Os pais podem marcar por você.
            </p>
          )}
          <button
            type="button"
            className="b3 b3-folha b3-lg w-full"
            disabled={ultimo && !podeTerminar}
            onClick={() => (ultimo ? aoTerminar() : setI(i + 1))}
          >
            <Check className="size-7" strokeWidth={3.5} aria-hidden="true" />
            {ultimo ? "Terminei!" : "Feito! Próximo passo"}
          </button>
          {i > 0 && (
            <button
              type="button"
              className="self-center p-2 font-extrabold text-ceu-escuro"
              onClick={() => setI(i - 1)}
            >
              Voltar um passo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

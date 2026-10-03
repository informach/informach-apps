"use client";

import type { LabToolProps } from "../types";
import { buttonClass, panelClass, Stat } from "./controls";
import { parseProcess, processDefinition, processValues } from "./processes";

export function ProcessTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseProcess(launch, raw);
  const { values, history } = processValues(launch, state.actions);
  const slots = values.map((value, position) => ({
    slot: `posição-${position + 1}`,
    position,
    value,
  }));
  const isCounts = launch.mode === "processo-camaleoes" || launch.mode === "processo-diferenca";
  const selectedFirst = state.selected[0];
  const selectedSecond = state.selected[1];
  const canApply =
    state.actions.length < 50 &&
    selectedFirst !== undefined &&
    selectedSecond !== undefined &&
    (!isCounts || ((values[selectedFirst] ?? 0) > 0 && (values[selectedSecond] ?? 0) > 0));
  const describe = (value: number, position: number) =>
    launch.mode === "processo-copos"
      ? `Copo ${position + 1}: ${value ? "para cima ↑" : "para baixo ↓"}`
      : launch.mode === "processo-camaleoes"
        ? `${["Vermelhos", "Verdes", "Azuis"][position]}: ${value}`
        : launch.mode === "processo-diferenca"
          ? `Pilha ${position + 1}: ${value} fichas`
          : launch.mode === "processo-sinais"
            ? value === 1
              ? "+"
              : "−"
            : launch.mode === "processo-bolas"
              ? value === 1
                ? "Branca ○"
                : "Preta ●"
              : String(value);
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Escolha dois objetos distintos. A operação sempre segue a regra publicada; o histórico pode
        ser desfeito.
      </p>
      <div className="flex flex-wrap gap-3">
        {slots.map((slot) => (
          <button
            type="button"
            key={slot.slot}
            className={`${buttonClass} ${state.selected.includes(slot.position) ? "bg-creme ring-2 ring-verde" : ""}`}
            aria-pressed={state.selected.includes(slot.position)}
            onClick={() =>
              onChange({
                ...state,
                selected: state.selected.includes(slot.position)
                  ? state.selected.filter((position) => position !== slot.position)
                  : state.selected.length < 2
                    ? [...state.selected, slot.position]
                    : [state.selected[1], slot.position],
              })
            }
          >
            {describe(slot.value, slot.position)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={!canApply}
          onClick={() => {
            if (selectedFirst !== undefined && selectedSecond !== undefined)
              onChange({
                actions: [...state.actions, { first: selectedFirst, second: selectedSecond }],
                selected: [],
              });
          }}
        >
          Aplicar uma operação
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={state.actions.length === 0}
          onClick={() => onChange({ actions: state.actions.slice(0, -1), selected: [] })}
        >
          Desfazer última operação
        </button>
      </div>
      {!hideResults && (
        <>
          <Stat>{processDefinition(launch).invariant}</Stat>
          <div className={panelClass}>
            <h4 className="font-bold">O que comparar entre os estados</h4>
            <p className="mt-2 text-sm">
              Soma: {values.reduce((sum, value) => sum + value, 0)}.{" "}
              {launch.mode === "processo-copos" &&
                `Copos para cima: ${values.filter((value) => value === 1).length}.`}
              {launch.mode === "processo-sinais" || launch.mode === "processo-bolas"
                ? `Quantidade de ${launch.mode === "processo-bolas" ? "pretas" : "negativos"}: ${values.filter((value) => value === -1).length}. Produto: ${values.reduce((product, value) => product * value, 1)}.`
                : ""}
              {launch.mode === "processo-diferenca" &&
                `Diferença: ${(values[0] ?? 0) - (values[1] ?? 0)}.`}
              {launch.mode === "processo-camaleoes" &&
                `Restos das diferenças por 3: ${[(values[0] ?? 0) - (values[1] ?? 0), (values[1] ?? 0) - (values[2] ?? 0)].map((difference) => ((difference % 3) + 3) % 3).join(", ")}.`}
            </p>
          </div>
        </>
      )}
      <details>
        <summary className="cursor-pointer font-semibold underline">
          Histórico completo da investigação
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {history
            .map((snapshot, step) => ({ id: `estado-após-${step}-operações`, snapshot }))
            .map((entry) => (
              <li key={entry.id}>{entry.snapshot.join(", ")}</li>
            ))}
        </ol>
      </details>
      <p className="text-xs">
        Os números −1 e +1 codificam cores/sinais quando apropriado; não são quantidades físicas
        negativas. Uma propriedade preservada pode provar impossibilidade, mas sua ausência não
        garante que qualquer alvo seja alcançável.
      </p>
    </div>
  );
}

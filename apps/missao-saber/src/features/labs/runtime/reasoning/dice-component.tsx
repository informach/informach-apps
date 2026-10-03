"use client";
import type { LabToolProps } from "../types";
import { decimal, fraction } from "./common";
import { buttonClass, Controls, NumberField, panelClass, Stat } from "./controls";
import { diceMetrics, diceOutcomes, parseDice } from "./dice";
export function DiceTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseDice(launch, raw);
  const metrics = diceMetrics(launch, state);
  const outcomes = diceOutcomes(launch, state);
  return (
    <div className="grid gap-4">
      <Controls>
        <NumberField
          label="Faces de cada dado, numeradas a partir de 1"
          value={state.faces}
          min={2}
          max={8}
          onChange={(faces) =>
            onChange({
              ...state,
              faces,
              sum: Math.min(state.sum, faces * 2),
              face: Math.min(state.face, faces),
            })
          }
        />
        <NumberField
          label={launch.mode === "dados-condicional" ? "Soma conhecida" : "Soma investigada"}
          value={state.sum}
          min={2}
          max={state.faces * 2}
          onChange={(sum) => onChange({ ...state, sum })}
        />
        {launch.mode === "dados-condicional" && (
          <NumberField
            label="Face em pelo menos um dos dados"
            value={state.face}
            min={1}
            max={state.faces}
            onChange={(face) => onChange({ ...state, face })}
          />
        )}
      </Controls>
      <p className="text-sm">
        Um resultado é um par ordenado (primeiro dado, segundo dado). Todos os pares têm a mesma
        chance antes de aplicar uma condição.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {outcomes.map((outcome) => (
          <div
            className={`${panelClass} p-2 text-center text-xs ${!hideResults && outcome.eligible && outcome.favorable ? "bg-creme" : ""}`}
            key={outcome.id}
          >
            <strong>
              ({outcome.first}, {outcome.second})
            </strong>
            {!hideResults && (
              <>
                <p>Soma {outcome.first + outcome.second}</p>
                <p>
                  {!outcome.eligible
                    ? "Fora da condição"
                    : outcome.favorable
                      ? "Favorável"
                      : "Não favorável"}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
      {!hideResults && (
        <Stat>
          Modelo: {fraction(metrics.favorable, metrics.total)} ={" "}
          {decimal(metrics.theoretical * 100)}
          %. A condição define quais pares entram no denominador.
        </Stat>
      )}
      <Controls>
        <NumberField
          label="Rodadas da amostra"
          value={state.trials}
          min={1}
          max={1000}
          onChange={(trials) => onChange({ ...state, trials })}
        />
        <button
          className={buttonClass}
          type="button"
          onClick={() => onChange({ ...state, seed: (state.seed % 2147483645) + 1 })}
        >
          Gerar outra amostra com o mesmo tamanho
        </button>
      </Controls>
      <Stat>
        A soma {state.sum} apareceu {metrics.observed} vezes em {state.trials} rodadas.
        {!hideResults && (
          <>
            {" "}
            Frequência {fraction(metrics.observed, state.trials)}. Quantidade média esperada para
            essa soma:{" "}
            {decimal(
              (outcomes.filter((outcome) => outcome.first + outcome.second === state.sum).length /
                outcomes.length) *
                state.trials,
              4,
            )}
            . A amostra não precisa atingir exatamente a média.
          </>
        )}
      </Stat>
    </div>
  );
}

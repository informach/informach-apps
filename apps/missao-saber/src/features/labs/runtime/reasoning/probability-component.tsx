"use client";

import type { LabToolProps } from "../types";
import { cardsTool } from "./cards";
import { CardsTool } from "./cards-component";
import { decimal, fraction, money } from "./common";
import {
  buttonClass,
  Controls,
  MoneyField,
  NumberField,
  panelClass,
  Stat,
  Toggle,
} from "./controls";
import { diceTool } from "./dice";
import { DiceTool } from "./dice-component";
import {
  parseProbability,
  probabilityDefinition,
  probabilityModel,
  probabilityOutcomes,
  simulateProbability,
} from "./probability";

export function ProbabilityTool({
  launch,
  state: raw,
  onChange,
  hideResults = false,
}: LabToolProps) {
  if (cardsTool.modes.includes(launch.mode))
    return <CardsTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />;
  if (diceTool.modes.includes(launch.mode))
    return <DiceTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />;
  const state = parseProbability(launch, raw);
  const definition = probabilityDefinition(launch);
  const outcomes = probabilityOutcomes(launch, state);
  const model = probabilityModel(launch, state);
  const sample = simulateProbability(launch, state);
  const minimum = definition.event === "red" || state.replacement ? 1 : 2;
  const branches = ["R–R", "R–A", "A–R", "A–A"];
  const redBalls = Array.from({ length: state.red }, (_, index) => `R${index + 1}`);
  const blueBalls = Array.from({ length: state.blue }, (_, index) => `A${index + 1}`);
  return (
    <div className="grid gap-4">
      <Controls>
        <NumberField
          label="Fichas R (vermelhas)"
          value={state.red}
          min={Math.max(0, minimum - state.blue)}
          max={6}
          onChange={(red) => onChange({ ...state, red, trials: 0 })}
        />
        <NumberField
          label="Fichas A (azuis)"
          value={state.blue}
          min={Math.max(definition.event === "conditional" ? 1 : 0, minimum - state.red)}
          max={6}
          onChange={(blue) => onChange({ ...state, blue, trials: 0 })}
        />
      </Controls>
      <figure className={`${panelClass} flex flex-wrap gap-2`}>
        <figcaption className="sr-only">Fichas da urna, todas com a mesma chance</figcaption>
        {redBalls.map((ball) => (
          <span
            key={ball}
            className="flex size-10 items-center justify-center rounded-full border-2 border-sombra bg-red-100 font-bold text-red-950"
          >
            {ball}
          </span>
        ))}
        {blueBalls.map((ball) => (
          <span
            key={ball}
            className="flex size-10 items-center justify-center rounded-full border-2 border-sombra bg-blue-100 font-bold text-blue-950"
          >
            {ball}
          </span>
        ))}
      </figure>
      {definition.event !== "red" && launch.mode !== "contagem-combinatoria" && (
        <Toggle
          label="Recolocar a primeira ficha antes da segunda retirada"
          checked={state.replacement}
          onChange={(replacement) =>
            onChange({
              ...state,
              replacement,
              red: !replacement && state.red + state.blue < 2 ? state.red + 1 : state.red,
              trials: 0,
            })
          }
        />
      )}
      <p className="text-sm">
        Cada ficha física é igualmente provável.{" "}
        {definition.event === "red"
          ? "Cada rodada retira uma ficha e a devolve para a próxima rodada."
          : `Duas retiradas ${state.replacement ? "com" : "sem"} reposição. No início de uma nova rodada, a urna sempre volta a ter todas as fichas.`}
      </p>
      {definition.event === "gain" && (
        <Controls>
          <MoneyField
            label="Prêmio se saírem duas R"
            cents={state.prizeCents}
            max={10000}
            onChange={(prizeCents) => onChange({ ...state, prizeCents })}
          />
          <MoneyField
            label="Entrada paga em toda rodada"
            cents={state.ticketCents}
            max={10000}
            onChange={(ticketCents) => onChange({ ...state, ticketCents })}
          />
        </Controls>
      )}
      {!hideResults && definition.event !== "red" && (
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">
              Árvore agrupada por cores (não são quatro ramos equiprováveis)
            </caption>
            <thead>
              <tr>
                <th className="p-2">Caminho</th>
                <th className="p-2">Pares físicos</th>
                <th className="p-2">Probabilidade antes da condição</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => {
                const count = outcomes.filter(
                  (outcome) => `${outcome.first[0]}–${outcome.second?.[0]}` === branch,
                ).length;
                return (
                  <tr key={branch} className="border-t border-sombra">
                    <th className="p-2">{branch}</th>
                    <td className="p-2">{count}</td>
                    <td className="p-2">{fraction(count, outcomes.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-semibold underline">
          Ver cada resultado físico e a condição
        </summary>
        <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-auto p-1 sm:grid-cols-5">
          {outcomes.map((outcome) => (
            <div key={outcome.id} className={`${panelClass} p-2 text-xs`}>
              <strong>{outcome.id}</strong>
              {!hideResults && (
                <p>
                  {!outcome.eligible
                    ? "Fora da condição"
                    : outcome.favorable
                      ? "Favorável"
                      : "Da condição, não favorável"}
                </p>
              )}
            </div>
          ))}
        </div>
      </details>
      {!hideResults && (
        <Stat>
          Modelo teórico: {model.favorable} favoráveis em {model.total} resultados da condição ={" "}
          {fraction(model.favorable, model.total)} = {decimal(model.probability * 100)}%.{" "}
          {definition.event === "gain" &&
            `Ganho médio teórico: ${money(model.probability * state.prizeCents - state.ticketCents)} por rodada.`}
        </Stat>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          type="button"
          disabled={state.trials >= 1000}
          onClick={() => onChange({ ...state, trials: Math.min(1000, state.trials + 10) })}
        >
          Simular mais 10 rodadas
        </button>
        <button
          className={buttonClass}
          type="button"
          disabled={state.trials >= 1000}
          onClick={() => onChange({ ...state, trials: Math.min(1000, state.trials + 100) })}
        >
          Simular mais 100 rodadas
        </button>
        <button
          className={buttonClass}
          type="button"
          onClick={() => onChange({ ...state, trials: 0, seed: (state.seed % 2147483645) + 1 })}
        >
          Começar outra amostra
        </button>
      </div>
      <Stat>
        Amostra: {state.trials} rodadas; {sample.eligible} respeitam a condição; {sample.favorable}{" "}
        são favoráveis. Frequência observada:{" "}
        {sample.frequency === null
          ? "ainda sem resultados da condição"
          : `${decimal(sample.frequency * 100)}%`}
        . Uma amostra válida pode ficar acima ou abaixo da teoria.
      </Stat>
      {sample.recent.length > 0 && (
        <p className="text-xs">
          Últimas rodadas: {sample.recent.map((outcome) => outcome.id).join("; ")}. A semente salva
          permite continuar a mesma simulação.
        </p>
      )}
    </div>
  );
}

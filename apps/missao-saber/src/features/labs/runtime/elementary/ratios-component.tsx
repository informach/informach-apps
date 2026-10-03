"use client";
import type { LabToolProps } from "../types";
import { format } from "./math";
import { RatioDoubleLine, RecipeComparison } from "./ratio-representations";
import {
  parseRatios,
  ratioDefinition,
  ratiosSummary,
  ratioValue,
  successiveValues,
} from "./ratios";
import { NumberControl, Output, panelClass } from "./ui";

function ValueBar({
  label,
  value,
  maximum,
  hideValue,
}: {
  label: string;
  value: number;
  maximum: number;
  hideValue?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">
        {label}: {hideValue ? "?" : format(value)}
      </p>
      <div className="h-8 rounded border border-tinta bg-creme">
        <div
          className="h-full bg-[var(--ms-verde)]"
          style={{ width: `${Math.max(0, Math.min(100, (value / maximum) * 100))}%` }}
        />
      </div>
    </div>
  );
}
export function RatiosTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseRatios(launch, raw);
  const kind = ratioDefinition(launch).kind;
  const equalRates = launch.mode === "aumento-e-desconto";
  const update = (changes: Partial<typeof state>) => onChange({ ...state, ...changes });
  const stages = successiveValues(state);
  const maximum = Math.max(
    state.base * 2,
    stages.intermediate,
    stages.final,
    ratioValue(launch, state),
    kind === "variation" ? state.otherBase : 0,
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {!["share", "inverse", "points", "percent-of-percent", "fraction"].includes(kind) && (
          <NumberControl
            label={
              kind === "recover-part"
                ? "Quantidade conhecida na parte"
                : kind === "unknown"
                  ? "Valor depois da mudança"
                  : kind === "unit"
                    ? "Distância em quilômetros"
                    : "Valor total de referência"
            }
            value={state.base}
            min={10}
            max={2000}
            step={10}
            onChange={(base) => update({ base })}
          />
        )}{" "}
        {["percent", "points", "percent-of-percent", "fraction", "recover-part"].includes(kind) && (
          <NumberControl
            label="Porcentagem da base"
            value={state.percent}
            min={1}
            max={kind === "percent-of-percent" || kind === "recover-part" ? 100 : 200}
            onChange={(percent) => update({ percent })}
          />
        )}{" "}
        {(kind === "points" || kind === "percent-of-percent") && (
          <NumberControl
            label={kind === "points" ? "Segunda taxa em %" : "Porcentagem dentro do subgrupo"}
            value={state.otherPercent}
            min={0}
            max={kind === "percent-of-percent" ? 100 : 200}
            onChange={(otherPercent) => update({ otherPercent })}
          />
        )}
        {kind === "variation" && (
          <NumberControl
            label="Valor depois da mudança"
            value={state.otherBase}
            min={0}
            max={4000}
            onChange={(otherBase) => update({ otherBase })}
          />
        )}
        {["successive", "tax", "unknown"].includes(kind) && (
          <NumberControl
            label={
              equalRates
                ? "Taxa do aumento e do desconto em %"
                : kind === "unknown"
                  ? "Variação aplicada em %"
                  : "Primeira mudança em %"
            }
            value={state.change}
            min={equalRates ? 0 : -90}
            max={equalRates ? 90 : kind === "tax" ? 0 : 200}
            onChange={(change) =>
              update(equalRates ? { change, secondChange: -change } : { change })
            }
          />
        )}{" "}
        {["successive", "tax"].includes(kind) && !equalRates && (
          <NumberControl
            label="Segunda mudança em %"
            value={state.secondChange}
            min={kind === "tax" ? 0 : -90}
            max={200}
            onChange={(secondChange) => update({ secondChange })}
          />
        )}{" "}
        {["share", "partition", "unit"].includes(kind) && (
          <NumberControl
            label={
              kind === "unit"
                ? launch.mode === "taxa-unitaria"
                  ? "Litros consumidos"
                  : "Tempo em horas"
                : "Partes de A"
            }
            value={state.partA}
            min={1}
            max={12}
            onChange={(partA) => update({ partA })}
          />
        )}{" "}
        {["share", "partition"].includes(kind) && (
          <NumberControl
            label="Partes de B"
            value={state.partB}
            min={1}
            max={12}
            onChange={(partB) => update({ partB })}
          />
        )}{" "}
        {kind === "share" && (
          <NumberControl
            label="Somar a cada ingrediente"
            value={state.addition}
            min={0}
            max={12}
            onChange={(addition) => update({ addition })}
          />
        )}
        {kind === "share" && (
          <NumberControl
            label="Multiplicar a receita por"
            value={state.factor}
            min={1}
            max={8}
            onChange={(factor) => update({ factor })}
          />
        )}{" "}
        {kind === "inverse" && (
          <>
            <NumberControl
              label="Trabalho em pessoa-horas"
              value={state.work}
              min={12}
              max={120}
              onChange={(work) => update({ work })}
            />
            <NumberControl
              label="Pessoas na equipe"
              value={state.workers}
              min={1}
              max={12}
              onChange={(workers) => update({ workers })}
            />
          </>
        )}
      </div>
      <RatioDoubleLine launch={launch} state={state} hideResults={hideResults} />
      {kind === "share" && <RecipeComparison state={state} hideResults={hideResults} />}
      <div className={`${panelClass} space-y-3`}>
        {kind === "points" || kind === "percent-of-percent" || kind === "fraction" ? (
          <>
            <ValueBar label="Inteiro de referência: 100%" value={100} maximum={200} />
            <ValueBar label="Primeira porcentagem" value={state.percent} maximum={200} />
            {kind === "points" && (
              <ValueBar label="Segunda porcentagem" value={state.otherPercent} maximum={200} />
            )}
            {kind === "percent-of-percent" && (
              <ValueBar
                label="Parte do grupo inteiro depois das duas seleções"
                hideValue={hideResults}
                value={ratioValue(launch, state)}
                maximum={200}
              />
            )}
            <p className="text-sm">
              Todas as barras usam a mesma escala. Cem por cento corresponde a um inteiro.
            </p>
          </>
        ) : kind === "share" || kind === "partition" ? (
          <>
            <p className="font-semibold">O todo é A + B</p>
            <div className="flex min-h-14 overflow-hidden rounded border-2 border-tinta">
              <div
                style={{ flex: state.partA }}
                className="flex items-center justify-center bg-emerald-100 p-2 font-bold text-emerald-950"
              >
                A: {state.partA * state.factor}
              </div>
              <div
                style={{ flex: state.partB }}
                className="flex items-center justify-center bg-amber-100 p-2 font-bold text-amber-950"
              >
                B: {state.partB * state.factor}
              </div>
            </div>
            <p className="text-sm">
              A:B = {state.partA}:{state.partB}; A:todo = {state.partA}:{state.partA + state.partB}.
            </p>
          </>
        ) : kind === "inverse" ? (
          <table className="w-full text-left text-sm">
            <caption className="mb-2 font-semibold">O produto pessoas × horas é constante</caption>
            <thead>
              <tr>
                <th>Pessoas</th>
                <th>Horas</th>
                <th>Pessoa-horas</th>
              </tr>
            </thead>
            <tbody>
              {[1, state.workers, state.workers + 1]
                .filter((value, index, values) => values.indexOf(value) === index)
                .map((workers) => (
                  <tr key={workers}>
                    <td>{workers}</td>
                    <td>{hideResults ? "?" : format(state.work / workers)}</td>
                    <td>{state.work}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <>
            <ValueBar
              label={
                kind === "recover-part"
                  ? "Quantidade conhecida na parte"
                  : kind === "unknown"
                    ? "Valor conhecido após a mudança"
                    : "Base da comparação"
              }
              value={state.base}
              maximum={maximum}
            />
            {kind === "percent" && (
              <ValueBar
                label={`${state.percent}% da base`}
                hideValue={hideResults}
                value={ratioValue(launch, state)}
                maximum={maximum}
              />
            )}{" "}
            {(kind === "successive" || kind === "tax") && (
              <>
                <ValueBar
                  label={`Depois de ${state.change}%`}
                  hideValue={hideResults}
                  value={stages.intermediate}
                  maximum={maximum}
                />
                <ValueBar
                  label={`Depois de mais ${state.secondChange}%`}
                  hideValue={hideResults}
                  value={stages.final}
                  maximum={maximum}
                />
              </>
            )}{" "}
            {kind === "unit" && (
              <ValueBar
                label="Quantidade por uma unidade"
                hideValue={hideResults}
                value={ratioValue(launch, state)}
                maximum={maximum}
              />
            )}{" "}
            {kind === "unknown" && (
              <p>Valor final = base desconhecida × {format(1 + state.change / 100)}.</p>
            )}
            {kind === "variation" && (
              <ValueBar
                label="Valor final"
                value={state.otherBase}
                maximum={Math.max(maximum, state.otherBase)}
              />
            )}
            {kind === "recover-part" && (
              <p>
                {state.percent}% do todo corresponde a {state.base}. Multiplique pelo inverso de{" "}
                {state.percent}/100 para recuperar o todo.
              </p>
            )}
          </>
        )}
      </div>
      {!hideResults && <Output>{ratiosSummary(launch, state)}</Output>}
    </div>
  );
}

"use client";

import type { LabToolProps } from "../types";
import { countCases, countDefinition, countExpected, parseCount } from "./combinatorics";
import { buttonClass, Controls, NumberField, panelClass, Stat, Toggle } from "./controls";
import { enumerationTool } from "./enumeration";
import { EnumerationTool } from "./enumeration-component";

export function CountTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  if (enumerationTool.modes.includes(launch.mode))
    return (
      <EnumerationTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />
    );
  const state = parseCount(launch, raw);
  const definition = countDefinition(launch);
  const cases = countCases(launch, state);
  const boxes =
    state.kind === "drawers" ? Array.from({ length: state.boxes }, (_, number) => number) : [];
  // A ficha mantém seu número ao trocar de caixa; retirar fichas remove apenas o fim.
  const tokens =
    state.kind === "drawers"
      ? state.positions.map((box, number) => ({ number: number + 1, box }))
      : [];
  if (state.kind === "drawers")
    return (
      <div className="grid gap-4">
        <Controls>
          <NumberField
            label="Quantidade de caixas"
            value={state.boxes}
            min={2}
            max={6}
            onChange={(boxes) =>
              onChange({
                ...state,
                boxes,
                positions: state.positions.map((box) => Math.min(box, boxes - 1)),
              })
            }
          />
          <NumberField
            label="Quantidade de fichas"
            value={state.positions.length}
            min={1}
            max={72}
            onChange={(length) =>
              onChange({
                ...state,
                positions: Array.from({ length }, (_, index) => state.positions[index] ?? 0),
              })
            }
          />
        </Controls>
        <div className="grid gap-3 sm:grid-cols-3">
          {boxes.map((box) => (
            <div key={box} className={panelClass}>
              <h4 className="font-bold">Caixa {box + 1}</h4>
              <p className="text-sm">
                {state.positions.filter((position) => position === box).length} fichas
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {tokens.map((token) =>
                  token.box === box ? (
                    <span
                      key={token.number}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-sombra bg-creme text-xs font-bold"
                    >
                      <span className="sr-only">Ficha </span>
                      {token.number}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer font-semibold underline">
            Mover fichas entre caixas
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {tokens.map((token) => (
              <label key={token.number} className="flex items-center justify-between gap-2 text-sm">
                Ficha {token.number}
                <select
                  aria-label={`Destino da ficha ${token.number}`}
                  className={buttonClass}
                  value={token.box}
                  onChange={(event) =>
                    onChange({
                      ...state,
                      positions: state.positions.map((position, at) =>
                        at === token.number - 1 ? Number(event.currentTarget.value) : position,
                      ),
                    })
                  }
                >
                  {boxes.map((destination) => (
                    <option key={destination} value={destination}>
                      Caixa {destination + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        {!hideResults && (
          <>
            <button
              className={buttonClass}
              type="button"
              onClick={() =>
                onChange({
                  ...state,
                  positions: state.positions.map((_, index) => index % state.boxes),
                })
              }
            >
              Distribuir da forma mais equilibrada
            </button>
            <Stat>
              A média é {state.positions.length}/{state.boxes}. A caixa mais cheia da montagem tem{" "}
              {Math.max(
                ...Array.from(
                  { length: state.boxes },
                  (_, box) => state.positions.filter((position) => position === box).length,
                ),
              )}{" "}
              fichas. A montagem mostra um caso; a garantia precisa valer para qualquer
              distribuição.
            </Stat>
          </>
        )}
      </div>
    );
  if (state.kind === "sets")
    return (
      <div className="grid gap-4">
        <Controls>
          <NumberField
            label="Números de 1 até"
            value={state.size}
            min={4}
            max={16}
            onChange={(size) => onChange({ ...state, size })}
          />
          <NumberField
            label="Conjunto A: múltiplos de"
            value={state.multiplesA}
            min={2}
            max={5}
            onChange={(multiplesA) => onChange({ ...state, multiplesA })}
          />
          <NumberField
            label="Conjunto B: múltiplos de"
            value={state.multiplesB}
            min={2}
            max={5}
            onChange={(multiplesB) => onChange({ ...state, multiplesB })}
          />
        </Controls>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cases.map((item) => {
            const value = Number(item.id);
            const a = value % state.multiplesA === 0;
            const b = value % state.multiplesB === 0;
            return (
              <div key={item.id} className={`${panelClass} ${a && b ? "border-verde" : ""}`}>
                <strong>{value}</strong>
                <p className="text-xs">
                  {a && b
                    ? "A e B: interseção"
                    : a
                      ? "Somente A"
                      : b
                        ? "Somente B"
                        : "Fora de A e B"}
                </p>
              </div>
            );
          })}
        </div>
        {!hideResults && (
          <Stat>
            |A| + |B| − |A ∩ B| ={" "}
            {cases.filter((item) => Number(item.id) % state.multiplesA === 0).length} +{" "}
            {cases.filter((item) => Number(item.id) % state.multiplesB === 0).length} −{" "}
            {
              cases.filter(
                (item) =>
                  Number(item.id) % state.multiplesA === 0 &&
                  Number(item.id) % state.multiplesB === 0,
              ).length
            }
            . Cada elemento da união entra uma vez.
          </Stat>
        )}
      </div>
    );
  const setSelected = (id: string) =>
    onChange({
      ...state,
      selected: state.selected.includes(id)
        ? state.selected.filter((current) => current !== id)
        : [...state.selected, id],
    });
  return (
    <div className="grid gap-4">
      {state.kind === "tree" && (
        <>
          <Controls>
            <NumberField
              label={
                launch.grade <= 3 ? "Escolhas da primeira lista" : "Opções da primeira lista (A)"
              }
              value={state.first}
              min={2}
              max={launch.grade <= 3 ? 3 : 5}
              onChange={(first) => onChange({ ...state, first, selected: [] })}
            />
            <NumberField
              label={
                launch.grade <= 3 ? "Escolhas da segunda lista" : "Opções da segunda lista (B)"
              }
              value={state.second}
              min={2}
              max={launch.grade <= 3 ? 3 : 5}
              onChange={(second) => onChange({ ...state, second, selected: [] })}
            />
          </Controls>
          <p className="text-sm">
            {definition.rule === "sum"
              ? "Escolha uma opção de A ou de B: as alternativas se somam."
              : "Cada linha da árvore começa por uma opção da primeira lista e se ramifica nas opções da segunda."}
          </p>
        </>
      )}
      {state.kind === "arrangement" && (
        <>
          <Controls>
            {definition.rule !== "no-adjacent" && launch.mode !== "filas-anagramas" && (
              <NumberField
                label="Pessoas disponíveis (A, B, C…)"
                value={state.size}
                min={Math.max(2, state.take)}
                max={6}
                onChange={(size) => onChange({ ...state, size, selected: [] })}
              />
            )}
            {definition.rule !== "no-adjacent" && definition.rule !== "double" && (
              <NumberField
                label={
                  launch.mode === "filas-anagramas"
                    ? "Quantidade de letras (uma B, demais A)"
                    : "Pessoas escolhidas"
                }
                value={state.take}
                min={1}
                max={state.repeat ? 4 : Math.min(4, state.size)}
                onChange={(take) => onChange({ ...state, take, selected: [] })}
              />
            )}
          </Controls>
          {launch.mode === "arranjo-combinacao" && (
            <Toggle
              label="A ordem importa: existem cargos diferentes"
              checked={state.ordered}
              onChange={(ordered) => onChange({ ...state, ordered, selected: [] })}
            />
          )}
          <p className="text-sm">
            {definition.rule === "no-adjacent"
              ? "D = direita; C = cima. Mesmos passos em ordens diferentes formam rotas diferentes."
              : launch.mode === "filas-anagramas"
                ? "As letras A são iguais; trocar duas A não cria outra palavra."
                : `A ordem ${state.ordered ? "importa" : "não importa"}. Pessoas ${state.repeat ? "podem" : "não podem"} se repetir.`}
          </p>
        </>
      )}
      {state.kind === "distribution" && (
        <Controls>
          <NumberField
            label="Fichas iguais"
            value={state.balls}
            min={Math.max(1, state.minimum * state.boxes)}
            max={8}
            onChange={(balls) => onChange({ ...state, balls, selected: [] })}
          />
          <NumberField
            label="Caixas identificadas"
            value={state.boxes}
            min={2}
            max={state.minimum ? Math.min(4, state.balls) : 4}
            onChange={(boxes) => onChange({ ...state, boxes, selected: [] })}
          />
          <Toggle
            label="Cada caixa precisa receber ao menos uma ficha"
            checked={state.minimum === 1}
            onChange={(required) =>
              onChange({
                ...state,
                minimum: required ? 1 : 0,
                balls: required ? Math.max(state.balls, state.boxes) : state.balls,
                selected: [],
              })
            }
          />
        </Controls>
      )}
      <p className="text-sm">
        Marque os casos que entram na contagem. Uma marca é sua decisão; confira se respeita as
        regras.{" "}
        {state.kind === "distribution" && "Cada lista mostra as quantidades nas caixas 1, 2, …"}
      </p>
      <fieldset className="grid max-h-80 grid-cols-2 gap-2 overflow-auto p-1 sm:grid-cols-4">
        <legend className="sr-only">Casos enumerados</legend>
        {cases.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={state.selected.includes(item.id)}
            className={`${buttonClass} ${state.selected.includes(item.id) ? "bg-creme ring-2 ring-verde" : ""}`}
            onClick={() => setSelected(item.id)}
          >
            {item.label}
            <span className="block text-xs">
              {state.selected.includes(item.id) ? "Marcado" : "Não marcado"}
            </span>
          </button>
        ))}
      </fieldset>
      {!hideResults && (
        <>
          <Stat>
            {state.selected.length} casos marcados. {cases.length} resultados candidatos na lista.{" "}
            {state.kind === "arrangement" &&
              definition.rule === "double" &&
              `${state.size} pessoas contam ${state.size * (state.size - 1)} pontas de aperto, mas cada aperto aparece duas vezes.`}
          </Stat>
          <details>
            <summary className="cursor-pointer font-semibold underline">
              Conferir organização da lista
            </summary>
            <p className="mt-2 text-sm">
              A lista completa tem {countExpected(launch, state)} casos permitidos.{" "}
              {definition.rule === "different" && "Os pares com números iguais foram excluídos."}
              {definition.rule === "at-least-a" &&
                "A restrição de participação precisa ser aplicada antes de contar."}
            </p>
          </details>
        </>
      )}
    </div>
  );
}

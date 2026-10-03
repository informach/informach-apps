"use client";
import type { LabToolProps } from "../types";
import { countingDefinition, countingSummary, parseCounting } from "./counting";
import { twoQuantitiesMode } from "./two-quantities";
import { TwoQuantitiesTool } from "./two-quantities-components";
import { buttonClass, NumberControl, Output, panelClass, positions } from "./ui";

function Tokens({
  total,
  removed = 0,
  groupSize,
  name,
}: {
  total: number;
  removed?: number;
  groupSize?: number;
  name: string;
}) {
  const group = groupSize ?? 10;
  return (
    <div
      role="img"
      aria-label={`${name}: ${total} fichas${removed ? `, ${removed} riscadas` : ""}${groupSize ? `, organizadas em grupos de ${groupSize}` : ""}`}
      className="flex flex-wrap gap-2"
    >
      {positions(Math.ceil(total / group)).map((index) => (
        <div
          key={index}
          className={`flex max-w-48 flex-wrap gap-1 p-2 ${groupSize ? "rounded-controle border-2 border-sombra" : ""}`}
        >
          {positions(Math.min(group, total - index * group)).map((child) => (
            <span
              key={child}
              className="inline-flex size-6 items-center justify-center rounded-full border-2 border-tinta bg-creme text-lg font-bold text-tinta"
            >
              {index * group + child >= total - removed ? "×" : "●"}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
export function CountingTool(props: LabToolProps) {
  const { launch, state: raw, onChange, hideResults } = props;
  if (launch.mode === twoQuantitiesMode) return <TwoQuantitiesTool {...props} />;
  const state = parseCounting(launch, raw);
  const kind = countingDefinition(launch).kind;
  const onTable = state.total - state.trays[0] - state.trays[1];
  const update = (changes: Partial<typeof state>) =>
    onChange(parseCounting(launch, { ...state, ...changes }));
  if (kind === "jumps") {
    const end = state.start + state.step * state.jumps;
    const maximum = Math.max(20, end);
    const x = (value: number) => 20 + (value / maximum) * 360;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberControl
            label="Número de partida"
            value={state.start}
            min={0}
            max={20}
            onChange={(start) => update({ start })}
          />
          <NumberControl
            label="Tamanho de cada pulo"
            value={state.step}
            min={1}
            max={10}
            onChange={(step) => update({ step })}
          />
          <NumberControl
            label="Quantidade de pulos"
            value={state.jumps}
            min={0}
            max={10}
            onChange={(jumps) => update({ jumps })}
          />
        </div>
        <svg
          viewBox="0 0 400 100"
          role="img"
          aria-label={
            hideResults
              ? `Reta com início em ${state.start}; ${state.jumps} pulos de tamanho ${state.step}.`
              : countingSummary(launch, state)
          }
          className="w-full"
        >
          <line x1="20" y1="65" x2="380" y2="65" stroke="#172e2a" strokeWidth="2" />
          {positions(state.jumps + 1).map((index) => (
            <g key={index}>
              <circle cx={x(state.start + state.step * index)} cy="65" r="4" fill="#176344" />
              <text
                x={x(state.start + state.step * index)}
                y="90"
                fontSize="12"
                textAnchor="middle"
              >
                {hideResults && index > 0 ? "" : state.start + state.step * index}
              </text>
              {index > 0 && (
                <path
                  d={`M ${x(state.start + state.step * (index - 1))} 63 Q ${x(state.start + state.step * (index - 0.5))} 5 ${x(state.start + state.step * index)} 63`}
                  fill="none"
                  stroke="#176344"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
        </svg>
        {!hideResults && <Output>{countingSummary(launch, state)}</Output>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberControl
          label={kind === "half" ? "Fichas para repartir" : "Fichas da primeira coleção"}
          value={state.total}
          min={0}
          max={100}
          step={kind === "half" ? 2 : 1}
          onChange={(total) => {
            const firstTray = Math.min(total, state.trays[0]);
            update({
              total,
              removed: Math.min(kind === "steps" ? total + state.other : total, state.removed),
              trays: [firstTray, Math.min(total - firstTray, state.trays[1])],
            });
          }}
        />
        {["groups", "remainder", "share"].includes(kind) && launch.mode !== "dezenas-ate-cem" && (
          <NumberControl
            label={kind === "share" ? "Pessoas para repartir" : "Fichas em cada grupo"}
            value={state.groupSize}
            min={1}
            max={10}
            onChange={(groupSize) => update({ groupSize })}
          />
        )}{" "}
        {["difference", "join", "steps"].includes(kind) && (
          <NumberControl
            label="Fichas da segunda coleção"
            value={state.other}
            min={0}
            max={100}
            onChange={(other) =>
              update({
                other,
                removed:
                  kind === "steps" ? Math.min(state.total + other, state.removed) : state.removed,
              })
            }
          />
        )}{" "}
        {["draw", "join", "steps"].includes(kind) && (
          <NumberControl
            label="Fichas que saíram"
            value={state.removed}
            min={0}
            max={kind === "steps" ? state.total + state.other : state.total}
            onChange={(removed) => update({ removed })}
          />
        )}
      </div>
      <div className={panelClass}>
        <p className="mb-2 font-semibold">
          {kind === "half" ? "Mesa e duas bandejas" : "Primeira coleção"}
        </p>
        {kind === "share" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {positions(state.groupSize).map((person) => (
                <div key={person} className="rounded-controle border border-sombra p-2">
                  <p className="mb-2 text-sm font-semibold">Pessoa {person + 1}</p>
                  <Tokens
                    total={Math.floor(state.total / state.groupSize)}
                    name={`Fichas da pessoa ${person + 1}`}
                  />
                </div>
              ))}
            </div>
            {!hideResults && (
              <p className="mt-3 text-sm">Fichas que sobraram: {state.total % state.groupSize}</p>
            )}
          </>
        ) : kind === "half" ? (
          <>
            <Tokens total={onTable} name="Fichas ainda na mesa" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {([0, 1] as const).map((index) => (
                <div key={index} className="space-y-2 rounded-controle border-2 border-sombra p-2">
                  <p className="font-semibold">Bandeja {index + 1}</p>
                  <Tokens total={state.trays[index]} name={`Bandeja ${index + 1}`} />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={onTable === 0}
                    aria-label={`Colocar uma ficha na bandeja ${index + 1}`}
                    onClick={() =>
                      update({
                        trays:
                          index === 0
                            ? [state.trays[0] + 1, state.trays[1]]
                            : [state.trays[0], state.trays[1] + 1],
                      })
                    }
                  >
                    Colocar 1
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={state.trays[index] === 0}
                    aria-label={`Devolver uma ficha da bandeja ${index + 1}`}
                    onClick={() =>
                      update({
                        trays:
                          index === 0
                            ? [state.trays[0] - 1, state.trays[1]]
                            : [state.trays[0], state.trays[1] - 1],
                      })
                    }
                  >
                    Devolver 1
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Tokens
            total={state.total}
            name="Primeira coleção"
            groupSize={["groups", "remainder"].includes(kind) ? state.groupSize : undefined}
            removed={["draw", "join"].includes(kind) ? state.removed : 0}
          />
        )}
      </div>
      {["difference", "join", "steps"].includes(kind) && (
        <div className={panelClass}>
          <p className="mb-2 font-semibold">Segunda coleção</p>
          <Tokens total={state.other} name="Segunda coleção" />
        </div>
      )}
      {kind === "steps" && (
        <div className={panelClass}>
          <p className="mb-2 font-semibold">
            Junte as coleções e depois risque as fichas que saíram
          </p>
          <Tokens
            total={state.total + state.other}
            removed={state.removed}
            name="Depois da chegada"
          />
        </div>
      )}
      {!hideResults && <Output>{countingSummary(launch, state)}</Output>}
    </div>
  );
}

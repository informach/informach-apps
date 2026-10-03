"use client";
import { useId } from "react";
import type { LabToolProps } from "../types";
import { Check, Frame, panel, positions, Slider, useTool } from "./controls";
import { divisors, modularPower, modulo, primeFactors } from "./math";
import { numberGivenSummary } from "./number-given-summary";
import {
  factorTreeSteps,
  invariantModes,
  modularOrbit,
  numberSummary,
  parseNumber,
} from "./numbers";

function FactorTree({ n, hideResults }: { n: number; hideResults?: boolean }) {
  const steps = factorTreeSteps(n),
    id = useId();
  const levels = hideResults ? 0 : steps.length;
  return (
    <svg
      viewBox={`0 0 300 ${60 + levels * 55}`}
      className="w-full max-w-sm"
      role="img"
      aria-labelledby={id}
    >
      <title id={id}>
        {hideResults
          ? `Árvore de fatores de ${n}: encontre fatores para os dois ramos.`
          : steps.length
            ? `Árvore de fatores: ${steps.map((step) => `${step.value}=${step.factor}×${step.remaining}`).join("; ")}. Cada folha é um fator primo.`
            : n === 1
              ? "1 não tem fatores primos."
              : `${n} é primo: a árvore possui uma única folha.`}
      </title>
      <circle cx="210" cy="25" r="23" fill="#d7eee3" stroke="#243846" />
      <text x="210" y="30" textAnchor="middle" fontSize="15">
        {n}
      </text>
      {positions(levels).map((level) => {
        const step = steps[level - 1],
          top = 25 + (level - 1) * 55,
          bottom = top + 55;
        return (
          <g key={level}>
            <line x1="193" y1={top + 15} x2="84" y2={bottom - 12} stroke="#243846" />
            <line x1="210" y1={top + 23} x2="210" y2={bottom - 23} stroke="#243846" />
            <circle cx="65" cy={bottom} r="23" fill="#d9eaf2" stroke="#243846" />
            <circle cx="210" cy={bottom} r="23" fill="#d7eee3" stroke="#243846" />
            <text x="65" y={bottom + 5} textAnchor="middle" fontSize="15">
              {hideResults ? "?" : step?.factor}
            </text>
            <text x="210" y={bottom + 5} textAnchor="middle" fontSize="15">
              {hideResults ? "?" : step?.remaining}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function NumberTool(props: LabToolProps) {
  const { state: s, update, error } = useTool(props, parseNumber);
  const mode = props.launch.mode;
  const factor = ["primos-divisores", "mdc-mmc"].includes(mode),
    baseMode = mode === "digitos-bases";
  const parity = ["paridade", "pares-e-restos"].includes(mode),
    powerMode = ["ciclos-e-algarismos", "modulo-potencias"].includes(mode),
    invariant = invariantModes.includes(mode),
    additive = ["classes-e-multiplos", "aritmetica-modular"].includes(mode),
    clockVisible = powerMode || invariant || additive,
    clockModulus = invariant ? s.step : s.modulus,
    groupDivisor = parity ? 2 : invariant ? s.step : clockVisible ? s.modulus : s.divisor;
  const orbit = powerMode
      ? Array.from({ length: s.exponent + 1 }, (_, exponent) =>
          modularPower(s.n, exponent, s.modulus),
        )
      : invariant
        ? [s.n % s.step]
        : modularOrbit(s),
    position = powerMode
      ? modularPower(s.n, s.exponent, s.modulus)
      : invariant
        ? s.n % s.step
        : modulo(s.n + s.count * s.step, s.modulus);
  const factorRows = [
    { id: "first", n: s.n },
    ...(mode === "mdc-mmc" ? [{ id: "second", n: s.other }] : []),
  ];
  const digitCount = s.n === 0 ? 1 : Math.floor(Math.log(s.n) / Math.log(s.base) + 1e-10) + 1;
  return (
    <Frame
      disabled={props.disabled}
      error={error}
      summary={
        props.hideResults ? numberGivenSummary(props.launch, s) : numberSummary(props.launch, s)
      }
    >
      <div className={panel}>
        {factor ? (
          <div className="space-y-4">
            {factorRows.map(({ n, id }) => (
              <div key={id}>
                <FactorTree n={n} hideResults={props.hideResults} />
                <p className="font-semibold">
                  {props.hideResults ? (
                    `Número ${n}`
                  ) : (
                    <>
                      {n} = {n === 1 ? "1 (sem fatores primos)" : primeFactors(n).join(" × ")}
                    </>
                  )}
                </p>
                {!props.hideResults && (
                  <section className="mt-2 flex flex-wrap gap-2" aria-label={`Divisores de ${n}`}>
                    {divisors(n).map((d) => (
                      <span
                        key={d}
                        className={`rounded border-2 border-sombra px-2 py-1 text-sm ${mode === "mdc-mmc" && s.n % d === 0 && s.other % d === 0 ? "bg-emerald-100" : "bg-creme"}`}
                      >
                        {d}
                        {mode === "mdc-mmc" && s.n % d === 0 && s.other % d === 0 ? " (comum)" : ""}
                      </span>
                    ))}
                  </section>
                )}
              </div>
            ))}
          </div>
        ) : baseMode ? (
          <div className="overflow-x-auto">
            <table className="w-full text-center">
              <caption className="mb-3 text-left">
                Ordens posicionais na base {s.base}. Cada coluna reúne {s.base} unidades da coluna
                seguinte.
              </caption>
              <thead>
                <tr>
                  {Array.from({ length: digitCount }, (_, index) => digitCount - index - 1).map(
                    (power) => (
                      <th key={power} className="border border-sombra p-2">
                        {s.base}
                        <sup>{power}</sup> = {s.base ** power}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Array.from({ length: digitCount }, (_, index) => digitCount - index - 1).map(
                    (power) => (
                      <td key={power} className="border border-sombra p-3">
                        {props.hideResults ? "?" : Math.floor(s.n / s.base ** power) % s.base}{" "}
                        grupos
                      </td>
                    ),
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid items-center gap-5 sm:grid-cols-2">
            {clockVisible && (
              <svg
                viewBox="0 0 260 270"
                role="img"
                aria-label={
                  props.hideResults
                    ? `Relógio com ${clockModulus} posições; determine a posição pedida.`
                    : `Relógio com ${clockModulus} posições. Restos visitados: ${orbit.join(", ")}. ${powerMode ? "Resto da potência" : invariant ? "Resto preservado" : "Posição após os passos"}: ${position}.`
                }
              >
                <circle cx="130" cy="125" r="90" fill="none" stroke="#8b949c" strokeWidth="2" />
                {positions(clockModulus)
                  .map((position) => position - 1)
                  .map((n) => {
                    const angle = (n / clockModulus) * Math.PI * 2 - Math.PI / 2;
                    const x = 130 + Math.cos(angle) * 90,
                      y = 125 + Math.sin(angle) * 90;
                    return (
                      <g key={n}>
                        <circle
                          cx={x}
                          cy={y}
                          r="16"
                          fill={
                            props.hideResults
                              ? "white"
                              : n === position
                                ? "#087f5b"
                                : orbit.includes(n)
                                  ? "#d7eee3"
                                  : "white"
                          }
                          stroke="#243846"
                          strokeWidth="2"
                        />
                        <text
                          x={x}
                          y={y + 5}
                          textAnchor="middle"
                          fill={!props.hideResults && n === position ? "white" : "#243846"}
                          fontSize="14"
                        >
                          {n}
                        </text>
                      </g>
                    );
                  })}
                <text x="130" y="128" textAnchor="middle" fontSize="17" fill="#243846">
                  {powerMode ? `Expoente ${s.exponent}` : `Passo ${s.step}`}
                </text>
                <text x="130" y="259" textAnchor="middle" fontSize="13" fill="#243846">
                  {powerMode
                    ? "Resto da potência"
                    : invariant
                      ? "Resto preservado"
                      : "Posição após os passos"}
                  : {props.hideResults ? "?" : position}
                </text>
              </svg>
            )}
            {props.hideResults ? (
              <section className="flex flex-wrap gap-1" aria-label={`${s.n} unidades sem agrupar`}>
                {positions(s.n).map((n) => (
                  <span key={n} aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-800" />
                ))}
              </section>
            ) : (
              <div className="space-y-3">
                <p>
                  {clockVisible ? "Agrupamento do número inicial: " : ""}
                  {s.n} = {groupDivisor} × {Math.floor(s.n / groupDivisor)} + {s.n % groupDivisor}
                </p>
                <section
                  className="flex flex-wrap gap-1"
                  aria-label={`${Math.floor(s.n / groupDivisor)} grupos completos e ${s.n % groupDivisor} unidades restantes`}
                >
                  {positions(Math.min(Math.floor(s.n / groupDivisor), 20)).map((position) => (
                    <span
                      key={position}
                      className="rounded border border-sombra bg-sky-100 p-2 text-xs"
                    >
                      {groupDivisor}
                    </span>
                  ))}
                  {Math.floor(s.n / groupDivisor) > 20 && <span>…</span>}
                  <span className="rounded border-2 border-dashed border-sombra p-2 text-xs">
                    Sobram {s.n % groupDivisor}
                  </span>
                </section>
                {["ciclos-e-algarismos", "modulo-potencias"].includes(mode) && (
                  <p className="text-sm">
                    Restos das potências de expoente 0 até {Math.min(s.exponent, 8)}:{" "}
                    {Array.from({ length: Math.min(s.exponent, 8) + 1 }, (_, exponent) =>
                      modularPower(s.n, exponent, s.modulus),
                    ).join(", ")}
                    .
                  </p>
                )}
                {invariantModes.includes(mode) && (
                  <p className="text-sm">
                    Exemplos alcançados: {[0, 1, 2, 3].map((k) => s.n + k * s.step).join(", ")}…
                    Todos deixam resto {s.n % s.step} por {s.step}. Também é permitido subtrair o
                    passo.
                  </p>
                )}
                {mode === "multiplas-condicoes" && (
                  <p className="text-sm">
                    Restos pedidos: {s.remainderA} por {s.divisor} e {s.remainderB} por {s.modulus}.
                    No segundo divisor: {s.n} = {s.modulus} × {Math.floor(s.n / s.modulus)} +{" "}
                    {s.n % s.modulus}. Investigue a compatibilidade antes de procurar o menor
                    número.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Número n"
          value={s.n}
          min={factor || ["ciclos-e-algarismos", "modulo-potencias"].includes(mode) ? 1 : 0}
          max={240}
          onChange={(n) => update({ n })}
        />
        {factor ? (
          mode === "mdc-mmc" && (
            <>
              <Slider
                label="Outro número"
                value={s.other}
                min={1}
                max={120}
                onChange={(other) => update({ other })}
              />
              <Check checked={s.findLcm} onChange={(findLcm) => update({ findLcm })}>
                Investigar MMC (desmarcado: MDC)
              </Check>
            </>
          )
        ) : baseMode ? (
          <Slider
            label="Base"
            value={s.base}
            min={2}
            max={16}
            onChange={(base) => update({ base })}
          />
        ) : (
          <>
            {!parity && !clockVisible && (
              <Slider
                label="Tamanho de cada grupo (divisor)"
                value={s.divisor}
                min={2}
                max={16}
                onChange={(divisor) =>
                  update({ divisor, remainderA: Math.min(s.remainderA, divisor - 1) })
                }
              />
            )}
            {(powerMode || additive || mode === "multiplas-condicoes") && (
              <Slider
                label="Posições no relógio (módulo)"
                value={s.modulus}
                min={2}
                max={12}
                onChange={(modulus) =>
                  update({ modulus, remainderB: Math.min(s.remainderB, modulus - 1) })
                }
              />
            )}
            {(invariant || additive) && (
              <Slider
                label="Tamanho do passo"
                value={s.step}
                min={1}
                max={12}
                onChange={(step) => update({ step })}
              />
            )}
            {additive && (
              <Slider
                label="Quantidade de passos"
                value={s.count}
                min={0}
                max={24}
                onChange={(count) => update({ count })}
              />
            )}
            {["ciclos-e-algarismos", "modulo-potencias"].includes(mode) && (
              <Slider
                label="Expoente"
                value={s.exponent}
                min={0}
                max={16}
                onChange={(exponent) => update({ exponent })}
              />
            )}
            {invariantModes.includes(mode) && (
              <Slider
                label="Outro número: alvo"
                value={s.other}
                min={1}
                max={120}
                onChange={(other) => update({ other })}
              />
            )}
            {mode === "multiplas-condicoes" && (
              <>
                <Slider
                  label="Resto no primeiro divisor"
                  value={s.remainderA}
                  min={0}
                  max={s.divisor - 1}
                  onChange={(remainderA) => update({ remainderA })}
                />
                <Slider
                  label="Resto no módulo"
                  value={s.remainderB}
                  min={0}
                  max={s.modulus - 1}
                  onChange={(remainderB) => update({ remainderB })}
                />
              </>
            )}
          </>
        )}
      </div>
    </Frame>
  );
}

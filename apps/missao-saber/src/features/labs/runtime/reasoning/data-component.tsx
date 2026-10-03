"use client";

import { useId } from "react";
import type { LabToolProps } from "../types";
import { buttonClass, NumberField, panelClass, Stat } from "./controls";
import {
  dataColumnNames,
  dataDefinition,
  dataMetrics,
  dataMissingTotal,
  dataRowNames,
  parseData,
} from "./data";

export function DataTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const clipId = useId();
  const state = parseData(launch, raw);
  const definition = dataDefinition(launch);
  const metrics = dataMetrics(launch, state);
  const maximum = Math.max(10, ...state.values);
  const plotHeight = 180;
  const pointY = (value: number) =>
    210 - ((value - state.baseline) / (maximum - state.baseline)) * plotHeight;
  return (
    <div className="grid gap-4">
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left font-semibold">
            Livros emprestados por dia e assunto
          </caption>
          <thead>
            <tr>
              <th className="p-2">Dia</th>
              {dataColumnNames.map((name, column) => (
                <th className="p-2" key={name}>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-pressed={state.column === column}
                    onClick={() => onChange({ ...state, column })}
                  >
                    {name}
                  </button>
                </th>
              ))}
              {(!hideResults || definition.target === "missing") && <th className="p-2">Total</th>}
            </tr>
          </thead>
          <tbody>
            {dataRowNames.map((name, row) => (
              <tr key={name} className="border-t border-sombra">
                <th className="p-2">
                  <button
                    type="button"
                    aria-pressed={state.row === row}
                    className={`${buttonClass} ${state.row === row ? "bg-creme" : ""}`}
                    onClick={() => {
                      const total = (state.values[row * 2] ?? 0) + (state.values[row * 2 + 1] ?? 0);
                      if (definition.target !== "percent" || total > 0) onChange({ ...state, row });
                    }}
                  >
                    {name}
                  </button>
                </th>
                {dataColumnNames.map((columnName, column) => {
                  const index = row * 2 + column;
                  const opposite = state.values[row * 2 + (column === 0 ? 1 : 0)] ?? 0;
                  return (
                    <td
                      key={columnName}
                      className={`p-2 ${row === state.row && column === state.column ? "bg-creme" : ""}`}
                    >
                      {definition.target === "missing" && index === 0 ? (
                        <span>
                          <span className="sr-only">
                            {name}, {columnName}, valor conhecido:{" "}
                          </span>
                          {state.values[index]}
                        </span>
                      ) : (
                        <NumberField
                          label={`${name}, ${columnName}${definition.target === "missing" && index === 1 ? " — lacuna" : ""}`}
                          value={state.values[index] ?? 0}
                          min={
                            definition.target === "percent" && row === state.row && opposite === 0
                              ? 1
                              : 0
                          }
                          max={launch.grade <= 3 ? 10 : launch.grade <= 5 ? 30 : 100}
                          onChange={(value) =>
                            onChange({
                              ...state,
                              values: state.values.map((current, at) =>
                                at === index ? value : current,
                              ),
                            })
                          }
                        />
                      )}
                      {launch.grade <= 3 && (
                        <span className="mt-1 block max-w-40 break-words" aria-hidden="true">
                          {"● ".repeat(state.values[index] ?? 0)}
                        </span>
                      )}
                    </td>
                  );
                })}
                {(!hideResults || definition.target === "missing") && (
                  <td className="p-2 font-semibold">
                    {definition.target === "missing" && row === 0
                      ? `${dataMissingTotal(launch)} (objetivo)`
                      : (state.values[row * 2] ?? 0) + (state.values[row * 2 + 1] ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {!hideResults && (
            <tfoot>
              <tr className="border-t-2 border-sombra">
                <th className="p-2">Total das colunas</th>
                <td className="p-2">{metrics.columnOne}</td>
                <td className="p-2">{metrics.columnTwo}</td>
                <td className="p-2">{metrics.columnOne + metrics.columnTwo}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          aria-pressed={state.chart === "bars"}
          onClick={() => onChange({ ...state, chart: "bars" })}
        >
          Ver barras
        </button>
        {launch.grade > 3 && (
          <button
            type="button"
            className={buttonClass}
            aria-pressed={state.chart === "line"}
            onClick={() => onChange({ ...state, chart: "line" })}
          >
            Ver linhas ao longo dos dias
          </button>
        )}
        {definition.target === "graph" && (
          <button
            type="button"
            className={buttonClass}
            aria-pressed={state.baseline === 5}
            onClick={() => onChange({ ...state, baseline: state.baseline === 0 ? 5 : 0 })}
          >
            Eixo começa em {state.baseline === 0 ? "0 — mudar para 5" : "5 — voltar a 0"}
          </button>
        )}
      </div>
      <div className={panelClass}>
        <svg
          viewBox="0 0 420 250"
          className="w-full"
          role="img"
          aria-label={`Gráfico ${state.chart === "bars" ? "de barras" : "de linhas"} dos dados da tabela. Eixo de ${state.baseline} até ${maximum}. Valores exatos disponíveis na tabela.`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="40" y="30" width="360" height="180" />
            </clipPath>
          </defs>
          <line x1="40" y1="30" x2="40" y2="210" stroke="currentColor" />
          <line x1="40" y1="210" x2="400" y2="210" stroke="currentColor" />
          <text x="7" y="35" fontSize="12">
            {maximum}
          </text>
          <text x="15" y="213" fontSize="12">
            {state.baseline}
          </text>
          {dataRowNames.map((name, row) => (
            <text key={name} x={90 + row * 120} y="240" textAnchor="middle" fontSize="12">
              {name}
            </text>
          ))}
          {state.chart === "bars"
            ? state.values.map((value, index) => (
                <g key={`${dataRowNames[Math.floor(index / 2)]}-${dataColumnNames[index % 2]}`}>
                  <rect
                    x={58 + Math.floor(index / 2) * 120 + (index % 2) * 34}
                    y={pointY(Math.max(state.baseline, value))}
                    width="28"
                    height={Math.max(0, 210 - pointY(value))}
                    fill={index % 2 === 0 ? "#166534" : "#1e40af"}
                  />
                  <text
                    x={72 + Math.floor(index / 2) * 120 + (index % 2) * 34}
                    y={pointY(Math.max(state.baseline, value)) - 5}
                    textAnchor="middle"
                    fontSize="12"
                  >
                    {value < state.baseline ? `${value} ↓` : value}
                  </text>
                </g>
              ))
            : [0, 1].map((column) => (
                <g key={column} clipPath={`url(#${clipId})`}>
                  <polyline
                    points={dataRowNames
                      .map(
                        (_, row) =>
                          `${90 + row * 120},${pointY(state.values[row * 2 + column] ?? 0)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={column === 0 ? "#166534" : "#1e40af"}
                    strokeWidth="3"
                    strokeDasharray={column === 0 ? undefined : "7 4"}
                  />
                  {dataRowNames.map((name, row) => (
                    <circle
                      key={name}
                      cx={90 + row * 120}
                      cy={pointY(state.values[row * 2 + column] ?? 0)}
                      r="5"
                      fill={column === 0 ? "#166534" : "#1e40af"}
                    />
                  ))}
                </g>
              ))}
        </svg>
        <p className="text-xs">
          Aventura: verde, primeira barra/linha contínua. Ciência: azul, segunda barra/linha
          tracejada. Eixo vertical: livros.{" "}
          {state.baseline > 0 &&
            "Eixo recortado em 5: pontos abaixo do recorte ficam fora da área visível, sem mudar a inclinação das linhas. Barras abaixo do recorte usam ↓; consulte os valores na tabela. O recorte pode exagerar a impressão de diferença."}
        </p>
      </div>
      {!hideResults && (
        <Stat>
          Na linha {dataRowNames[state.row]}, o total é {metrics.first + metrics.second}; a
          diferença Ciência − Aventura é {metrics.second - metrics.first}. O gráfico acompanha os
          dados da tabela.
        </Stat>
      )}
    </div>
  );
}

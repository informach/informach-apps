"use client";

import { useId } from "react";
import type { LabToolProps } from "../types";
import { advancedFunctionSummary, parseAdvancedFunction, vertex } from "./advanced-functions";
import {
  AdvancedFrame,
  CartesianPlot,
  Choice,
  Range,
  slots,
  useAdvancedState,
} from "./advanced-ui";
import { functionGivenSummary } from "./function-given-summary";
import { formatNumber, quadraticRoots } from "./math";

export function AdvancedFunctionTool(props: LabToolProps) {
  const { state: s, update, error } = useAdvancedState(props, parseAdvancedFunction);
  const relationId = useId();
  if (s.kind === "relation") {
    const domain = [...new Set(s.pairs.map((pair) => pair.x))].sort((a, b) => a - b),
      image = [...new Set(s.pairs.map((pair) => pair.y))].sort((a, b) => a - b);
    const distinct = s.pairs.filter(
      (pair, index) =>
        s.pairs.findIndex((other) => pair.x === other.x && pair.y === other.y) === index,
    );
    return (
      <AdvancedFrame summary={advancedFunctionSummary(s)} error={error} disabled={props.disabled}>
        <div className="grid gap-3 lg:grid-cols-2">
          <svg
            viewBox="0 0 380 270"
            className="w-full rounded-controle bg-creme"
            role="img"
            aria-labelledby={relationId}
          >
            <title
              id={relationId}
            >{`Setas de cada elemento do domínio às imagens. ${distinct.map(({ x, y }) => `${x} leva a ${y}`).join("; ")}`}</title>
            <text x="50" y="25">
              Domínio
            </text>
            <text x="265" y="25">
              Imagem
            </text>
            {distinct.map(({ x, y }) => (
              <g key={`${x},${y}`}>
                <line
                  x1="92"
                  x2="285"
                  y1={50 + domain.indexOf(x) * 35}
                  y2={50 + image.indexOf(y) * 35}
                  stroke="#247a58"
                  strokeWidth="2"
                />
                <text x="277" y={54 + image.indexOf(y) * 35} fill="#247a58">
                  ›
                </text>
              </g>
            ))}
            {domain.map((x, index) => (
              <g key={x}>
                <circle cx="75" cy={50 + index * 35} r="15" fill="white" stroke="currentColor" />
                <text x="75" y={54 + index * 35} textAnchor="middle">
                  {x}
                </text>
              </g>
            ))}
            {image.map((y, index) => (
              <g key={y}>
                <circle cx="303" cy={50 + index * 35} r="15" fill="white" stroke="currentColor" />
                <text x="303" y={54 + index * 35} textAnchor="middle">
                  {y}
                </text>
              </g>
            ))}
          </svg>
          <CartesianPlot
            curves={[]}
            points={distinct}
            label="Pares da relação; uma vertical não pode encontrar duas saídas diferentes"
          />
        </div>
        <Range
          label="Quantidade de pares"
          value={s.pairs.length}
          min={2}
          max={6}
          onChange={(length) =>
            update({ pairs: slots(length).map((slot) => s.pairs[slot - 1] ?? { x: 0, y: 0 }) })
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {slots(s.pairs.length).map((slot) => {
            const pair = s.pairs[slot - 1];
            return (
              pair && (
                <div key={slot} className="rounded-controle border p-2">
                  <Range
                    label={`Par ${slot}: entrada x`}
                    value={pair.x}
                    min={-4}
                    max={4}
                    onChange={(x) =>
                      update({
                        pairs: s.pairs.map((old, index) =>
                          index === slot - 1 ? { ...old, x } : old,
                        ),
                      })
                    }
                  />
                  <Range
                    label={`Par ${slot}: saída y`}
                    value={pair.y}
                    min={-4}
                    max={4}
                    onChange={(y) =>
                      update({
                        pairs: s.pairs.map((old, index) =>
                          index === slot - 1 ? { ...old, y } : old,
                        ),
                      })
                    }
                  />
                </div>
              )
            );
          })}
        </div>
        <p className="text-sm">
          Compare uma entrada com duas saídas e duas entradas com a mesma saída. O domínio desta
          experiência é exatamente o conjunto de entradas que aparecem nos pares.
        </p>
      </AdvancedFrame>
    );
  }
  const point = vertex(s),
    roots = quadraticRoots(s.a, s.b, s.c),
    xMin = Math.min(-4, point.x - 4, ...roots.map((x) => x - 2)),
    xMax = Math.max(4, point.x + 4, ...roots.map((x) => x + 2));
  const yMin = Math.min(-3, point.y - 4),
    yMax = Math.max(3, point.y + 4);
  const values = Array.from({ length: 161 }, (_, i) => {
    const x = xMin + ((xMax - xMin) * i) / 160;
    return { x, y: s.a * x ** 2 + s.b * x + s.c };
  });
  const probes =
    roots.length === 2
      ? [(roots[0] ?? 0) - 1, ((roots[0] ?? 0) + (roots[1] ?? 0)) / 2, (roots[1] ?? 0) + 1]
      : roots.length === 1
        ? [(roots[0] ?? 0) - 1, (roots[0] ?? 0) + 1]
        : [0];
  return (
    <AdvancedFrame
      summary={
        props.hideResults ? functionGivenSummary(props.launch, s) : advancedFunctionSummary(s)
      }
      error={error}
      disabled={props.disabled}
    >
      <CartesianPlot
        curves={[
          {
            id: "parabola",
            label: `f(x)=${s.a}x²+(${s.b})x+(${s.c})`,
            points: values,
            color: "#247a58",
          },
        ]}
        points={
          props.hideResults ? [] : s.kind === "vertex" ? [point] : roots.map((x) => ({ x, y: 0 }))
        }
        label={
          s.kind === "vertex" ? "Vértice e concavidade da parábola" : "Raízes e sinais da parábola"
        }
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Range
          label="a, diferente de zero"
          value={s.a}
          min={-4}
          max={4}
          onChange={(a) => update({ a })}
        />
        <Range label="b" value={s.b} min={-12} max={12} onChange={(b) => update({ b })} />
        <Range label="c" value={s.c} min={-12} max={12} onChange={(c) => update({ c })} />
      </div>
      {s.kind === "vertex" ? (
        <>
          <Choice
            label="Tarefa"
            value={s.target}
            options={[
              { value: "x", label: "Entrada x do vértice" },
              { value: "y", label: "Valor extremo y" },
              { value: "type", label: "Máximo ou mínimo?" },
            ]}
            onChange={(target) => update({ target })}
          />
          {!props.hideResults && (
            <>
              <div className="grid gap-2 rounded-controle border-2 border-sombra p-3 text-sm sm:grid-cols-3">
                {[-1, 0, 1].map((shift) => {
                  const x = point.x + shift;
                  return (
                    <div key={shift}>
                      x={formatNumber(x)} → f(x)={formatNumber(s.a * x ** 2 + s.b * x + s.c)}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm">
                Pontos à mesma distância horizontal do eixo x={formatNumber(point.x)} têm a mesma
                altura. Isso explica a simetria em torno do vértice.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <Choice
            label="Inequação f(x) em relação a zero"
            value={s.relation}
            options={[
              { value: "<", label: "f(x)<0" },
              { value: "≤", label: "f(x)≤0" },
              { value: ">", label: "f(x)>0" },
              { value: "≥", label: "f(x)≥0" },
            ]}
            onChange={(relation) => update({ relation })}
          />
          {!props.hideResults && (
            <>
              <table className="w-full text-sm">
                <caption className="font-semibold">
                  Um ponto de teste em cada intervalo aberto
                </caption>
                <thead>
                  <tr>
                    <th>x de teste</th>
                    <th>f(x)</th>
                    <th>Sinal</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((x) => {
                    const y = s.a * x ** 2 + s.b * x + s.c;
                    return (
                      <tr key={x}>
                        <td className="border p-2">{formatNumber(x)}</td>
                        <td className="border p-2">{formatNumber(y)}</td>
                        <td className="border p-2">{y > 0 ? "+" : y < 0 ? "−" : "0"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-sm">
                Raízes: {roots.map(formatNumber).join("; ") || "nenhuma"}. Elas valem zero e só
                entram quando o sinal permite igualdade. Em uma raiz dupla, compare os sinais dos
                dois lados.
              </p>
            </>
          )}
        </>
      )}
    </AdvancedFrame>
  );
}

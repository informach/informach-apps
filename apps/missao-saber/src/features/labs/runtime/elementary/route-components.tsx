"use client";
import { useState } from "react";
import type { LabToolProps } from "../types";
import type { Command, RouteState } from "./routes";
import {
  parseRoute,
  routeDefinition,
  routeMinimum,
  routeSummary,
  samePoint,
  traceRoute,
} from "./routes";
import { buttonClass, NumberControl, Options, Output, Plane, panelClass } from "./ui";

export function RoutesTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseRoute(launch, raw);
  const kind = routeDefinition(launch).kind;
  const trace = traceRoute(state);
  const [error, setError] = useState("");
  const update = (changes: Partial<RouteState>) => {
    try {
      const next = parseRoute(launch, { ...state, ...changes });
      setError("");
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Esse percurso não é válido.");
    }
  };
  function commandAllowed(command: Command): boolean {
    try {
      parseRoute(launch, { ...state, commands: [...state.commands, command] });
      return true;
    } catch {
      return false;
    }
  }
  const withRoute = !["position", "quadrant", "area", "midpoint", "direct"].includes(kind);
  const midpoint = {
    x: (state.start.x + state.target.x) / 2,
    y: (state.start.y + state.target.y) / 2,
  };
  const advanced = launch.grade >= 8 || ["quadrant", "area", "midpoint", "direct"].includes(kind);
  const displayPoint = (point: { x: number; y: number }) =>
    state.horizontalAxis === "x" ? point : { x: point.y, y: point.x };
  const controls: { command: Command; label: string; symbol: string }[] =
    kind === "turn"
      ? [
          { command: "L", label: "Girar à esquerda", symbol: "↶" },
          { command: "F", label: "Avançar", symbol: "↑" },
          { command: "R", label: "Girar à direita", symbol: "↷" },
        ]
      : [
          { command: "N", label: "Cima", symbol: "↑" },
          { command: "E", label: "Direita", symbol: "→" },
          ...(kind === "enumerate"
            ? []
            : [
                { command: "S" as const, label: "Baixo", symbol: "↓" },
                { command: "W" as const, label: "Esquerda", symbol: "←" },
              ]),
        ];
  return (
    <div className="space-y-4">
      {["area", "midpoint", "direct"].includes(kind) && (
        <Options
          label="Eixo na horizontal"
          value={state.horizontalAxis}
          options={[
            { value: "x", label: "x horizontal; y vertical" },
            { value: "y", label: "y horizontal; x vertical" },
          ]}
          onChange={(value) => update({ horizontalAxis: value === "y" ? "y" : "x" })}
        />
      )}
      {!withRoute && (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberControl
            label={advanced ? "Coordenada x de A" : "Coluna de A"}
            value={state.start.x}
            min={advanced ? -5 : 0}
            max={5}
            onChange={(x) => update({ start: { ...state.start, x }, commands: [], recorded: [] })}
          />
          <NumberControl
            label={advanced ? "Coordenada y de A" : "Linha de A"}
            value={state.start.y}
            min={advanced ? -5 : 0}
            max={5}
            onChange={(y) => update({ start: { ...state.start, y }, commands: [], recorded: [] })}
          />
          {["area", "midpoint", "direct"].includes(kind) && (
            <>
              <NumberControl
                label="Coordenada x de B"
                value={state.target.x}
                min={-5}
                max={5}
                onChange={(x) =>
                  update({ target: { ...state.target, x }, commands: [], recorded: [] })
                }
              />
              <NumberControl
                label="Coordenada y de B"
                value={state.target.y}
                min={-5}
                max={5}
                onChange={(y) =>
                  update({ target: { ...state.target, y }, commands: [], recorded: [] })
                }
              />
            </>
          )}
        </div>
      )}
      {kind === "turn" && (
        <Options
          label="Direção inicial"
          value={String(state.heading)}
          options={["Norte", "Leste", "Sul", "Oeste"].map((label, index) => ({
            value: String(index),
            label,
          }))}
          onChange={(heading) => update({ heading: Number(heading), commands: [] })}
        />
      )}{" "}
      {(kind === "map" || kind === "distance") && (
        <NumberControl
          label="Metros por passo"
          value={state.unit}
          min={1}
          max={10}
          onChange={(unit) => update({ unit })}
        />
      )}
      <Plane
        extent={5}
        minimum={routeMinimum(launch)}
        horizontalAxis={state.horizontalAxis}
        points={[
          { point: state.start, label: "A" },
          ...(["position", "quadrant", "turn"].includes(kind)
            ? []
            : [{ point: state.target, label: "B", filled: true }]),
          ...(withRoute ? [{ point: trace.point, label: "●" }] : []),
          ...(kind === "midpoint" ? [{ point: midpoint, label: "M" }] : []),
          ...state.obstacles.map((point, index) => ({ point, label: `×${index + 1}` })),
        ].map((entry) => ({ ...entry, point: displayPoint(entry.point) }))}
        lines={(withRoute
          ? [trace.points]
          : ["direct", "midpoint"].includes(kind)
            ? [[state.start, state.target]]
            : []
        ).map((line) => line.map(displayPoint))}
        polygons={(kind === "area"
          ? [
              [
                state.start,
                { x: state.target.x, y: state.start.y },
                state.target,
                { x: state.start.x, y: state.target.y },
              ],
            ]
          : []
        ).map((polygon) => polygon.map(displayPoint))}
        description={
          hideResults
            ? `Mapa com A (${state.start.x}, ${state.start.y}) e B (${state.target.x}, ${state.target.y}). Unidade por passo: ${state.unit} m. Comandos registrados: ${state.commands.join(", ") || "nenhum"}.`
            : routeSummary(launch, state)
        }
      />
      {state.obstacles.length > 0 && (
        <p className="text-sm">
          × marca uma casa bloqueada:{" "}
          {state.obstacles.map((point) => `(${point.x}, ${point.y})`).join("; ")}.
        </p>
      )}
      {withRoute && (
        <>
          <div className="flex flex-wrap gap-2">
            {controls.map(({ command, label, symbol }) => (
              <button
                type="button"
                key={command}
                className={buttonClass}
                disabled={!commandAllowed(command)}
                onClick={() => update({ commands: [...state.commands, command] })}
                aria-label={label}
              >
                {symbol} {label}
              </button>
            ))}
            <button
              type="button"
              className={buttonClass}
              disabled={state.commands.length === 0}
              onClick={() => update({ commands: state.commands.slice(0, -1) })}
            >
              Desfazer passo
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={state.commands.length === 0}
              onClick={() => update({ commands: [] })}
            >
              Voltar ao começo
            </button>
          </div>
          <div className={panelClass}>
            <p className="text-sm">
              Comandos:{" "}
              {state.commands.length
                ? state.commands
                    .map(
                      (command) =>
                        ({ N: "↑", E: "→", S: "↓", W: "←", L: "↶", R: "↷", F: "avançar" })[command],
                    )
                    .join(" ")
                : "nenhum"}
            </p>
            {!hideResults && (
              <p className="mt-2 text-sm">
                Posição atual: ({trace.point.x}, {trace.point.y}); {trace.steps} passos. Direção:{" "}
                {["Norte", "Leste", "Sul", "Oeste"][trace.heading]}.
              </p>
            )}
          </div>
        </>
      )}
      {kind === "enumerate" && (
        <div className={panelClass}>
          <button
            type="button"
            className={buttonClass}
            disabled={
              !samePoint(trace.point, state.target) ||
              state.recorded.some((commands) => commands.join("") === state.commands.join("")) ||
              state.recorded.length >= 70
            }
            onClick={() => update({ recorded: [...state.recorded, state.commands], commands: [] })}
          >
            Guardar este caminho e tentar outro
          </button>
          <p className="mt-3 text-sm">Caminhos distintos encontrados: {state.recorded.length}</p>
          <ol className="mt-2 list-inside list-decimal text-sm">
            {state.recorded.map((commands) => (
              <li key={commands.join("")}>
                {commands.map((command) => (command === "N" ? "↑" : "→")).join(" ")}
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {!hideResults && <Output>{routeSummary(launch, state)}</Output>}
    </div>
  );
}

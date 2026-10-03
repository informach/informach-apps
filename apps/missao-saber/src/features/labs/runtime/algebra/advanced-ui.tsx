"use client";

import { type ReactNode, useId, useState } from "react";
import type { LabToolProps, ToolLaunch, ToolState } from "../types";
import { formatNumber } from "./math";

export const advancedButton =
  "rounded-controle border-2 border-sombra bg-creme px-3 py-2 text-sm font-semibold disabled:opacity-50";
export const slots = (length: number) => Array.from({ length }, (_, i) => i + 1);
export function useAdvancedState<T extends ToolState>(
  props: LabToolProps,
  parse: (launch: ToolLaunch, raw: unknown) => T,
) {
  const state = parse(props.launch, props.state);
  const [error, setError] = useState("");
  function update(change: Record<string, unknown>) {
    try {
      const next = parse(props.launch, { ...state, ...change });
      setError("");
      props.onChange(next);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Montagem inválida.");
    }
  }
  return { state, update, error };
}
export function AdvancedFrame({
  children,
  summary,
  error,
  disabled,
}: {
  children: ReactNode;
  summary: string;
  error: string;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="space-y-4 rounded-controle border-2 border-sombra bg-papel p-4"
    >
      <legend className="px-2 font-semibold">Explore a representação</legend>
      {children}
      <p className="text-sm">{summary}</p>
      {error && (
        <p role="alert" className="rounded-controle border-2 border-red-700 p-3 text-sm">
          {error}
        </p>
      )}
    </fieldset>
  );
}
export function Range({
  label,
  value,
  onChange,
  min = -10,
  max = 10,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}: <output>{formatNumber(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 block w-full accent-[var(--ms-verde)]"
      />
    </label>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-controle border-2 border-sombra bg-papel p-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function SeriesPlot({
  values,
  label,
  start = 0,
}: {
  values: number[];
  label: string;
  start?: number;
}) {
  const id = useId();
  const minimum = Math.min(0, ...values),
    maximum = Math.max(1, ...values),
    span = maximum - minimum;
  const point = (value: number, index: number) =>
    `${30 + (index * 360) / Math.max(1, values.length - 1)},${180 - ((value - minimum) * 150) / span}`;
  return (
    <div>
      <svg
        viewBox="0 0 430 215"
        role="img"
        aria-labelledby={id}
        className="max-h-64 w-full rounded-controle bg-creme"
      >
        <title
          id={id}
        >{`${label}: ${values.map((value, index) => `posição ${index + start}, ${formatNumber(value)}`).join("; ")}`}</title>
        <line x1="30" x2="390" y1="180" y2="180" stroke="currentColor" />
        <polyline
          points={values.map(point).join(" ")}
          fill="none"
          stroke="var(--ms-verde, #237953)"
          strokeWidth="3"
        />
        {slots(values.length).map((slot) => {
          const value = values[slot - 1] ?? 0;
          return (
            <g key={slot}>
              <circle
                cx={30 + ((slot - 1) * 360) / Math.max(1, values.length - 1)}
                cy={180 - ((value - minimum) * 150) / span}
                r="4"
                fill="currentColor"
              />
              <text
                x={30 + ((slot - 1) * 360) / Math.max(1, values.length - 1)}
                y="204"
                textAnchor="middle"
                fontSize="11"
              >
                {slot - 1 + start}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs">
        Eixo horizontal: posição ou passo; vertical: valor. Os pontos representam etapas discretas.
      </p>
    </div>
  );
}

export function CartesianPlot({
  curves,
  points = [],
  label,
  xMin = -6,
  xMax = 6,
  yMin = -6,
  yMax = 6,
}: {
  curves: { id: string; label: string; points: { x: number; y: number }[]; color: string }[];
  points?: { x: number; y: number }[];
  label: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}) {
  const id = useId(),
    clip = useId();
  const x = (value: number) => 30 + ((value - xMin) * 380) / (xMax - xMin),
    y = (value: number) => 405 - ((value - yMin) * 380) / (yMax - yMin);
  return (
    <div>
      <svg
        viewBox="0 0 440 435"
        role="img"
        aria-labelledby={id}
        className="max-h-80 w-full rounded-controle bg-creme"
      >
        <title
          id={id}
        >{`${label}. Janela horizontal ${formatNumber(xMin)} a ${formatNumber(xMax)}; vertical ${formatNumber(yMin)} a ${formatNumber(yMax)}. ${points.length ? `Pontos marcados: ${points.map((point) => `(${formatNumber(point.x)}; ${formatNumber(point.y)})`).join(", ")}.` : ""}`}</title>
        <defs>
          <clipPath id={clip}>
            <rect x="30" y="25" width="380" height="380" />
          </clipPath>
        </defs>
        <rect
          x="30"
          y="25"
          width="380"
          height="380"
          fill="none"
          stroke="currentColor"
          opacity="0.25"
        />
        <g clipPath={`url(#${clip})`}>
          <line x1={x(0)} x2={x(0)} y1="25" y2="405" stroke="currentColor" opacity="0.4" />
          <line x1="30" x2="410" y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.4" />
          {curves.map((curve) => (
            <polyline
              key={curve.id}
              points={curve.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")}
              fill="none"
              stroke={curve.color}
              strokeWidth="2.5"
            />
          ))}
          {points.map((point) => (
            <circle
              key={`${point.x};${point.y}`}
              cx={x(point.x)}
              cy={y(point.y)}
              r="4"
              fill="currentColor"
            />
          ))}
        </g>
        <text x="30" y="425" fontSize="11">
          {formatNumber(xMin)}
        </text>
        <text x="410" y="425" textAnchor="end" fontSize="11">
          {formatNumber(xMax)}
        </text>
        <text x="7" y="30" fontSize="11">
          {formatNumber(yMax)}
        </text>
        <text x="7" y="405" fontSize="11">
          {formatNumber(yMin)}
        </text>
      </svg>
      <p className="mt-1 text-xs">
        {curves.map((curve) => curve.label).join("; ")}. O recorte visível não limita o domínio nem
        prova o número de soluções.
      </p>
    </div>
  );
}

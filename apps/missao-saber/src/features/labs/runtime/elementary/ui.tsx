"use client";
import type { ReactNode } from "react";
import { useId } from "react";
import type { Point } from "./geometry";

export const buttonClass =
  "min-h-11 min-w-11 rounded-controle border-2 border-sombra bg-papel px-3 py-2 font-semibold text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta disabled:cursor-not-allowed disabled:opacity-40";
export const panelClass = "rounded-controle border-2 border-sombra bg-papel p-4";
/** These numbers identify fixed ruler ticks, board cells, or object slots. */
export function positions(count: number): number[] {
  return Array.from({ length: count }, (_, position) => position);
}
export function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}: {value}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={disabled || value <= min}
          aria-label={`Diminuir ${label}`}
        >
          −
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-h-11 min-w-0 flex-1 accent-[var(--ms-verde)]"
        />
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={disabled || value >= max}
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
export function Options({
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
        className="mt-2 block min-h-11 w-full rounded-controle border-2 border-sombra bg-papel p-2 text-tinta"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
export function Output({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-controle bg-creme p-3 text-sm leading-relaxed"
      role="status"
      aria-live="polite"
    >
      {children}
    </p>
  );
}
export function Plane({
  points,
  lines = [],
  polygons = [],
  extent = 10,
  description,
  horizontalAxis = "x",
  minimum = -extent,
  showCoordinates = true,
}: {
  points: { point: Point; label: string; filled?: boolean }[];
  lines?: Point[][];
  polygons?: Point[][];
  extent?: number;
  description: string;
  horizontalAxis?: "x" | "y";
  minimum?: number;
  showCoordinates?: boolean;
}) {
  const size = 300;
  const unit = 260 / (extent - minimum);
  const px = (x: number) => 20 + (x - minimum) * unit;
  const py = (y: number) => 280 - (y - minimum) * unit;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto w-full max-w-md rounded-controle bg-white"
      role="img"
      aria-label={description}
    >
      {showCoordinates && (
        <text x={285} y={py(0) - 4} fontSize={12} fill="#172e2a">
          {horizontalAxis}
        </text>
      )}
      {showCoordinates && (
        <text x={px(0) + 5} y={14} fontSize={12} fill="#172e2a">
          {horizontalAxis === "x" ? "y" : "x"}
        </text>
      )}
      {Array.from({ length: extent - minimum + 1 }, (_, index) => index + minimum).map((value) => (
        <g key={value}>
          <line
            x1={px(value)}
            y1={20}
            x2={px(value)}
            y2={280}
            stroke={value === 0 ? "#172e2a" : "#d8dfda"}
            strokeWidth={value === 0 ? 2 : 1}
          />
          <line
            x1={20}
            y1={py(value)}
            x2={280}
            y2={py(value)}
            stroke={value === 0 ? "#172e2a" : "#d8dfda"}
            strokeWidth={value === 0 ? 2 : 1}
          />
          {showCoordinates && (extent <= 6 || value % 2 === 0) && (
            <>
              <text x={px(value)} y={295} textAnchor="middle" fontSize={10} fill="#172e2a">
                {value}
              </text>
              <text x={4} y={py(value) + 3} fontSize={10} fill="#172e2a">
                {value}
              </text>
            </>
          )}
        </g>
      ))}
      {polygons
        .map((polygon, index) => ({ polygon, index }))
        .map(({ polygon, index }) => (
          <polygon
            key={index}
            points={polygon.map((point) => `${px(point.x)},${py(point.y)}`).join(" ")}
            fill={index === 0 ? "#c8e6d4" : "#ffdab1"}
            fillOpacity={0.6}
            stroke={index === 0 ? "#176344" : "#994711"}
            strokeWidth={2}
            strokeDasharray={index === 0 ? undefined : "6 3"}
          />
        ))}
      {lines
        .map((line, position) => ({ line, position }))
        .map(({ line, position }) => (
          <polyline
            key={position}
            points={line.map((point) => `${px(point.x)},${py(point.y)}`).join(" ")}
            fill="none"
            stroke="#176344"
            strokeWidth={3}
          />
        ))}
      {points.map(({ point, label, filled }) => (
        <g key={label}>
          <circle
            cx={px(point.x)}
            cy={py(point.y)}
            r={5}
            fill={filled ? "#994711" : "#176344"}
            stroke="white"
            strokeWidth={1}
          />
          <text
            x={px(point.x) + 7}
            y={py(point.y) - 7}
            fill="#172e2a"
            fontWeight="bold"
            fontSize={12}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

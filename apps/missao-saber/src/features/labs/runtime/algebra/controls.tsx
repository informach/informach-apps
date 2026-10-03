"use client";
import { type ReactNode, useId, useMemo, useState } from "react";
import type { LabToolProps, ToolState } from "../types";
import { formatNumber } from "./math";
export const panel = "rounded-controle border-2 border-sombra bg-papel p-4";
export const button =
  "rounded-controle border-2 border-sombra bg-creme px-3 py-2 text-sm font-semibold disabled:opacity-50";
/** Mathematical positions remain stable as quantities grow or shrink. */
export const positions = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
export function Slider({
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
    <div>
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}: <output>{formatNumber(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[var(--ms-verde)]"
      />
    </div>
  );
}
export function Select({
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
    <div>
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-controle border-2 border-sombra bg-papel p-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function Check({
  children,
  checked,
  onChange,
}: {
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}
export function useTool<T extends ToolState>(
  props: LabToolProps,
  parse: (launch: LabToolProps["launch"], raw: unknown) => T,
) {
  const state = useMemo(() => parse(props.launch, props.state), [parse, props.launch, props.state]);
  const [error, setError] = useState("");
  function update(partial: Partial<T>) {
    try {
      const next = parse(props.launch, { ...state, ...partial });
      setError("");
      props.onChange(next);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Montagem inválida.");
    }
  }
  return { state, update, error };
}
export function Frame({
  children,
  error,
  summary,
  disabled,
}: {
  children: ReactNode;
  error: string;
  summary: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">Controles da montagem</legend>
      {children}
      {error && (
        <p
          role="alert"
          className="rounded-controle border-2 border-red-700 p-3 text-sm text-red-900"
        >
          {error} A montagem anterior foi preservada.
        </p>
      )}
      <details className={panel}>
        <summary className="cursor-pointer font-semibold">Descrição da montagem em texto</summary>
        <p className="mt-2 text-sm">{summary}</p>
      </details>
    </fieldset>
  );
}

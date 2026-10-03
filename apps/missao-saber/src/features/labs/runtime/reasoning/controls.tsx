"use client";

import { type ReactNode, useId, useState } from "react";

export const fieldClass =
  "rounded-controle border-2 border-sombra bg-papel px-3 py-2 text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde";
export const buttonClass = `${fieldClass} min-h-11 font-semibold disabled:opacity-50`;
export const panelClass = "rounded-card border-2 border-sombra bg-papel p-4";

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ value: number; text: string } | null>(null);
  const text = draft?.value === value ? draft.text : String(value);
  return (
    <div className="grid gap-1">
      <label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <input
        className={fieldClass}
        id={id}
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        min={min}
        max={max}
        step={step}
        value={text}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          const valid = Number.isFinite(next) && event.currentTarget.validity.valid;
          setDraft({ value: valid ? next : value, text: event.currentTarget.value });
          if (valid) onChange(next);
        }}
        onBlur={() => setDraft(null)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-tinta-suave">
          {hint}
        </p>
      )}
    </div>
  );
}
export function MoneyField({
  label,
  cents,
  max = 1000000,
  onChange,
}: {
  label: string;
  cents: number;
  max?: number;
  onChange: (cents: number) => void;
}) {
  return (
    <NumberField
      label={`${label} (R$)`}
      value={cents / 100}
      min={0}
      max={max / 100}
      step={0.01}
      onChange={(value) => onChange(Math.round(value * 100))}
    />
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
      <input
        className="size-5 accent-verde"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  );
}
export function Controls({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}
export function Stat({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-controle bg-creme p-3 text-sm" role="status" aria-live="polite">
      {children}
    </div>
  );
}

"use client";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Confirmação antes de agir: diálogo modal, centrado na tela grande e preso
 * embaixo no celular, como no desenho. O `<dialog>` nativo prende o foco e
 * fecha com Esc.
 */
export function ConfirmSheet({
  open,
  title,
  consequences,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  consequences: string[];
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="fixed inset-x-0 bottom-0 m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[22px] border border-line-warm bg-surface p-0 text-ink shadow-xl backdrop:bg-night/45 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-[560px] sm:rounded-[22px]"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <span
          aria-hidden="true"
          className="mx-auto h-1.5 w-11 rounded-full bg-line-warm sm:hidden"
        />
        <h2
          id={titleId}
          className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.01em]"
        >
          {title}
        </h2>
        <ul className="m-0 grid gap-2 pl-5 text-[15px] text-ink-soft">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {children}
      </div>
    </dialog>
  );
}

/** Lista de opções em `<select>`, no visual dos campos do Bastidores. */
export function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border-[1.5px] border-field bg-surface px-3 font-medium text-ink"
      >
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function NoteField({
  id,
  label,
  value,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={200}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border-[1.5px] border-field bg-surface px-3.5 py-2.5 font-medium text-ink"
      />
    </div>
  );
}

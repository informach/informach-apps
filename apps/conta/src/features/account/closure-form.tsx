"use client";
import { useActionState } from "react";
import { closureAction } from "./closure-actions";

export function ClosureForm({
  values,
  label,
  confirmation,
  irreversible = false,
}: {
  values: Record<string, string>;
  label: string;
  confirmation?: string;
  irreversible?: boolean;
}) {
  const [state, action, pending] = useActionState(closureAction, { message: "" });
  return (
    <form action={action} className="form-stack closure-form">
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirmation && (
        <label className="check-label">
          <input type="checkbox" name="confirmed" required disabled={pending} />
          {confirmation}
        </label>
      )}
      {irreversible && (
        <label>
          Para confirmar, digite ENCERRAR COMPASSO
          <input
            name="confirmation"
            autoComplete="off"
            required
            pattern="ENCERRAR COMPASSO"
            disabled={pending}
          />
        </label>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Registrando…" : label}
      </button>
      {state.message && (
        <p role="alert" className="form-message">
          {state.message}
        </p>
      )}
    </form>
  );
}

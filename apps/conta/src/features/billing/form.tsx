"use client";
import { type ReactNode, useActionState, useState } from "react";
import { type BillingFormState, billingAction } from "./actions";

export function BillingForm({
  values,
  label,
  children,
  enabled = true,
  confirmation,
}: {
  values: Record<string, string | undefined>;
  label: string;
  children?: ReactNode;
  enabled?: boolean;
  confirmation?: string;
}) {
  const [state, action, pending] = useActionState<BillingFormState, FormData>(billingAction, {
    ok: false,
    message: "",
  });
  // A failed action/revalidation keeps this same purchase key until the page is intentionally reopened.
  const [requestKey] = useState(values.requestKey);
  return (
    <form action={action} className="form-stack billing-form">
      {Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => (
          <input
            key={name}
            type="hidden"
            name={name}
            value={name === "requestKey" ? requestKey : value}
          />
        ))}
      {children}
      {confirmation && (
        <label className="check-label">
          <input type="checkbox" name="confirmed" required disabled={!enabled || pending} />
          {confirmation}
        </label>
      )}
      <button type="submit" disabled={!enabled || pending}>
        {pending ? "Confirmando…" : label}
      </button>
      {state.message && (
        <p role="status" className={state.ok ? "success" : "form-message"}>
          {state.message}
        </p>
      )}
    </form>
  );
}

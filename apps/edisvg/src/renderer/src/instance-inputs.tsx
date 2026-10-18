import type { Behavior } from "@informach/edi-motion/behavior";
import { useId } from "react";
import type { ComponentInstance } from "../../shared/componentContracts";
import { FormNumberField } from "./form-number-field";

export function InstanceInputs({
  behavior,
  value,
  change,
}: {
  behavior: Behavior;
  value: ComponentInstance;
  change(value: ComponentInstance): void;
}) {
  const prefix = useId(),
    overrides = value.inputOverrides ?? [];
  const set = (inputId: string, next: string | number | boolean | undefined) =>
    change({
      ...value,
      inputOverrides: [
        ...overrides.filter((override) => override.inputId !== inputId),
        ...(next === undefined ? [] : [{ inputId, value: next }]),
      ],
    });
  return (
    <details>
      <summary>Inputs iniciais desta instância</summary>
      <p className="micro">
        Overrides são locais. Links bidirecionais atualizam também os dados desta instância; Reset
        retorna a estes valores.
      </p>
      {behavior.inputs
        .filter((input) => input.kind !== "trigger")
        .map((input) => {
          const override = overrides.find((override) => override.inputId === input.id),
            current = override?.value ?? input.initial,
            readonly = behavior.data?.links.some(
              (link) => link.inputId === input.id && link.direction === "one-way",
            );
          return (
            <fieldset key={input.id}>
              <legend>{input.name}</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!override}
                  disabled={readonly}
                  onChange={(event) =>
                    set(input.id, event.target.checked ? input.initial : undefined)
                  }
                />
                Personalizar {input.name}
              </label>
              {readonly && <small>Controlado pelo modelo de dados (somente leitura).</small>}
              <fieldset disabled={!override || readonly}>
                {input.kind === "number" ? (
                  <FormNumberField
                    id={`${prefix}-${input.id}`}
                    label={`Valor inicial de ${input.name}`}
                    value={Number(current)}
                    min={String(input.min)}
                    max={String(input.max)}
                    change={(raw) => set(input.id, raw.trim() ? Number(raw) : Number.NaN)}
                  />
                ) : input.kind === "boolean" ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={current === true}
                      onChange={(event) => set(input.id, event.target.checked)}
                    />
                    Valor de {input.name}
                  </label>
                ) : input.kind === "enum" ? (
                  <select
                    aria-label={`Valor inicial de ${input.name}`}
                    value={String(current)}
                    onChange={(event) => set(input.id, event.target.value)}
                  >
                    {input.values.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : input.kind === "color" ? (
                  <input
                    aria-label={`Valor inicial de ${input.name}`}
                    type="color"
                    value={String(current)}
                    onChange={(event) => set(input.id, event.target.value)}
                  />
                ) : (
                  <textarea
                    aria-label={`Valor inicial de ${input.name}`}
                    value={String(current)}
                    maxLength={10000}
                    onChange={(event) => set(input.id, event.target.value)}
                  />
                )}
              </fieldset>
            </fieldset>
          );
        })}
    </details>
  );
}

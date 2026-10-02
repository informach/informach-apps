"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Alternativa } from "@/components/ui/alternativa";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import type { PublicItem } from "@/features/content/types";

export function initialResponse(item: PublicItem | undefined) {
  return item?.type === "ordering" ? JSON.stringify(item.steps.map((step) => step.id)) : "";
}

export function ResponseInput({
  item,
  value,
  disabled,
  onChange,
}: {
  item: PublicItem;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (item.type === "choice")
    return (
      <div className="grid gap-3">
        {item.options.map((option, index) => (
          <Alternativa
            key={option}
            name="answer"
            valor={option}
            letra={String.fromCharCode(65 + index)}
            marcada={value === option}
            desabilitada={disabled}
            onEscolher={() => onChange(option)}
          />
        ))}
      </div>
    );

  if (item.type === "numeric")
    return (
      <div>
        <label
          htmlFor={`answer-${item.id}`}
          className="block font-display font-semibold text-tinta"
        >
          Seu valor{item.numeric.unit ? ` em ${item.numeric.unit.symbol}` : ""}
        </label>
        <input
          id={`answer-${item.id}`}
          type="text"
          value={value}
          disabled={disabled}
          inputMode="text"
          autoComplete="off"
          aria-describedby={`format-${item.id}`}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 block min-h-12 w-full max-w-md rounded-controle border-2 border-sombra bg-creme px-4 text-lg text-tinta"
        />
        <p id={`format-${item.id}`} className="mt-2 text-sm text-tinta-suave">
          Formatos aceitos:{" "}
          {item.numeric.acceptedForms
            .map((form) =>
              form === "fraction" ? "fração" : form === "decimal" ? "decimal" : "inteiro",
            )
            .join(", ")}
          .
          {item.numeric.acceptedForms.includes("fraction") &&
            " Na fração, separe os números com / (por exemplo, 3/4)."}
          {item.numeric.unit &&
            ` A unidade ${item.numeric.unit.symbol} já está indicada; basta escrever o valor.`}
        </p>
      </div>
    );

  if (item.type === "justification")
    return (
      <div>
        <label
          htmlFor={`answer-${item.id}`}
          className="block font-display font-semibold text-tinta"
        >
          {item.response.label}
        </label>
        <textarea
          id={`answer-${item.id}`}
          value={value}
          disabled={disabled}
          minLength={item.response.minLength}
          maxLength={item.response.maxLength}
          rows={6}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 block w-full rounded-controle border-2 border-sombra bg-creme p-4 text-tinta"
          aria-describedby={`length-${item.id}`}
        />
        <p id={`length-${item.id}`} className="mt-2 text-sm text-tinta-suave">
          {value.trim().length} de {item.response.maxLength} caracteres. Esta reflexão será
          registrada e comparada com critérios de uma boa justificativa, sem nota automática.
        </p>
      </div>
    );

  const fallback = item.steps.map((step) => step.id);
  let order = fallback;
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === fallback.length &&
      parsed.every((id) => typeof id === "string" && fallback.includes(id))
    )
      order = parsed;
  } catch {
    order = fallback;
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const current = next[index];
    const other = next[target];
    if (!current || !other) return;
    next[index] = other;
    next[target] = current;
    onChange(JSON.stringify(next));
  };
  return (
    <ol className="grid gap-3" aria-label="Passos na ordem escolhida">
      {order.map((id, index) => {
        const step = item.steps.find((candidate) => candidate.id === id);
        if (!step) return null;
        return (
          <li
            key={step.id}
            className="flex items-center gap-3 rounded-card border-2 border-sombra bg-creme p-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lima font-display font-semibold text-tinta">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-tinta">{step.label}</span>
            <div className="flex gap-1">
              <BotaoChapa
                type="button"
                tom="contorno"
                medida="p"
                disabled={disabled || index === 0}
                aria-label={`Mover “${step.label}” para cima`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={17} aria-hidden="true" />
              </BotaoChapa>
              <BotaoChapa
                type="button"
                tom="contorno"
                medida="p"
                disabled={disabled || index === order.length - 1}
                aria-label={`Mover “${step.label}” para baixo`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={17} aria-hidden="true" />
              </BotaoChapa>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

"use client";
import { useRef } from "react";
import type { AnswerKey } from "./types";

const symbols: Record<AnswerKey, { text: string; label: string; insert: string; inside?: number }> =
  {
    decimal: { text: ",", label: "Inserir vírgula decimal", insert: "," },
    fraction: { text: "a/b", label: "Inserir barra de fração", insert: "/" },
    negative: { text: "−", label: "Inserir sinal de menos", insert: "-" },
    power: { text: "aⁿ", label: "Inserir potência", insert: "^" },
    root: { text: "√", label: "Inserir raiz quadrada", insert: "sqrt()", inside: 5 },
    parentheses: { text: "( )", label: "Inserir parênteses", insert: "()", inside: 1 },
  };

export function insertAnswerSymbol(value: string, start: number, end: number, key: AnswerKey) {
  const symbol = symbols[key];
  const selection = value.slice(start, end);
  const insert =
    symbol.inside === undefined
      ? symbol.insert
      : `${symbol.insert.slice(0, symbol.inside)}${selection}${symbol.insert.slice(symbol.inside)}`;
  const next = value.slice(0, start) + insert + value.slice(end);
  return {
    value: next,
    cursor:
      start + (symbol.inside === undefined ? insert.length : symbol.inside + selection.length),
  };
}

/** Author-declared symbols augment a normal text field, including its selection/caret. */
export function MathAnswer({
  id,
  value,
  onChange,
  keys = [],
  hintId,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  keys?: AnswerKey[];
  hintId: string;
  className: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={input}
        id={id}
        type="text"
        className={className}
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
      />
      {keys.length > 0 && (
        <fieldset aria-label="Símbolos para esta resposta" className="mt-2 flex flex-wrap gap-2">
          <legend className="sr-only">Símbolos para esta resposta</legend>
          {[...new Set(keys)].map((key) => (
            <button
              type="button"
              key={key}
              aria-label={symbols[key].label}
              className="min-h-11 min-w-11 rounded-controle border-2 border-sombra bg-white px-3 font-semibold"
              onClick={() => {
                const field = input.current;
                if (!field) return;
                const next = insertAnswerSymbol(
                  value,
                  field.selectionStart ?? value.length,
                  field.selectionEnd ?? value.length,
                  key,
                );
                if (next.value.length > 1000) return;
                onChange(next.value);
                requestAnimationFrame(() => {
                  field.focus();
                  field.setSelectionRange(next.cursor, next.cursor);
                });
              }}
            >
              {symbols[key].text}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

"use client";

import type { LabToolProps } from "../types";
import { cardConditions, cardEvents, cardModel, cardOutcomes, parseCards } from "./cards";
import { fraction } from "./common";
import { buttonClass, NumberField, Stat } from "./controls";

export function CardsTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseCards(launch, raw);
  const cards = cardOutcomes(state);
  const model = cardModel(state);
  return (
    <div className="grid gap-4">
      <NumberField
        label="Números de 1 até, em cada naipe"
        value={state.ranks}
        min={2}
        max={6}
        onChange={(ranks) => onChange({ ...state, ranks, selected: [] })}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold">Evento que queremos observar</legend>
        {cardEvents.map((event) => (
          <button
            key={event.id}
            className={`${buttonClass} text-left`}
            type="button"
            aria-pressed={state.event === event.id}
            onClick={() => onChange({ ...state, event: event.id, selected: [] })}
          >
            {event.label}
          </button>
        ))}
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold">Informação conhecida sobre a carta retirada</legend>
        {cardConditions.map((condition) => (
          <button
            key={condition.id}
            className={`${buttonClass} text-left`}
            type="button"
            aria-pressed={state.given === condition.id}
            onClick={() => onChange({ ...state, given: condition.id, selected: [] })}
          >
            {condition.label}
          </button>
        ))}
      </fieldset>
      <p className="text-sm">
        Copas e ouros são vermelhos; paus e espadas são pretos. Há uma carta de cada número em cada
        naipe. Marcar uma carta é sua decisão, sem conferência automática.
      </p>
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="sr-only">Cartas do baralho didático</legend>
        {cards.map((card) => (
          <button
            key={card.id}
            className={`${buttonClass} ${state.selected.includes(card.id) ? "bg-creme ring-2 ring-verde" : ""}`}
            type="button"
            aria-label={card.label}
            aria-pressed={state.selected.includes(card.id)}
            onClick={() =>
              onChange({
                ...state,
                selected: state.selected.includes(card.id)
                  ? state.selected.filter((id) => id !== card.id)
                  : [...state.selected, card.id],
              })
            }
          >
            <span
              className={`block text-2xl ${card.red ? "text-red-800" : "text-tinta"}`}
              aria-hidden="true"
            >
              {card.rank} {card.symbol}
            </span>
            <span className="block text-xs">{card.label}</span>
            <span className="block text-xs">
              {state.selected.includes(card.id) ? "Marcada" : "Não marcada"}
            </span>
          </button>
        ))}
      </fieldset>
      {!hideResults && (
        <Stat>
          Modelo: {model.favorable.length} favoráveis entre {model.eligible.length} cartas da
          condição; probabilidade {fraction(model.favorable.length, model.eligible.length)}. A
          interseção é contada uma única vez.
        </Stat>
      )}
    </div>
  );
}

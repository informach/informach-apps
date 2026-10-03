"use client";
import type { LabToolProps } from "../types";
import { money } from "./common";
import { consumerMetrics, parseConsumer } from "./consumer";
import { Controls, MoneyField, NumberField, panelClass, Stat } from "./controls";
export function ConsumerTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseConsumer(launch, raw);
  const metrics = consumerMetrics(state);
  if (launch.mode === "leve-pague") {
    const units = Array.from({ length: state.take }, (_, index) => ({
      number: index + 1,
      paid: index < state.pay,
    }));
    return (
      <div className="grid gap-4">
        <Controls>
          <MoneyField
            label="Preço normal de uma unidade"
            cents={state.unitCents}
            max={100000}
            onChange={(unitCents) => onChange({ ...state, unitCents })}
          />
          <NumberField
            label="Unidades recebidas (leve)"
            value={state.take}
            min={Math.max(2, state.pay)}
            max={10}
            onChange={(take) => onChange({ ...state, take })}
          />
          <NumberField
            label="Unidades cobradas (pague)"
            value={state.pay}
            min={1}
            max={state.take}
            onChange={(pay) => onChange({ ...state, pay })}
          />
        </Controls>
        <div className="flex flex-wrap gap-2">
          {units.map((unit) => (
            <div key={unit.number} className={panelClass}>
              <p>Unidade {unit.number}</p>
              <p>{unit.paid ? `Paga: ${money(state.unitCents)}` : "Recebida sem cobrança"}</p>
            </div>
          ))}
        </div>
        {!hideResults && (
          <Stat>
            Total pago: {money(metrics.promotionTotal)}. Unidades levadas: {state.take}. O preço por
            unidade divide o total pago por todas as unidades recebidas.
          </Stat>
        )}
      </div>
    );
  }
  if (launch.mode === "economia-por-quantidade")
    return (
      <div className="grid gap-4">
        <Controls>
          <MoneyField
            label="Preço original por unidade"
            cents={state.unitCents}
            max={100000}
            onChange={(unitCents) => onChange({ ...state, unitCents })}
          />
          <MoneyField
            label="Preço alternativo por unidade"
            cents={state.alternateCents}
            max={100000}
            onChange={(alternateCents) => onChange({ ...state, alternateCents })}
          />
          <NumberField
            label="Quantidade necessária"
            value={state.needed}
            min={1}
            max={100}
            onChange={(needed) => onChange({ ...state, needed })}
          />
        </Controls>
        {!hideResults && (
          <Stat>
            Total original: {money(state.unitCents * state.needed)}. Total alternativo:{" "}
            {money(state.alternateCents * state.needed)}. Compare esses totais com a diferença por
            unidade.
          </Stat>
        )}
      </div>
    );
  return (
    <div className="grid gap-4">
      <Controls>
        <MoneyField
          label="Preço fixo do passe"
          cents={state.fixedCents}
          max={100000}
          onChange={(fixedCents) => onChange({ ...state, fixedCents })}
        />
        <NumberField
          label="Usos realmente necessários no período"
          value={state.uses}
          min={1}
          max={100}
          onChange={(uses) => onChange({ ...state, uses })}
        />
        {launch.mode === "passe-ou-avulso" && (
          <MoneyField
            label="Preço de um bilhete avulso"
            cents={state.unitCents}
            max={100000}
            onChange={(unitCents) => onChange({ ...state, unitCents })}
          />
        )}
      </Controls>
      {!hideResults && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={panelClass}>
            <h4 className="font-bold">Passe</h4>
            <p>{money(state.fixedCents)} no período</p>
            <p>
              {state.uses} usos: {money(metrics.perUse)} por uso
            </p>
          </div>
          {launch.mode === "passe-ou-avulso" && (
            <div className={panelClass}>
              <h4 className="font-bold">Bilhetes avulsos</h4>
              <p>
                {state.uses} × {money(state.unitCents)} = {money(metrics.ticketsTotal)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import type { LabToolProps } from "../types";
import {
  budgetDefinition,
  coinCents,
  coinPrice,
  coinTotal,
  ledgerMetrics,
  offerMetrics,
  parseBudget,
} from "./budget";
import { decimal, money } from "./common";
import { consumerTool } from "./consumer";
import { ConsumerTool } from "./consumer-component";
import {
  buttonClass,
  Controls,
  MoneyField,
  NumberField,
  panelClass,
  Stat,
  Toggle,
} from "./controls";

export function BudgetTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  if (consumerTool.modes.includes(launch.mode))
    return (
      <ConsumerTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />
    );
  const state = parseBudget(launch, raw);
  const definition = budgetDefinition(launch);
  if (state.kind === "coins")
    return (
      <div className="grid gap-4">
        <p className="text-lg font-bold">Preço: {money(coinPrice(launch))}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {coinCents.map((value, index) => (
            <div className={panelClass} key={value}>
              <div className="mx-auto flex size-16 items-center justify-center rounded-full border-2 border-sombra bg-creme font-bold">
                {money(value)}
              </div>
              <p className="my-2 text-center">{state.counts[index]} moedas</p>
              <div className="flex justify-center gap-2">
                <button
                  className={buttonClass}
                  type="button"
                  aria-label={`Retirar uma moeda de ${money(value)}`}
                  disabled={(state.counts[index] ?? 0) === 0}
                  onClick={() =>
                    onChange({
                      ...state,
                      counts: state.counts.map((count, at) => (at === index ? count - 1 : count)),
                    })
                  }
                >
                  −
                </button>
                <button
                  className={buttonClass}
                  type="button"
                  aria-label={`Acrescentar uma moeda de ${money(value)}`}
                  disabled={(state.counts[index] ?? 0) >= (launch.grade <= 3 ? 5 : 20)}
                  onClick={() =>
                    onChange({
                      ...state,
                      counts: state.counts.map((count, at) => (at === index ? count + 1 : count)),
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        {!hideResults && (
          <Stat>
            Total entregue: {money(coinTotal(state))}.{" "}
            {coinTotal(state) < coinPrice(launch)
              ? `Ainda faltam ${money(coinPrice(launch) - coinTotal(state))}.`
              : `O pagamento cobre o preço. Compare o que entregou com o que a compra custa.`}
          </Stat>
        )}
      </div>
    );
  if (state.kind === "shop")
    return (
      <div className="grid gap-4">
        <Controls>
          <NumberField
            label="Quantidade necessária por pedido (g úteis)"
            value={state.needed}
            min={1}
            max={10000}
            onChange={(needed) => onChange({ ...state, needed })}
          />
          {definition.target === "useful" && (
            <NumberField
              label="Número de pedidos separados"
              value={state.purchases}
              min={1}
              max={12}
              onChange={(purchases) => onChange({ ...state, purchases })}
            />
          )}
        </Controls>
        <div className="grid gap-4 md:grid-cols-2">
          {(["offerA", "offerB"] satisfies ("offerA" | "offerB")[]).map((key) => {
            const offer = state[key];
            const packKey = key === "offerA" ? "packsA" : "packsB";
            const metrics = offerMetrics(offer, state.needed, state[packKey]);
            const label = key === "offerA" ? "A" : "B";
            const complex = !["preco-unitario", "unidade-comum"].includes(launch.mode);
            return (
              <div className={`${panelClass} grid gap-3`} key={key}>
                <h4 className="text-lg font-bold">Oferta {label}</h4>
                <MoneyField
                  label={`Preço de um pacote ${label}`}
                  cents={offer.priceCents}
                  onChange={(priceCents) => onChange({ ...state, [key]: { ...offer, priceCents } })}
                />
                <NumberField
                  label={`Quantidade do pacote ${label} (g)`}
                  value={offer.amount}
                  min={Math.ceil(100 / (100 - offer.lossPercent))}
                  max={10000}
                  onChange={(amount) => onChange({ ...state, [key]: { ...offer, amount } })}
                />
                {!hideResults && (
                  <p className="text-xs">
                    {offer.amount} g = {decimal(offer.amount / 1000, 3)} kg. Preço por kg:{" "}
                    {money(metrics.unitCentsPerKg)}.
                  </p>
                )}
                {complex && (
                  <>
                    <MoneyField
                      label={`Frete de um pedido ${label}`}
                      cents={offer.freightCents}
                      onChange={(freightCents) =>
                        onChange({ ...state, [key]: { ...offer, freightCents } })
                      }
                    />
                    <NumberField
                      label={`Perda prevista ${label} (%)`}
                      value={offer.lossPercent}
                      min={0}
                      max={Math.min(90, Math.floor(100 - 100 / offer.amount))}
                      onChange={(lossPercent) =>
                        onChange({ ...state, [key]: { ...offer, lossPercent } })
                      }
                    />
                    <NumberField
                      label={`Pacotes ${label} que você compraria`}
                      value={state[packKey]}
                      min={0}
                      max={10000}
                      onChange={(packs) => onChange({ ...state, [packKey]: packs })}
                    />
                    {!hideResults && (
                      <>
                        <div
                          className="h-6 overflow-hidden rounded border border-sombra bg-creme"
                          role="img"
                          aria-label={`${metrics.chosenUseful} g úteis para necessidade de ${state.needed} g`}
                        >
                          <div
                            className="h-full bg-verde"
                            style={{
                              width: `${Math.min(100, (metrics.chosenUseful / state.needed) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-sm">
                          Útil por pacote: {metrics.usefulPerPack} g. Sua compra:{" "}
                          {metrics.chosenUseful} g por {money(metrics.chosenTotalCents)}.{" "}
                          {metrics.surplus < 0
                            ? `Faltam ${-metrics.surplus} g.`
                            : `Sobram ${metrics.surplus} g.`}
                        </p>
                      </>
                    )}
                    <p className="text-xs">
                      Quantidade útil arredondada para baixo ao grama; pacotes sempre inteiros;
                      frete uma vez por pedido.
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <Stat>
          {["preco-unitario", "unidade-comum"].includes(launch.mode)
            ? "A comparação unitária ignora frete e perdas por definição deste roteiro."
            : "Para comparar as ofertas, primeiro encontre a compra mínima que atende à necessidade em cada uma. Não compare um pedido insuficiente com outro completo."}
        </Stat>
      </div>
    );
  const metrics = ledgerMetrics(state);
  const rows = [
    { name: "Renda", cents: state.incomeCents, kind: "entrada" },
    { name: "Despesas fixas do mês", cents: -state.fixedCents, kind: "saída" },
    { name: "Gastos semanais × 4", cents: -state.weeklyCents * 4, kind: "saída" },
    {
      name: "Reserva para despesa anual ÷ 12",
      cents: -metrics.annualReserveCents,
      kind: "reserva",
    },
    {
      name: "Lazer opcional",
      cents: state.includeLeisure ? -state.leisureCents : 0,
      kind: "saída",
    },
    { name: "Contribuição para a meta", cents: -state.contributionCents, kind: "reserva" },
    { name: "Imprevisto deste mês", cents: -state.emergencyCents, kind: "saída" },
  ];
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Orçamento mensal didático: 4 semanas. Despesas em linhas diferentes não se sobrepõem. A
        despesa anual é provisionada em 12 reservas, arredondando a reserva para cima ao centavo.
      </p>
      <Controls>
        <MoneyField
          label="Renda mensal"
          cents={state.incomeCents}
          onChange={(incomeCents) => onChange({ ...state, incomeCents })}
        />
        <MoneyField
          label="Despesas fixas mensais"
          cents={state.fixedCents}
          onChange={(fixedCents) => onChange({ ...state, fixedCents })}
        />
        <MoneyField
          label="Despesa por semana"
          cents={state.weeklyCents}
          onChange={(weeklyCents) => onChange({ ...state, weeklyCents })}
        />
        <MoneyField
          label="Despesa anual separada"
          cents={state.annualCents}
          onChange={(annualCents) => onChange({ ...state, annualCents })}
        />
        <MoneyField
          label="Lazer mensal opcional"
          cents={state.leisureCents}
          onChange={(leisureCents) => onChange({ ...state, leisureCents })}
        />
        <MoneyField
          label="Imprevisto no mês"
          cents={state.emergencyCents}
          onChange={(emergencyCents) => onChange({ ...state, emergencyCents })}
        />
      </Controls>
      <Toggle
        label="Manter a despesa de lazer neste plano"
        checked={state.includeLeisure}
        onChange={(includeLeisure) => onChange({ ...state, includeLeisure })}
      />
      <div className={panelClass}>
        <h4 className="mb-3 font-bold">Meta sem rendimentos</h4>
        <Controls>
          <NumberField
            label="Meta (R$)"
            value={state.goalCents / 100}
            min={state.alreadySavedCents / 100}
            max={10000}
            step={0.01}
            onChange={(value) => onChange({ ...state, goalCents: Math.round(value * 100) })}
          />
          <MoneyField
            label="Já guardado"
            cents={state.alreadySavedCents}
            max={state.goalCents}
            onChange={(alreadySavedCents) => onChange({ ...state, alreadySavedCents })}
          />
          <NumberField
            label="Prazo em meses"
            value={state.months}
            min={1}
            max={24}
            onChange={(months) => onChange({ ...state, months })}
          />
          <MoneyField
            label="Contribuição mensal planejada"
            cents={state.contributionCents}
            onChange={(contributionCents) => onChange({ ...state, contributionCents })}
          />
        </Controls>
        {!hideResults && (
          <p className="mt-3 text-sm">
            Projeção da meta: {money(metrics.projectedSavedCents)}.{" "}
            {metrics.projectedSavedCents >= state.goalCents
              ? "O plano alcança a meta se as contribuições forem mantidas."
              : `Faltariam ${money(state.goalCents - metrics.projectedSavedCents)} no prazo.`}
          </p>
        )}
      </div>
      {!hideResults && (
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">
              Fluxo do mês: cada linha entra uma vez
            </caption>
            <thead>
              <tr>
                <th className="p-2">Categoria</th>
                <th className="p-2">Papel</th>
                <th className="p-2">Valor mensal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-sombra" key={row.name}>
                  <th className="p-2">{row.name}</th>
                  <td className="p-2">{row.kind}</td>
                  <td className="p-2">{money(row.cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-sombra">
                <th className="p-2" colSpan={2}>
                  Saldo após reservas
                </th>
                <td className="p-2 font-bold">{money(metrics.balanceCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!hideResults && (
        <Stat>
          {metrics.balanceCents >= 0
            ? `O plano deixa ${money(metrics.balanceCents)} neste mês.`
            : `O plano excede a renda em ${money(-metrics.balanceCents)}. Replaneje as escolhas.`}{" "}
          Uma meta matematicamente calculada ainda precisa caber no orçamento.
        </Stat>
      )}
    </div>
  );
}

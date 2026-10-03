"use client";

import type { LabToolProps } from "../types";
import { decimal, money } from "./common";
import { buttonClass, Controls, NumberField, panelClass, Stat, Toggle } from "./controls";
import {
  compoundCents,
  contributionBalance,
  type FinanceField,
  type FinanceState,
  financeDefinition,
  financeTimeline,
  financialMetrics,
  parseFinance,
} from "./finance";

const fieldLabels: Record<
  FinanceField,
  { label: string; scale: number; min: number; max: number; step: number }
> = {
  principalCents: {
    label: "Capital ou preço de referência (R$)",
    scale: 100,
    min: 0,
    max: 100000000,
    step: 1,
  },
  rateBps: { label: "Taxa por mês (%)", scale: 100, min: -500, max: 500, step: 1 },
  periods: { label: "Prazo (meses)", scale: 1, min: 1, max: 36, step: 1 },
  contributionCents: { label: "Aporte por mês (R$)", scale: 100, min: 0, max: 100000000, step: 1 },
  inflationBps: { label: "Inflação por mês (%)", scale: 100, min: -500, max: 1000, step: 1 },
  feeCents: { label: "Tarifa fixa no resgate (R$)", scale: 100, min: 0, max: 100000000, step: 1 },
  taxBps: {
    label: "Imposto didático sobre rendimento positivo (%)",
    scale: 100,
    min: 0,
    max: 5000,
    step: 1,
  },
  downCents: { label: "Entrada no mês zero (R$)", scale: 100, min: 0, max: 100000000, step: 1 },
  installmentCents: {
    label: "Cada parcela mensal (R$)",
    scale: 100,
    min: 0,
    max: 100000000,
    step: 1,
  },
  portfolioA: { label: "Peso inicial do grupo A (%)", scale: 1, min: 0, max: 100, step: 1 },
  returnABps: {
    label: "Retorno/reajuste A no período (%)",
    scale: 100,
    min: -10000,
    max: 10000,
    step: 1,
  },
  returnBBps: {
    label: "Retorno/reajuste B no período (%)",
    scale: 100,
    min: -10000,
    max: 10000,
    step: 1,
  },
  priceCents: {
    label: "Preço de venda por unidade (R$)",
    scale: 100,
    min: 1,
    max: 1000000,
    step: 1,
  },
  variableCostCents: {
    label: "Custo variável por unidade (R$)",
    scale: 100,
    min: 0,
    max: 100000000,
    step: 1,
  },
  fixedCostCents: { label: "Custo fixo (R$)", scale: 100, min: 0, max: 100000000, step: 1 },
  liquidityMonths: { label: "Disponível no fim do mês", scale: 1, min: 0, max: 36, step: 1 },
  deadlineMonths: { label: "Necessário no fim do mês", scale: 1, min: 0, max: 36, step: 1 },
};
const assumptionOptions = [
  { key: "taxa", label: "A taxa futura foi confirmada ou apenas suposta?" },
  { key: "liquidez", label: "Quando o dinheiro estará realmente disponível?" },
  { key: "custos", label: "Quais impostos, tarifas e custos faltam?" },
  { key: "risco", label: "Quais perdas, emissores e condições de garantia faltam avaliar?" },
  { key: "inflacao", label: "Qual hipótese de inflação foi usada?" },
] satisfies { key: FinanceState["assumptions"][number]; label: string }[];

export function FinanceTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseFinance(launch, raw);
  const definition = financeDefinition(launch);
  const metrics = financialMetrics(state);
  const timeline = financeTimeline(
    definition.metric === "present" ? { ...state, principalCents: metrics.present } : state,
  );
  const paymentMonths = Array.from({ length: state.periods }, (_, index) => index + 1);
  const nextFlowId = Array.from({ length: 13 }, (_, index) => index + 1).find(
    (id) => !state.flows.some((flow) => flow.id === id),
  );
  if (nextFlowId === undefined) throw new Error("Não há identidade disponível para outro fluxo.");
  const showInflation = definition.fields.includes("inflationBps");
  const showContribution = definition.metric === "contributions";
  const showScenarios = ["sensibilidade", "tres-cenarios", "conclusao-condicional"].includes(
    launch.mode,
  );
  const showIndexed = launch.mode === "prefixado-posfixado-inflacao";
  const showCredit =
    ["credit", "installments"].includes(definition.metric) ||
    launch.mode === "divida-versus-poupar";
  const lines = [
    {
      key: "compound",
      label: "Composto",
      color: "#166534",
      values: timeline.map((point) => point.compound),
    },
    ...(showContribution
      ? [
          {
            key: "contributions",
            label: "Com aportes",
            color: "#9a3412",
            values: timeline.map((point) => point.contributions),
          },
        ]
      : []),
    ...(showInflation
      ? [
          {
            key: "real",
            label: "Poder de compra em reais de hoje",
            color: "#1e40af",
            values: timeline.map((point) => point.real),
          },
        ]
      : []),
    ...(showScenarios
      ? [
          {
            key: "lower",
            label: "Taxa mensal 1 ponto abaixo",
            color: "#991b1b",
            values: timeline.map((point) => point.lower),
          },
          {
            key: "higher",
            label: "Taxa mensal 1 ponto acima",
            color: "#6b21a8",
            values: timeline.map((point) => point.higher),
          },
        ]
      : []),
    ...(showIndexed
      ? [
          {
            key: "indexed",
            label: "Inflação × fator de 0,5% mensal",
            color: "#9a3412",
            values: timeline.map((point) => point.indexed),
          },
        ]
      : []),
    ...(["juros-simples", "linear-exponencial", "modelar-premissas"].includes(launch.mode)
      ? [
          {
            key: "simple",
            label: "Simples",
            color: "#1e40af",
            values: timeline.map((point) => point.simple),
          },
        ]
      : []),
  ];
  const minValue = Math.min(0, ...lines.flatMap((line) => line.values));
  const maxValue = Math.max(100, ...lines.flatMap((line) => line.values));
  const y = (value: number) => 220 - ((value - minValue) / (maxValue - minValue)) * 185;
  const showGrowth =
    growthInputsAvailable(definition.fields) &&
    !["portfolio", "basket", "timeline", "business"].includes(definition.display ?? "") &&
    !showCredit &&
    definition.metric !== "liquidity" &&
    definition.metric !== "annual-rate";
  return (
    <div className="grid gap-4">
      <Controls>
        {definition.fields.map((field) => {
          const config = fieldLabels[field];
          const needsPositiveBase =
            field === "principalCents" &&
            ["real", "return", "portfolio", "average", "basket"].includes(definition.metric);
          return (
            <NumberField
              key={field}
              label={
                field === "priceCents" && definition.metric === "return"
                  ? "Preço final (R$)"
                  : field === "principalCents" && definition.metric === "return"
                    ? "Preço inicial (R$)"
                    : field === "principalCents" && definition.metric === "present"
                      ? "Valor a receber na data futura (R$)"
                      : config.label
              }
              value={state[field] / config.scale}
              min={(needsPositiveBase ? 1 : config.min) / config.scale}
              max={config.max / config.scale}
              step={config.step / config.scale}
              onChange={(value) =>
                onChange({ ...state, [field]: Math.round(value * config.scale) })
              }
            />
          );
        })}
      </Controls>
      {showContribution && (
        <Toggle
          label="Aportar no início de cada mês (desmarcado: fim do mês)"
          checked={state.timing === "beginning"}
          onChange={(beginning) => onChange({ ...state, timing: beginning ? "beginning" : "end" })}
        />
      )}
      <p className="text-xs">
        Valores didáticos. Períodos de juros e inflação são mensais. Cálculos sem arredondamento
        intermediário; exibição e resposta monetária final em centavos.{" "}
        {showContribution
          ? `O aporte entra no ${state.timing === "beginning" ? "início" : "fim"} de cada mês.`
          : "Modos sem aportes mantêm o capital inicial sem entradas adicionais."}{" "}
        {definition.fields.includes("taxBps")
          ? "Imposto é uma hipótese do cenário, não uma alíquota legal atual."
          : "Não há impostos ou tarifas no cálculo, salvo quando mostrados como parâmetros deste modo."}
      </p>
      {!hideResults && definition.metric === "annual-rate" && (
        <div className={panelClass}>
          <p className="font-bold">12 fatores mensais</p>
          <p className="mt-2">
            (1 + {decimal(state.rateBps / 100)}%)¹² ={" "}
            {decimal((1 + state.rateBps / 10000) ** 12, 6)}
          </p>
          <p className="mt-2 text-sm">
            Multiplicação simples por 12: {decimal((state.rateBps / 100) * 12)}%. Equivalência
            composta: {decimal(metrics.annualPercent)}%. As duas contas modelam regimes diferentes.
          </p>
        </div>
      )}
      {!hideResults && showGrowth && (
        <div className={panelClass}>
          <svg
            viewBox="0 0 500 260"
            className="w-full"
            role="img"
            aria-label={`Curvas financeiras de zero a ${state.periods} meses. ${lines.map((line) => line.label).join(", ")}. Valores exatos na tabela abaixo.`}
          >
            <line x1="65" y1="35" x2="65" y2="220" stroke="currentColor" />
            <line x1="65" y1={y(0)} x2="475" y2={y(0)} stroke="currentColor" />
            <text x="5" y="23" fontSize="11">
              {money(maxValue)}
            </text>
            <text x="5" y="237" fontSize="11">
              {money(minValue)}
            </text>
            <text x="65" y="253" textAnchor="middle" fontSize="12">
              mês 0
            </text>
            <text x="460" y="253" textAnchor="middle" fontSize="12">
              mês {state.periods}
            </text>
            {lines.map((line, index) => (
              <polyline
                key={line.key}
                points={line.values
                  .map((value, month) => `${65 + (month / state.periods) * 410},${y(value)}`)
                  .join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth="3"
                strokeDasharray={index === 0 ? undefined : `${index * 3 + 2} ${index + 2}`}
              />
            ))}
          </svg>
          <ul className="flex flex-wrap gap-3 text-xs">
            {lines.map((line, index) => (
              <li key={line.key}>
                {index + 1}. {line.label} ({index === 0 ? "linha contínua" : `tracejado ${index}`})
              </li>
            ))}
          </ul>
          {minValue < 0 && (
            <p className="mt-2 text-xs">
              O prolongamento linear ficou negativo. Como modelo de saldo de uma aplicação sem
              dívida, ele deixa de ter interpretação a partir de zero; reveja o domínio e as
              hipóteses.
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold underline">
              Tabela dos valores e dos meses
            </summary>
            <div className="mt-2 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Mês</th>
                    {lines.map((line) => (
                      <th className="p-2" key={line.key}>
                        {line.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((point) => (
                    <tr key={point.month} className="border-t border-sombra">
                      <th className="p-2">{point.month}</th>
                      {lines.map((line) => (
                        <td className="p-2" key={line.key}>
                          {money(line.values[point.month] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
      {showCredit && (
        <div className={panelClass}>
          <h4 className="font-bold">Datas dos pagamentos</h4>
          <div className="mt-3 flex gap-2 overflow-auto pb-2">
            <div className="min-w-28 rounded border border-sombra p-2 text-sm">
              <strong>Mês 0</strong>
              <p>Entrada {money(state.downCents)}</p>
            </div>
            {paymentMonths.map((month) => (
              <div key={month} className="min-w-28 rounded border border-sombra p-2 text-sm">
                <strong>Mês {month}</strong>
                <p>{money(state.installmentCents)}</p>
                {!hideResults && definition.fields.includes("rateBps") && (
                  <p className="text-xs">
                    Hoje: {money(state.installmentCents / (1 + state.rateBps / 10000) ** month)}
                  </p>
                )}
              </div>
            ))}
          </div>
          {!hideResults && (
            <p className="mt-3 text-sm">
              Total nominal: {money(metrics.creditTotal)}.
              {definition.fields.includes("rateBps") && (
                <> Valor presente: {money(metrics.installmentsPresent)}.</>
              )}
            </p>
          )}
          {definition.fields.includes("principalCents") && (
            <p className="mt-2 text-sm">Preço à vista: {money(state.principalCents)}.</p>
          )}
          {!hideResults && launch.mode === "divida-versus-poupar" && (
            <p className="mt-2 text-sm">
              Se guardar a entrada no mês 0 e o valor de cada parcela no fim dos meses, terá{" "}
              {money(
                contributionBalance(
                  {
                    principalCents: state.downCents,
                    rateBps: state.rateBps,
                    contributionCents: state.installmentCents,
                    timing: "end",
                  },
                  state.periods,
                ),
              )}{" "}
              no fim do prazo. O bem só seria comprado depois; o preço futuro também é uma hipótese.
            </p>
          )}
        </div>
      )}
      {!hideResults && definition.metric === "present" && (
        <Stat>
          Hoje: {money(metrics.present)}. Capitalizado por {state.periods} meses à taxa indicada,
          esse valor retorna a {money(compoundCents(metrics.present, state.rateBps, state.periods))}
          , o pagamento futuro informado.
        </Stat>
      )}
      {!hideResults && definition.fields.includes("taxBps") && (
        <Stat>
          Bruto: {money(metrics.future)}. Rendimento positivo tributável:{" "}
          {money(Math.max(0, metrics.future - state.principalCents))}. Imposto didático:{" "}
          {money(metrics.tax)}. Tarifa: {money(state.feeCents)}. Líquido: {money(metrics.net)}.
        </Stat>
      )}
      {definition.display === "portfolio" || definition.display === "basket" ? (
        <div className={panelClass}>
          <h4 className="font-bold">
            {definition.metric === "return"
              ? "Preço inicial e preço final"
              : definition.metric === "average"
                ? "Dois meses consecutivos"
                : definition.display === "basket"
                  ? "Pesos no custo inicial da cesta"
                  : "Pesos iniciais da carteira"}
          </h4>
          {definition.metric !== "return" && definition.metric !== "average" && (
            <>
              <div
                className="mt-3 flex h-10 overflow-hidden rounded border-2 border-sombra"
                role="img"
                aria-label={`A: ${state.portfolioA}%; B: ${100 - state.portfolioA}%`}
              >
                <div
                  className="flex items-center justify-center bg-green-800 text-white"
                  style={{ width: `${state.portfolioA}%` }}
                >
                  {state.portfolioA >= 15 ? `A ${state.portfolioA}%` : ""}
                </div>
                <div
                  className="flex items-center justify-center bg-blue-800 text-white"
                  style={{ width: `${100 - state.portfolioA}%` }}
                >
                  {state.portfolioA <= 85 ? `B ${100 - state.portfolioA}%` : ""}
                </div>
              </div>
              <p className="mt-2 text-sm">
                A: {state.portfolioA}% do total; variação {decimal(state.returnABps / 100)}%. B:{" "}
                {100 - state.portfolioA}%; variação {decimal(state.returnBBps / 100)}%.
              </p>
            </>
          )}
          {!hideResults &&
            (["average"].includes(definition.metric) ? (
              <>
                <p className="mt-3 text-sm">
                  Neste modo, A e B são meses consecutivos, sem divisão em ativos. Após o primeiro:{" "}
                  {money(state.principalCents * (1 + state.returnABps / 10000))}. Após o segundo:{" "}
                  {money(metrics.sequentialFuture)}.
                </p>
                <p className="mt-2 text-sm">
                  Média aritmética mensal: {decimal(metrics.arithmeticMeanPercent)}%; taxa mensal
                  constante equivalente: {decimal(metrics.geometricMeanPercent)}%; acumulado dos
                  dois meses: {decimal(metrics.sequentialPercent)}%.
                </p>
              </>
            ) : definition.metric === "return" ? (
              <p className="mt-3 text-sm">
                Preço inicial: {money(state.principalCents)}. Preço final: {money(state.priceCents)}
                . Diferença: {money(state.priceCents - state.principalCents)}. Retorno = diferença ÷
                preço inicial × 100.
              </p>
            ) : (
              <p className="mt-3 text-sm">
                Valor inicial: {money(state.principalCents)}. Valor após reajustes simultâneos:{" "}
                {money(metrics.weightedFuture)}. Variação ponderada:{" "}
                {decimal(metrics.weightedPercent)}%.
              </p>
            ))}
          {!hideResults && definition.metric === "open" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[-1000, 0, 1000].map((shift) => {
                const a = Math.max(-10000, state.returnABps + shift);
                const b = Math.max(-10000, state.returnBBps + shift);
                const weighted = (state.portfolioA / 100) * a + (1 - state.portfolioA / 100) * b;
                return (
                  <div className="rounded border border-sombra p-2 text-sm" key={shift}>
                    <strong>{shift < 0 ? "Adverso" : shift === 0 ? "Central" : "Favorável"}</strong>
                    <p>
                      A: {decimal(a / 100)}%; B: {decimal(b / 100)}%
                    </p>
                    <p>Resultado: {money(state.principalCents * (1 + weighted / 10000))}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      {definition.display === "timeline" && (
        <div className={panelClass}>
          <h4 className="font-bold">Fluxos com sinais e datas</h4>
          <p className="mt-1 text-xs">
            Positivo: valor recebido. Negativo: valor pago. Fluxos no mesmo mês são somados; são
            eventos financeiros distintos.
          </p>
          <div className="mt-3 grid gap-3">
            {state.flows.map((flow, index) => (
              <div
                className="grid gap-2 rounded border border-sombra p-3 sm:grid-cols-3"
                key={flow.id}
              >
                <NumberField
                  label={`Mês do fluxo ${index + 1}`}
                  value={flow.month}
                  min={0}
                  max={36}
                  onChange={(month) =>
                    onChange({
                      ...state,
                      flows: state.flows.map((current, at) =>
                        at === index ? { ...current, month } : current,
                      ),
                    })
                  }
                />
                <NumberField
                  label={`Valor com sinal do fluxo ${index + 1} (R$)`}
                  value={flow.cents / 100}
                  min={-1000000}
                  max={1000000}
                  step={0.01}
                  onChange={(value) =>
                    onChange({
                      ...state,
                      flows: state.flows.map((current, at) =>
                        at === index ? { ...current, cents: Math.round(value * 100) } : current,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className={buttonClass}
                  disabled={state.flows.length === 1}
                  onClick={() =>
                    onChange({ ...state, flows: state.flows.filter((_, at) => at !== index) })
                  }
                >
                  Retirar fluxo {index + 1}
                </button>
                {!hideResults && (
                  <p className="text-xs sm:col-span-3">
                    Valor no mês 0: {money(flow.cents / (1 + state.rateBps / 10000) ** flow.month)}.
                  </p>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            disabled={state.flows.length >= 12}
            onClick={() =>
              onChange({
                ...state,
                flows: [
                  ...state.flows,
                  {
                    id: nextFlowId,
                    month: Math.min(36, (state.flows.at(-1)?.month ?? 0) + 1),
                    cents: 0,
                  },
                ],
              })
            }
          >
            Acrescentar fluxo
          </button>
          {!hideResults && (
            <p className="mt-3 font-semibold">
              Valor presente líquido: {money(metrics.flowsPresent)}.
            </p>
          )}
        </div>
      )}
      {!hideResults && definition.display === "business" && (
        <div className={panelClass}>
          <p className="font-bold">
            Margem por unidade: {money(state.priceCents - state.variableCostCents)}
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <caption className="mb-2 text-left">Comparação de receita e custo</caption>
            <thead>
              <tr>
                <th className="p-2">Unidades</th>
                <th className="p-2">Receita</th>
                <th className="p-2">Custo total</th>
                <th className="p-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                new Set(
                  metrics.breakEven === null
                    ? [0, 10, 20, 30]
                    : [
                        0,
                        Math.max(0, metrics.breakEven - 1),
                        metrics.breakEven,
                        metrics.breakEven + 1,
                      ],
                ),
              ).map((units) => (
                <tr className="border-t border-sombra" key={units}>
                  <th className="p-2">{units}</th>
                  <td className="p-2">{money(units * state.priceCents)}</td>
                  <td className="p-2">
                    {money(state.fixedCostCents + units * state.variableCostCents)}
                  </td>
                  <td className="p-2">
                    {money(
                      units * (state.priceCents - state.variableCostCents) - state.fixedCostCents,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!hideResults && definition.display === "risk" && (
        <Stat>
          Disponibilidade: fim do mês {state.liquidityMonths}. Necessidade: fim do mês{" "}
          {state.deadlineMonths}.{" "}
          {metrics.liquidInTime
            ? "O prazo informado atende à data."
            : "O prazo informado não atende à data."}{" "}
          A verificação do prazo não comprova segurança, garantia de crédito ou retorno futuro.
        </Stat>
      )}
      {definition.metric === "open" && (
        <div className={panelClass}>
          <h4 className="font-bold">Informações a confirmar para sustentar sua conclusão</h4>
          {assumptionOptions.map((option) => (
            <Toggle
              key={option.key}
              label={option.label}
              checked={state.assumptions.includes(option.key)}
              onChange={(checked) =>
                onChange({
                  ...state,
                  assumptions: checked
                    ? [...state.assumptions, option.key]
                    : state.assumptions.filter((key) => key !== option.key),
                })
              }
            />
          ))}
          <p className="mt-2 text-xs">
            Marcar uma informação identifica uma pergunta de investigação; não confirma que a
            hipótese é verdadeira.
          </p>
        </div>
      )}
    </div>
  );
}

function growthInputsAvailable(fields: FinanceField[]) {
  return (
    fields.includes("principalCents") && fields.includes("rateBps") && fields.includes("periods")
  );
}

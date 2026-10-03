"use client";
import type { LabToolProps } from "../types";
import {
  noteValues,
  parseTwoQuantities,
  type TwoQuantitiesState,
  twoQuantitiesChecks,
  twoQuantitiesSolutions,
  twoQuantitiesSummary,
  usesMoney,
} from "./two-quantities";
import { buttonClass, NumberControl, Options, Output, panelClass, positions } from "./ui";

function DrawnObjects({ state, group }: { state: TwoQuantitiesState; group: "first" | "second" }) {
  const isFirst = group === "first";
  const count = state[group];
  const value = isFirst ? state.firstValue : state.secondValue;
  const label =
    state.kind === "animais"
      ? isFirst
        ? "galinhas de duas patas"
        : "cachorros de quatro patas"
      : state.kind === "notas"
        ? `notas de ${value} reais`
        : state.kind === "precos"
          ? `objetos de ${value} reais`
          : "objetos";
  return (
    <div role="img" aria-label={`${count} ${label}`} className="flex flex-wrap gap-2">
      {count === 0 && <p>Nenhum por enquanto.</p>}
      {positions(count).map((position) =>
        usesMoney(state) ? (
          <span
            key={position}
            aria-hidden="true"
            className="rounded border-2 border-verde-fundo bg-verde-claro px-3 py-2 font-bold"
          >
            {state.kind === "precos" ? "● " : ""}R$ {value}
          </span>
        ) : state.kind === "animais" ? (
          <svg key={position} aria-hidden="true" viewBox="0 0 60 60" className="size-14 shrink-0">
            <ellipse
              cx="25"
              cy="25"
              rx={isFirst ? 14 : 20}
              ry="12"
              fill={isFirst ? "#fff4cc" : "#d0e8ff"}
              stroke="#172e2a"
              strokeWidth="2"
            />
            <circle
              cx="45"
              cy="17"
              r="8"
              fill={isFirst ? "#fff4cc" : "#d0e8ff"}
              stroke="#172e2a"
              strokeWidth="2"
            />
            <circle cx="47" cy="15" r="2" fill="#172e2a" />
            {isFirst && <path d="M52 17 L58 20 L52 23" fill="#b34f20" />}
            {positions(isFirst ? 2 : 4).map((leg) => (
              <path
                key={leg}
                d={`M${12 + leg * 8} 35 v15 h5`}
                fill="none"
                stroke="#172e2a"
                strokeWidth="3"
              />
            ))}
            <text x="30" y="59" fontSize="9" textAnchor="middle">
              {isFirst ? "2 patas" : "4 patas"}
            </text>
          </svg>
        ) : (
          <span
            key={position}
            aria-hidden="true"
            className={`inline-flex size-9 items-center justify-center rounded-full border-2 border-tinta ${isFirst ? "bg-sol-claro" : "bg-ceu-claro"}`}
          >
            ●
          </span>
        ),
      )}
    </div>
  );
}

export function TwoQuantitiesTool({ state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseTwoQuantities(raw);
  const checks = twoQuantitiesChecks(state);
  const solutions = state.enumerated ? twoQuantitiesSolutions(state) : [];
  const update = (changes: Partial<TwoQuantitiesState>, configuration = false) =>
    onChange(
      parseTwoQuantities({
        ...state,
        ...changes,
        ...(configuration ? { trials: [], enumerated: false } : {}),
      }),
    );
  const firstLabel =
    state.kind === "animais"
      ? "Galinhas (grupo A)"
      : state.kind === "notas"
        ? `Notas de ${state.firstValue} reais (grupo A)`
        : state.kind === "precos"
          ? `Objetos de ${state.firstValue} reais (grupo A)`
          : "Objetos no grupo A";
  const secondLabel =
    state.kind === "animais"
      ? "Cachorros (grupo B)"
      : state.kind === "notas"
        ? `Notas de ${state.secondValue} reais (grupo B)`
        : state.kind === "precos"
          ? `Objetos de ${state.secondValue} reais (grupo B)`
          : "Objetos no grupo B";
  const recorded = state.trials.some(
    (trial) => trial.first === state.first && trial.second === state.second,
  );
  return (
    <div className="space-y-4">
      <Options
        label="O que vamos investigar?"
        value={state.kind}
        options={[
          { value: "animais", label: "Galinhas, cachorros e patas" },
          { value: "notas", label: "Notas de dois valores" },
          { value: "precos", label: "Compras com dois preços" },
          { value: "diferenca", label: "Juntos e quantos a mais" },
          { value: "dobro", label: "Juntos e o dobro" },
        ]}
        onChange={(kind) =>
          update(
            parseTwoQuantities({
              ...state,
              kind,
              firstValue: 2,
              secondValue: kind === "precos" ? 3 : 5,
            }),
            true,
          )
        }
      />
      <div className={panelClass}>
        <h3 className="mb-3 font-semibold">Dados do problema</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {!usesMoney(state) && (
            <NumberControl
              label="Quantidade que procuramos ao todo"
              value={state.targetTotal}
              min={0}
              max={60}
              onChange={(targetTotal) => update({ targetTotal }, true)}
            />
          )}
          {(state.kind === "animais" || usesMoney(state)) && (
            <NumberControl
              label={
                state.kind === "animais"
                  ? "Patas que procuramos ao todo"
                  : "Valor que queremos pagar em reais"
              }
              value={state.targetValue}
              min={0}
              max={60}
              onChange={(targetValue) => update({ targetValue }, true)}
            />
          )}
          {state.kind === "notas" && (
            <>
              <Options
                label="Valor de cada nota A"
                value={String(state.firstValue)}
                options={noteValues.map((value) => ({
                  value: String(value),
                  label: `${value} reais`,
                }))}
                onChange={(firstValue) => update({ firstValue: Number(firstValue) }, true)}
              />
              <Options
                label="Valor de cada nota B"
                value={String(state.secondValue)}
                options={noteValues.map((value) => ({
                  value: String(value),
                  label: `${value} reais`,
                }))}
                onChange={(secondValue) => update({ secondValue: Number(secondValue) }, true)}
              />
            </>
          )}
          {state.kind === "precos" && (
            <>
              <NumberControl
                label="Preço de cada objeto A em reais"
                value={state.firstValue}
                min={1}
                max={10}
                onChange={(firstValue) => update({ firstValue }, true)}
              />
              <NumberControl
                label="Preço de cada objeto B em reais"
                value={state.secondValue}
                min={1}
                max={10}
                onChange={(secondValue) => update({ secondValue }, true)}
              />
            </>
          )}
          {state.kind === "diferenca" && (
            <NumberControl
              label="Quantos A deve ter a mais que B"
              value={state.difference}
              min={0}
              max={60}
              onChange={(difference) => update({ difference }, true)}
            />
          )}
        </div>
        {state.kind === "animais" && (
          <p className="mt-3 text-sm">
            Cada galinha tem 2 patas. Cada cachorro tem 4. Trocar um animal por outro mantém a
            quantidade de animais, mas muda as patas.
          </p>
        )}
        {state.kind === "dobro" && (
          <p className="mt-3 text-sm">
            Para cada objeto em B, precisamos de dois em A. O total dos dois grupos também precisa
            conferir.
          </p>
        )}
        {state.kind === "notas" && (
          <p className="mt-3 text-sm">
            Use quantas notas precisar, sem troco. Pode haver mais de uma maneira de pagar o mesmo
            valor.
          </p>
        )}
        {state.kind === "precos" && (
          <p className="mt-3 text-sm">
            Cada desenho representa um objeto com o preço indicado. Para comprar só do tipo B, deixe
            A em zero. Queremos gastar o valor exato, sem troco.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className={panelClass}>
          <NumberControl
            label={firstLabel}
            value={state.first}
            min={0}
            max={60}
            onChange={(first) => update({ first })}
          />
          <div className="mt-3">
            <DrawnObjects state={state} group="first" />
          </div>
        </section>
        <section className={panelClass}>
          <NumberControl
            label={secondLabel}
            value={state.second}
            min={0}
            max={60}
            onChange={(second) => update({ second })}
          />
          <div className="mt-3">
            <DrawnObjects state={state} group="second" />
          </div>
        </section>
      </div>
      {!hideResults && (
        <ul className="space-y-2" aria-label="Conferência das condições">
          {checks.map((check) => (
            <li key={check.label} className="rounded-controle border-2 border-sombra p-3">
              <strong>{check.met ? "Confere" : "Ainda não confere"}:</strong> {check.label}: fizemos{" "}
              {check.actual}, procuramos {check.expected}.
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={buttonClass}
        disabled={recorded}
        onClick={() =>
          update({
            trials: [...state.trials.slice(-11), { first: state.first, second: state.second }],
          })
        }
      >
        {recorded ? "Tentativa já anotada" : "Anotar esta tentativa"}
      </button>
      {state.trials.length > 0 && (
        <div className={panelClass}>
          <h3 className="font-semibold">Minhas últimas 12 tentativas</h3>
          <p className="my-2 text-sm">
            Toque em uma tentativa para montar de novo. Se mudar os dados do problema, começaremos
            outra lista.
          </p>
          <ol className="space-y-2">
            {state.trials.map((trial) => {
              const trialChecks = twoQuantitiesChecks({ ...state, ...trial });
              return (
                <li key={`${trial.first}-${trial.second}`}>
                  <button
                    type="button"
                    className={`${buttonClass} w-full text-left`}
                    onClick={() => update(trial)}
                  >
                    A: {trial.first}; B: {trial.second}.{" "}
                    {!hideResults &&
                      (trialChecks.every((check) => check.met)
                        ? "Tudo confere."
                        : trialChecks
                            .filter((check) => !check.met)
                            .map(
                              (check) =>
                                `${check.label}: ${check.actual}, precisava ${check.expected}.`,
                            )
                            .join(" "))}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {!hideResults && (
        <div className={panelClass}>
          <p className="mb-3 text-sm">
            Não encontrar de primeira não significa impossível. Depois de tentar, podemos conferir
            todas as quantidades que cabem nos dados do problema.
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => update({ enumerated: !state.enumerated })}
          >
            {state.enumerated
              ? "Fechar a conferência completa"
              : "Conferir todas as possibilidades"}
          </button>
          {state.enumerated && (
            <div className="mt-3">
              <p className="mb-3">
                {usesMoney(state)
                  ? `Cada grupo pode ir de zero até a quantidade que cabe em ${state.targetValue} reais; uma quantidade maior ultrapassaria esse valor.`
                  : `Cada grupo pode ir de zero até ${state.targetTotal}; um grupo maior já ultrapassaria o total.`}{" "}
                Conferimos cada combinação desses tamanhos.
              </p>
              <p className="font-semibold">
                {solutions.length
                  ? `${solutions.length} montagem(ns) atendem a todas as condições:`
                  : "Nenhuma montagem atende a todas as condições. Com esses dados, é impossível."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {solutions.map((solution) => (
                  <button
                    key={`${solution.first}-${solution.second}`}
                    type="button"
                    className={buttonClass}
                    onClick={() => update(solution)}
                  >
                    Montar A: {solution.first}, B: {solution.second}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!hideResults && <Output>{twoQuantitiesSummary(state)}</Output>}
    </div>
  );
}

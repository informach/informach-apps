"use client";

import type { LabToolProps } from "../types";
import { buttonClass, NumberField, panelClass, Stat, Toggle } from "./controls";
import {
  allOrders,
  counterexample,
  orderClues,
  orderValid,
  parseLogic,
  proofScene,
  quantifierChoices,
  truthValue,
} from "./logic";
import { matchingTool } from "./matching";
import { MatchingTool } from "./matching-component";
import { ProcessTool } from "./process-component";
import { processTool } from "./processes";

export function LogicTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  if (matchingTool.modes.includes(launch.mode))
    return (
      <MatchingTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />
    );
  if (processTool.modes.includes(launch.mode))
    return (
      <ProcessTool launch={launch} state={raw} onChange={onChange} hideResults={hideResults} />
    );
  const state = parseLogic(launch, raw);
  if (state.kind === "order")
    return (
      <div className="grid gap-4">
        <ul className="list-disc space-y-2 pl-5">
          {orderClues(launch).map((clue) => (
            <li key={clue}>{clue}</li>
          ))}
        </ul>
        <div className="grid grid-cols-3 gap-2">
          {state.order.map((animal, index) => (
            <div className={panelClass} key={animal}>
              <p className="text-center text-3xl" aria-hidden="true">
                {animal === "Gato" ? "🐱" : animal === "Panda" ? "🐼" : "🦊"}
              </p>
              <p className="text-center font-bold">
                {index + 1}. {animal}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                <button
                  className={buttonClass}
                  type="button"
                  disabled={index === 0}
                  aria-label={`Mover ${animal} para a esquerda`}
                  onClick={() =>
                    onChange({
                      ...state,
                      order: state.order.map((current, at) =>
                        at === index - 1 ? animal : at === index ? state.order[index - 1] : current,
                      ),
                    })
                  }
                >
                  ←
                </button>
                <button
                  className={buttonClass}
                  type="button"
                  disabled={index === 2}
                  aria-label={`Mover ${animal} para a direita`}
                  onClick={() =>
                    onChange({
                      ...state,
                      order: state.order.map((current, at) =>
                        at === index + 1 ? animal : at === index ? state.order[index + 1] : current,
                      ),
                    })
                  }
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
        {!hideResults && (
          <Stat>
            {orderValid(launch, state.order)
              ? "Esta fila respeita todas as pistas."
              : "Uma ou mais pistas ainda não são respeitadas."}{" "}
            Uma fila válida pode ser só uma entre várias.
          </Stat>
        )}
        <details open={launch.mode === "testar-casos-visuais" || launch.mode === "tabela-deducao"}>
          <summary className="cursor-pointer font-semibold underline">
            Examinar todas as seis filas
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {allOrders.map((order, index) => (
              <div key={order.join("-")} className={panelClass}>
                <p className={state.eliminated.includes(index) ? "line-through" : ""}>
                  {order.join(" → ")}
                </p>
                <button
                  type="button"
                  className={`${buttonClass} mt-2`}
                  aria-pressed={state.eliminated.includes(index)}
                  onClick={() =>
                    onChange({
                      ...state,
                      eliminated: state.eliminated.includes(index)
                        ? state.eliminated.filter((at) => at !== index)
                        : [...state.eliminated, index],
                    })
                  }
                >
                  {state.eliminated.includes(index)
                    ? "Recuperar esta fila"
                    : "Riscar: viola uma pista"}
                </button>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  if (state.kind === "truth") {
    const useR = launch.mode === "encadear-implicacoes";
    const rows = Array.from({ length: useR ? 8 : 4 }, (_, index) => ({
      p: (index & (useR ? 4 : 2)) !== 0,
      q: (index & (useR ? 2 : 1)) !== 0,
      r: useR && (index & 1) !== 0,
    }));
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-4">
          <Toggle
            label="P é verdadeiro"
            checked={state.p}
            onChange={(p) => onChange({ ...state, p })}
          />
          <Toggle
            label="Q é verdadeiro"
            checked={state.q}
            onChange={(q) => onChange({ ...state, q })}
          />
          {useR && (
            <Toggle
              label="R é verdadeiro"
              checked={state.r}
              onChange={(r) => onChange({ ...state, r })}
            />
          )}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">
              Tabela completa da expressão; toque para selecionar uma linha
            </caption>
            <thead>
              <tr>
                <th className="p-2">Linha</th>
                <th className="p-2">P</th>
                <th className="p-2">Q</th>
                {useR && <th className="p-2">R</th>}
                {!hideResults && (
                  <th className="p-2">
                    {launch.mode === "verdade-mentira" ? "Atribuição coerente" : "Resultado"}
                  </th>
                )}
                {!hideResults && launch.mode === "implicacao-reciproca-contrapositiva" && (
                  <>
                    <th className="p-2">P → Q</th>
                    <th className="p-2">Q → P</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.p}-${row.q}-${row.r}`}
                  className={`border-t border-sombra ${row.p === state.p && row.q === state.q && (!useR || row.r === state.r) ? "bg-creme" : ""}`}
                >
                  <td className="p-2">
                    <button
                      className={buttonClass}
                      type="button"
                      aria-label={`Selecionar linha ${index + 1}`}
                      onClick={() => onChange({ ...state, ...row })}
                    >
                      {index + 1}
                    </button>
                  </td>
                  <td className="p-2">{row.p ? "V" : "F"}</td>
                  <td className="p-2">{row.q ? "V" : "F"}</td>
                  {useR && <td className="p-2">{row.r ? "V" : "F"}</td>}
                  {!hideResults && (
                    <td className="p-2">{truthValue(launch, row.p, row.q, row.r) ? "V" : "F"}</td>
                  )}
                  {!hideResults && launch.mode === "implicacao-reciproca-contrapositiva" && (
                    <>
                      <td className="p-2">{!row.p || row.q ? "V" : "F"}</td>
                      <td className="p-2">{!row.q || row.p ? "V" : "F"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Stat>
          V significa verdadeiro; F significa falso. Para provar que uma forma lógica é válida,
          confira todas as linhas possíveis. Isso é diferente de testar poucos números de um domínio
          infinito.
        </Stat>
      </div>
    );
  }
  if (state.kind === "counterexample")
    return (
      <div className="grid gap-4">
        <NumberField
          label="Inteiro n para testar"
          value={state.value}
          min={0}
          max={50}
          onChange={(value) => onChange({ ...state, value })}
        />
        {!hideResults && (
          <div className={panelClass}>
            <p className="text-lg font-bold">{counterexample(launch, state.value).expression}</p>
            <p className="mt-2 text-sm">
              {counterexample(launch, state.value).valid
                ? "Esse caso contradiz a afirmação universal."
                : "Esse caso satisfaz a afirmação; ainda não é um contraexemplo."}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 6, 40, 41].map((value) => (
            <button
              className={buttonClass}
              type="button"
              key={value}
              aria-pressed={state.value === value}
              onClick={() => onChange({ ...state, value })}
            >
              Testar {value}
            </button>
          ))}
        </div>
        <p className="text-sm">
          Um caso contrário derruba “para todo”. Uma sequência de casos favoráveis, sozinha, não
          prova a afirmação.
        </p>
      </div>
    );
  if (state.kind === "quantifier")
    return (
      <div className="grid gap-3">
        <p className="text-sm">
          Escolha uma negação e confira quem precisa ser a testemunha. “Não todos” não significa
          “nenhum”.
        </p>
        {quantifierChoices(launch).map((choice, selected) => (
          <button
            className={`${buttonClass} text-left ${state.selected === selected ? "bg-creme ring-2 ring-verde" : ""}`}
            type="button"
            key={choice}
            aria-pressed={state.selected === selected}
            onClick={() => onChange({ ...state, selected })}
          >
            {choice}
          </button>
        ))}
        <Stat>
          Seleção de trabalho: {quantifierChoices(launch)[state.selected]}. Registre sua conclusão
          no campo de resposta.
        </Stat>
      </div>
    );
  const scene = proofScene(launch);
  return (
    <div className="grid gap-4">
      <p className={`${panelClass} font-semibold`}>{scene.claim}</p>
      {scene.givenSteps && (
        <ol className="grid list-decimal gap-2 pl-6 text-sm" aria-label="Suposta prova a revisar">
          {scene.givenSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {!hideResults && (
        <>
          <div className="grid gap-2">
            <h4 className="font-bold">Peças do argumento</h4>
            {scene.cards.map((card, index) => (
              <button
                type="button"
                className={`${buttonClass} text-left`}
                key={card}
                disabled={state.steps.includes(index)}
                onClick={() => onChange({ ...state, steps: [...state.steps, index] })}
              >
                Acrescentar: {card}
              </button>
            ))}
          </div>
          <ol className="grid gap-3" aria-label="Seu argumento ordenado">
            {state.steps.map((step, index) => (
              <li key={step} className={panelClass}>
                <p>
                  {index + 1}. {scene.cards[step]}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    type="button"
                    disabled={index === 0}
                    aria-label={`Mover etapa ${index + 1} para cima`}
                    onClick={() =>
                      onChange({
                        ...state,
                        steps: state.steps.map((current, at) =>
                          at === index - 1 ? step : at === index ? state.steps[index - 1] : current,
                        ),
                      })
                    }
                  >
                    Subir
                  </button>
                  <button
                    className={buttonClass}
                    type="button"
                    disabled={index === state.steps.length - 1}
                    aria-label={`Mover etapa ${index + 1} para baixo`}
                    onClick={() =>
                      onChange({
                        ...state,
                        steps: state.steps.map((current, at) =>
                          at === index + 1 ? step : at === index ? state.steps[index + 1] : current,
                        ),
                      })
                    }
                  >
                    Descer
                  </button>
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...state,
                        steps: state.steps.filter((current) => current !== step),
                      })
                    }
                  >
                    Retirar etapa {index + 1}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <NumberField
            label="Exemplo ilustrativo — não substitui a prova"
            value={state.example}
            min={1}
            max={12}
            onChange={(example) => onChange({ ...state, example })}
          />
          <Stat>{scene.example(state.example)}</Stat>
        </>
      )}
      <div className={panelClass}>
        <h4 className="font-bold">Revise seu argumento</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {scene.rubric.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          A organização das peças oferece apoio. A justificativa escrita é avaliada por rubrica;
          este recurso não declara automaticamente que uma prova livre está correta.
        </p>
      </div>
    </div>
  );
}

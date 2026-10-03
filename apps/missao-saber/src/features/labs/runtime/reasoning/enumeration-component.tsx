"use client";
import type { LabToolProps } from "../types";
import { buttonClass, Controls, NumberField, panelClass, Stat, Toggle } from "./controls";
import { enumeratedCases, parseEnumeration } from "./enumeration";
export function EnumerationTool({
  launch,
  state: raw,
  onChange,
  hideResults = false,
}: LabToolProps) {
  const state = parseEnumeration(launch, raw);
  if (state.kind === "quota") {
    const boxes = Array.from({ length: state.boxes }, (_, index) => ({
      id: `caixa-${index + 1}`,
      number: index + 1,
      tokens: state.quota - 1 + (state.extra && index === 0 ? 1 : 0),
    }));
    return (
      <div className="grid gap-4">
        <Controls>
          <NumberField
            label="Caixas ou categorias"
            value={state.boxes}
            min={2}
            max={12}
            onChange={(boxes) => onChange({ ...state, boxes })}
          />
          <NumberField
            label="Cota a garantir em alguma caixa"
            value={state.quota}
            min={2}
            max={6}
            onChange={(quota) => onChange({ ...state, quota })}
          />
        </Controls>
        <div className="grid grid-cols-3 gap-2">
          {boxes.map((box) => (
            <div key={box.id} className={panelClass}>
              <p>Caixa {box.number}</p>
              <p className="text-xl font-bold">{box.tokens} fichas</p>
            </div>
          ))}
        </div>
        <button
          className={buttonClass}
          type="button"
          onClick={() => onChange({ ...state, extra: !state.extra })}
        >
          {state.extra ? "Retirar a ficha extra" : "Acrescentar uma ficha depois do pior caso"}
        </button>
        {!hideResults && (
          <Stat>
            Sem atingir a cota em nenhuma caixa: {state.boxes} × {state.quota - 1} ={" "}
            {state.boxes * (state.quota - 1)} fichas.{" "}
            {state.extra &&
              "Com mais uma, alguma caixa precisa atingir a cota. A caixa 1 é um exemplo; poderia ser qualquer uma."}
          </Stat>
        )}
      </div>
    );
  }
  if (state.kind === "relations") {
    const people = ["Ana", "Bia", "Caio"];
    const clubs = ["Arte", "Música", "Xadrez", "Ciência"];
    return (
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left font-semibold">Cada marca é uma participação</caption>
          <thead>
            <tr>
              <th className="p-2">Estudante</th>
              {clubs.map((club) => (
                <th key={club} className="p-2">
                  {club}
                </th>
              ))}
              {!hideResults && <th className="p-2">Total</th>}
            </tr>
          </thead>
          <tbody>
            {people.map((person, row) => (
              <tr key={person}>
                <th className="p-2">{person}</th>
                {clubs.map((club, column) => {
                  const index = row * 4 + column;
                  return (
                    <td className="p-2" key={club}>
                      <button
                        className={buttonClass}
                        type="button"
                        aria-label={`${person} participa de ${club}`}
                        aria-pressed={state.links[index]}
                        onClick={() =>
                          onChange({
                            ...state,
                            links: state.links.map((current, at) =>
                              at === index ? !current : current,
                            ),
                          })
                        }
                      >
                        {state.links[index] ? "Sim" : "Não"}
                      </button>
                    </td>
                  );
                })}
                {!hideResults && (
                  <td className="p-2">
                    {state.links.slice(row * 4, row * 4 + 4).filter(Boolean).length}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {!hideResults && (
            <tfoot>
              <tr>
                <th className="p-2">Total</th>
                {clubs.map((club, column) => (
                  <td key={club} className="p-2">
                    {state.links.filter((value, index) => index % 4 === column && value).length}
                  </td>
                ))}
                <td className="p-2 font-bold">{state.links.filter(Boolean).length}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }
  const cases = enumeratedCases(state, launch.mode);
  if (state.kind === "digits" || state.kind === "seating")
    return (
      <div className="grid gap-4">
        <Controls>
          <NumberField
            label={
              state.kind === "digits"
                ? "Algarismos disponíveis: 0 até quantidade − 1"
                : "Pessoas disponíveis: A, B, C…"
            }
            value={state.count}
            min={state.kind === "digits" ? 2 : 3}
            max={6}
            onChange={(count) => onChange({ ...state, count })}
          />
          {state.kind === "digits" && (
            <>
              <NumberField
                label="Quantidade de posições"
                value={state.width}
                min={1}
                max={4}
                onChange={(width) => onChange({ ...state, width })}
              />
              <Toggle
                label="Permitir repetir algarismos"
                checked={state.repeat}
                onChange={(repeat) => onChange({ ...state, repeat })}
              />
              <Toggle
                label="Primeiro algarismo ímpar"
                checked={state.firstOdd}
                onChange={(firstOdd) => onChange({ ...state, firstOdd })}
              />
              <Toggle
                label="Último algarismo par"
                checked={state.lastEven}
                onChange={(lastEven) => onChange({ ...state, lastEven })}
              />
              <NumberField
                label="Algarismo obrigatório (−1: sem essa condição)"
                value={state.required}
                min={-1}
                max={5}
                onChange={(required) => onChange({ ...state, required })}
              />
              <NumberField
                label="Soma dos algarismos (−1: sem essa condição)"
                value={state.sum}
                min={-1}
                max={20}
                onChange={(sum) => onChange({ ...state, sum })}
              />
            </>
          )}
        </Controls>
        {!hideResults && (
          <>
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-auto p-1 sm:grid-cols-5">
              {cases.map((item) => (
                <div key={item} className={`${panelClass} p-2 text-sm`}>
                  {item}
                </div>
              ))}
            </div>
            <Stat>
              {cases.length} resultados válidos.{" "}
              {launch.mode === "mesa-redonda"
                ? "A foi fixado como referência; rotações não são repetidas. O sentido inverso ainda conta como outra ordem."
                : launch.mode === "filas-com-bloco"
                  ? "Todos os casos listados mantêm A e B juntos, nas duas ordens possíveis do bloco."
                  : launch.mode === "algarismos-e-restricoes"
                    ? "Zero à esquerda não é permitido."
                    : launch.mode === "senhas-e-restricoes"
                      ? "Senhas admitem zero à esquerda."
                      : "Todos os objetos participam uma única vez; a ordem da fila distingue os casos."}
            </Stat>
          </>
        )}
      </div>
    );
  return (
    <div className="grid gap-4">
      {state.kind === "subsets" && (
        <NumberField
          label="Adesivos diferentes disponíveis"
          value={state.count}
          min={2}
          max={6}
          onChange={(count) => onChange({ ...state, count, selected: [] })}
        />
      )}
      {state.kind === "word" && (
        <label className="grid gap-2 font-semibold">
          Letras a reorganizar
          <select
            value={state.word}
            className={buttonClass}
            onChange={(event) =>
              onChange({ ...state, word: event.currentTarget.value, selected: [] })
            }
          >
            {["AAB", "ARARA", "BANANA", "CASA"].map((word) => (
              <option key={word}>{word}</option>
            ))}
          </select>
        </label>
      )}
      {state.kind === "triple" && (
        <Controls>
          <NumberField
            label="Pontes"
            value={state.first}
            min={2}
            max={4}
            onChange={(first) => onChange({ ...state, first })}
          />
          <NumberField
            label="Trilhas"
            value={state.second}
            min={2}
            max={4}
            onChange={(second) => onChange({ ...state, second })}
          />
          <NumberField
            label="Saídas"
            value={state.third}
            min={2}
            max={4}
            onChange={(third) => onChange({ ...state, third })}
          />
        </Controls>
      )}
      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto p-1 sm:grid-cols-4">
        {cases.map((item) =>
          "selected" in state ? (
            <button
              type="button"
              className={`${buttonClass} ${state.selected.includes(item) ? "bg-creme" : ""}`}
              aria-pressed={state.selected.includes(item)}
              key={item}
              onClick={() =>
                onChange({
                  ...state,
                  selected: state.selected.includes(item)
                    ? state.selected.filter((current) => current !== item)
                    : [...state.selected, item],
                })
              }
            >
              {item === "∅" ? "∅ — nenhum" : item}
            </button>
          ) : (
            <div key={item} className={`${panelClass} text-sm`}>
              {item}
            </div>
          ),
        )}
      </div>
      {!hideResults && (
        <Stat>
          {cases.length} resultados distintos.{" "}
          {state.kind === "word" && "Letras repetidas foram tratadas como indistinguíveis."}
          {state.kind === "subsets" &&
            "Cada elemento tem duas decisões: entrar ou ficar de fora. ∅ significa conjunto vazio."}
        </Stat>
      )}
    </div>
  );
}

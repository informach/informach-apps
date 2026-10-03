"use client";
import type { LabToolProps } from "../types";
import { buttonClass, Stat } from "./controls";
import {
  matchingAnimals,
  matchingClues,
  matchingPeople,
  parseMatching,
  validEliminations,
  validMatching,
} from "./matching";
export function MatchingTool({ launch, state: raw, onChange, hideResults = false }: LabToolProps) {
  const state = parseMatching(launch, raw);
  const animals = matchingAnimals;
  return (
    <div className="grid gap-4">
      <ul className="list-disc space-y-1 pl-5">
        {matchingClues(launch).map((clue) => (
          <li key={clue}>{clue}</li>
        ))}
      </ul>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left">
            Associe os animais; use “riscar” para eliminar uma associação pelas pistas
          </caption>
          <thead>
            <tr>
              <th className="p-2">Pessoa</th>
              {animals.map((animal) => (
                <th key={animal} className="p-2">
                  {animal}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matchingPeople(launch).map((person, row) => (
              <tr key={person}>
                <th className="p-2">{person}</th>
                {animals.map((animal, column) => (
                  <td key={animal} className="p-2">
                    <button
                      className={buttonClass}
                      type="button"
                      aria-label={`${person} tem ${animal}`}
                      aria-pressed={state.pets[row] === animal}
                      onClick={() => {
                        const previous = state.pets[row];
                        onChange({
                          ...state,
                          pets: state.pets.map((pet, index) =>
                            index === row ? animal : pet === animal ? previous : pet,
                          ),
                        });
                      }}
                    >
                      {state.pets[row] === animal ? "Tem ✓" : "Associar"}
                    </button>
                    <button
                      className={`${buttonClass} mt-1 text-xs`}
                      type="button"
                      aria-label={`${state.eliminated.includes(row * 3 + column) ? "Recuperar" : "Riscar"}: ${person} com ${animal}`}
                      aria-pressed={state.eliminated.includes(row * 3 + column)}
                      onClick={() => {
                        const cell = row * 3 + column;
                        onChange({
                          ...state,
                          eliminated: state.eliminated.includes(cell)
                            ? state.eliminated.filter((current) => current !== cell)
                            : [...state.eliminated, cell],
                        });
                      }}
                    >
                      {state.eliminated.includes(row * 3 + column) ? "Riscado ×" : "Riscar"}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hideResults && (
        <Stat>
          {validMatching(launch, state) && validEliminations(launch, state)
            ? "Todas as pistas são respeitadas."
            : "Confira a montagem: há uma pista que ainda não é respeitada."}
        </Stat>
      )}
    </div>
  );
}

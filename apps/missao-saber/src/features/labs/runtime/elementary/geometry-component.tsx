"use client";
import { useState } from "react";
import type { LabToolProps } from "../types";
import {
  cellMeasures,
  geometryDefinition,
  geometrySchema,
  geometrySummary,
  parseGeometry,
  tileDeficientBoard,
  triminoCells,
} from "./geometry";
import { buttonClass, NumberControl, Options, Output, Plane, panelClass, positions } from "./ui";

export function GeometryTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseGeometry(launch, raw);
  const kind = geometryDefinition(launch).kind;
  const boardSize = 2 ** state.tilingPower;
  const tiles =
    kind === "tiling"
      ? tileDeficientBoard(state.tilingPower, { x: state.missingColumn, y: state.missingRow })
      : [];
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const update = (changes: Partial<typeof state>) => {
    const result = geometrySchema.safeParse({ ...state, ...changes });
    if (!result.success) {
      setError(
        "Essa mudança alinharia os três vértices. Escolha uma posição que forme um triângulo.",
      );
      return;
    }
    setError("");
    onChange(result.data);
  };
  const sides = { triangulo: 3, quadrado: 4, pentagono: 5, hexagono: 6 }[state.shape];
  const description = hideResults
    ? kind === "polygon"
      ? `Triângulo com vértices ${state.points.map((point) => `(${point.x}, ${point.y})`).join(", ")}.`
      : kind === "tiling"
        ? `Tabuleiro ${boardSize} por ${boardSize}, casa removida na linha ${state.missingRow + 1}, coluna ${state.missingColumn + 1}. Peças com o mesmo número pertencem ao mesmo L.`
        : `Peça L na linha ${state.pieceRow + 1}, coluna ${state.pieceColumn + 1}, girada ${state.pieceTurn} quartos de volta. Casas claras e escuras alternadas.`
    : geometrySummary(launch, state);
  return (
    <div className="space-y-4">
      {kind === "shape" ? (
        <>
          <Options
            label="Forma plana"
            value={state.shape}
            options={[
              { value: "triangulo", label: "Triângulo" },
              { value: "quadrado", label: "Quadrado" },
              { value: "pentagono", label: "Pentágono" },
              { value: "hexagono", label: "Hexágono" },
            ]}
            onChange={(shape) =>
              update({
                shape:
                  shape === "triangulo"
                    ? "triangulo"
                    : shape === "quadrado"
                      ? "quadrado"
                      : shape === "pentagono"
                        ? "pentagono"
                        : "hexagono",
              })
            }
          />
          <svg
            viewBox="0 0 220 220"
            className="mx-auto w-full max-w-64"
            role="img"
            aria-label={
              hideResults ? `Forma plana: ${state.shape}.` : `${state.shape}, ${sides} lados`
            }
          >
            <polygon
              points={Array.from(
                { length: sides },
                (_, index) =>
                  `${110 + Math.cos((index / sides) * Math.PI * 2 - Math.PI / 2) * 85},${110 + Math.sin((index / sides) * Math.PI * 2 - Math.PI / 2) * 85}`,
              ).join(" ")}
              fill="#c8e6d4"
              stroke="#172e2a"
              strokeWidth="3"
            />
            {!hideResults &&
              positions(sides).map((index) => (
                <text
                  key={index}
                  x={110 + Math.cos(((index + 0.5) / sides) * Math.PI * 2 - Math.PI / 2) * 70}
                  y={110 + Math.sin(((index + 0.5) / sides) * Math.PI * 2 - Math.PI / 2) * 70}
                  textAnchor="middle"
                  fontSize="16"
                >
                  {index + 1}
                </text>
              ))}
          </svg>
        </>
      ) : kind === "polygon" ? (
        <>
          <Plane
            extent={6}
            points={state.points
              .map((point, index) => ({ point, index }))
              .map(({ point, index }) => ({
                point,
                label: String.fromCharCode(65 + index),
              }))}
            polygons={[state.points]}
            description={description}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {state.points
              .map((point, index) => ({ point, index }))
              .map(({ point, index }) => (
                <div key={index} className={panelClass}>
                  <p className="font-bold">Vértice {String.fromCharCode(65 + index)}</p>
                  <NumberControl
                    label={`x do vértice ${String.fromCharCode(65 + index)}`}
                    value={point.x}
                    min={0}
                    max={6}
                    onChange={(x) =>
                      update({
                        points: state.points.map((value, position) =>
                          position === index ? { ...value, x } : value,
                        ),
                      })
                    }
                  />
                  <NumberControl
                    label={`y do vértice ${String.fromCharCode(65 + index)}`}
                    value={point.y}
                    min={0}
                    max={6}
                    onChange={(y) =>
                      update({
                        points: state.points.map((value, position) =>
                          position === index ? { ...value, y } : value,
                        ),
                      })
                    }
                  />
                </div>
              ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
        </>
      ) : kind === "tiling" ? (
        <>
          <NumberControl
            label="Expoente n no lado 2 elevado a n"
            value={state.tilingPower}
            min={1}
            max={3}
            onChange={(tilingPower) =>
              update({
                tilingPower,
                missingRow: Math.min(state.missingRow, 2 ** tilingPower - 1),
                missingColumn: Math.min(state.missingColumn, 2 ** tilingPower - 1),
                tilingStep: 0,
              })
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberControl
              label="Linha da casa removida"
              value={state.missingRow + 1}
              min={1}
              max={boardSize}
              onChange={(row) => update({ missingRow: row - 1, tilingStep: 0 })}
            />
            <NumberControl
              label="Coluna da casa removida"
              value={state.missingColumn + 1}
              min={1}
              max={boardSize}
              onChange={(column) => update({ missingColumn: column - 1, tilingStep: 0 })}
            />
          </div>
          <div
            className="mx-auto grid w-full max-w-md gap-1"
            style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
            role="img"
            aria-label={description}
          >
            {positions(boardSize * boardSize).map((cell) => {
              const x = cell % boardSize;
              const y = Math.floor(cell / boardSize);
              const hole = x === state.missingColumn && y === state.missingRow;
              const tile = tiles
                .slice(0, state.tilingStep)
                .findIndex((piece) => piece.some((point) => point.x === x && point.y === y));
              const colors = ["#d3efdc", "#ffe19b", "#dceafa", "#f7d7e6", "#e6def5"];
              return (
                <span
                  key={cell}
                  className="flex aspect-square min-h-7 items-center justify-center border border-tinta text-sm font-bold text-tinta"
                  style={{
                    background: hole
                      ? "#273d35"
                      : tile >= 0
                        ? colors[tile % colors.length]
                        : "#fff",
                    color: hole ? "#fff" : undefined,
                  }}
                >
                  {hole ? "×" : tile >= 0 ? tile + 1 : ""}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={state.tilingStep >= tiles.length}
              onClick={() => update({ tilingStep: state.tilingStep + 1 })}
            >
              Colocar a próxima peça L
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={state.tilingStep === 0}
              onClick={() => update({ tilingStep: state.tilingStep - 1 })}
            >
              Retirar a última peça
            </button>
            {!hideResults && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => update({ tilingStep: tiles.length })}
              >
                Ver a cobertura completa
              </button>
            )}
          </div>
          <p className="text-sm">
            × é a casa removida. Casas com o mesmo número pertencem à mesma peça. A peça 1 atravessa
            o centro; as seguintes repetem a construção em quadrantes menores.
          </p>
        </>
      ) : kind === "trimino" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberControl
              label="Linha da peça"
              value={state.pieceRow + 1}
              min={1}
              max={5}
              onChange={(row) => update({ pieceRow: row - 1 })}
            />
            <NumberControl
              label="Coluna da peça"
              value={state.pieceColumn + 1}
              min={1}
              max={5}
              onChange={(column) => update({ pieceColumn: column - 1 })}
            />
          </div>
          <button
            type="button"
            className={buttonClass}
            onClick={() => update({ pieceTurn: (state.pieceTurn + 1) % 4 })}
          >
            Girar a peça L um quarto de volta
          </button>
          <div
            className="mx-auto grid w-full max-w-sm grid-cols-6 gap-1"
            role="img"
            aria-label={description}
          >
            {positions(36).map((cell) => {
              const covered = triminoCells(state.pieceRow, state.pieceColumn, state.pieceTurn)[
                cell
              ];
              const dark = (Math.floor(cell / 6) + (cell % 6)) % 2 === 0;
              return (
                <span
                  key={cell}
                  className="flex aspect-square min-h-11 items-center justify-center border-2 border-tinta text-xl font-bold"
                  style={{
                    background: dark ? "#176344" : "#eff8f1",
                    color: dark ? "#fff" : "#172e2a",
                    outline: covered ? "3px solid #d68b16" : undefined,
                    outlineOffset: -4,
                  }}
                >
                  {covered ? "L" : dark ? "·" : ""}
                </span>
              );
            })}
          </div>
          <p className="text-sm">
            L marca as casas cobertas. Os pontos marcam a cor escura. Compare as cores ao mover a
            peça.
          </p>
        </>
      ) : (
        <>
          {kind === "units" && (
            <NumberControl
              label="Lado de cada quadrado em cm"
              value={state.side}
              min={1}
              max={4}
              onChange={(side) => update({ side })}
            />
          )}
          <p className="text-sm">
            Toque para colocar ou tirar uma peça. Para mover sem mudar a área, selecione uma peça
            usando o botão abaixo e depois toque em uma casa vazia.
          </p>
          <fieldset
            className="mx-auto grid w-full max-w-sm grid-cols-6 gap-1"
            aria-label="Malha com seis linhas e seis colunas"
          >
            {positions(36).map((index) => {
              const occupied = state.cells[index];
              const dark = (Math.floor(index / 6) + (index % 6)) % 2 === 0;
              return (
                <button
                  type="button"
                  key={index}
                  className="flex aspect-square min-h-11 min-w-0 items-center justify-center border-2 border-tinta text-lg font-bold focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-tinta"
                  style={{
                    background:
                      selected === index
                        ? "#ffe19b"
                        : occupied
                          ? dark
                            ? "#176344"
                            : "#c8e6d4"
                          : "#fff",
                    color: occupied && dark ? "#fff" : "#172e2a",
                  }}
                  aria-label={`Linha ${Math.floor(index / 6) + 1}, coluna ${(index % 6) + 1}, ${dark ? "escura" : "clara"}, ${occupied ? "com peça" : "vazia"}${selected === index ? ", selecionada para mover" : ""}`}
                  aria-pressed={occupied}
                  onClick={() => {
                    if (selected !== null) {
                      if (selected >= 0) {
                        if (!occupied) {
                          update({
                            cells: state.cells.map((value, position) =>
                              position === selected ? false : position === index ? true : value,
                            ),
                          });
                          setSelected(null);
                        } else setSelected(index);
                      } else if (occupied) setSelected(index);
                    } else
                      update({
                        cells: state.cells.map((value, position) =>
                          position === index ? !value : value,
                        ),
                      });
                  }}
                >
                  {occupied ? "■" : kind === "color" && dark ? "·" : ""}
                </button>
              );
            })}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              aria-pressed={selected !== null}
              onClick={() => setSelected(selected === null ? -1 : null)}
            >
              {selected === null ? "Mover uma peça" : "Cancelar movimento"}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                update({ cells: state.cells.map(() => false) });
                setSelected(null);
              }}
            >
              Limpar a malha
            </button>
          </div>
          {selected !== null && (
            <p role="status">
              {selected < 0
                ? "Selecione uma peça pintada."
                : "Agora escolha uma casa vazia. Você também pode selecionar outra peça."}
            </p>
          )}
          {!hideResults && (
            <p className="text-sm">
              Área: {cellMeasures(state.cells).area} quadradinhos. Contorno:{" "}
              {cellMeasures(state.cells).perimeter} lados expostos.
            </p>
          )}
        </>
      )}
      {!hideResults && <Output>{geometrySummary(launch, state)}</Output>}
    </div>
  );
}

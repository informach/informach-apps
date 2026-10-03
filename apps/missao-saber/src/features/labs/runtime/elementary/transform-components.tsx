"use client";
import type { LabToolProps } from "../types";
import { format } from "./math";
import {
  parseTransform,
  reflectAtAngle,
  rotatePoint,
  symmetryFigure,
  transformDefinition,
  transformedPoint,
  transformSummary,
  transformValue,
} from "./transforms";
import { NumberControl, Options, Output, Plane, panelClass, positions } from "./ui";

export function TransformsTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseTransform(launch, raw);
  const kind = transformDefinition(launch).kind;
  const update = (changes: Partial<typeof state>) =>
    onChange(parseTransform(launch, { ...state, ...changes }));
  const sizes = ["scale", "area", "criteria", "tales"].includes(kind);
  const point = transformedPoint(launch, state);
  const taleWidth = (state.sideA * state.far) / state.near;
  const taleScale = Math.min(220 / state.far, 130 / (taleWidth / 2));
  const description = hideResults
    ? kind === "symmetry"
      ? `${state.figure}; ${launch.mode === "simetria-rotacional" ? `giro de ${state.turns * 90} graus` : `eixo a ${state.axisAngle} graus`}. Contorno contínuo: original; tracejado: imagem transformada.`
      : kind === "tales"
        ? `Paralelas às distâncias ${state.near} e ${state.far} do vértice. Largura próxima ${state.sideA}.`
        : sizes
          ? `Retângulo original de lados ${state.sideA} e ${state.sideB}. Todos os lados da imagem usam o fator ${state.scale}.`
          : `Ponto A (${state.x}, ${state.y}). Espelho ${state.axis}; giro ${state.turns} quartos de volta; deslocamento (${state.tx}, ${state.ty}).`
    : transformSummary(launch, state);
  return (
    <div className="space-y-4">
      {kind === "symmetry" ? (
        <>
          <Options
            label="Figura"
            value={state.figure}
            options={[
              { value: "quadrado", label: "Quadrado" },
              { value: "retangulo", label: "Retângulo" },
              { value: "triangulo-equilatero", label: "Triângulo equilátero" },
              { value: "paralelogramo", label: "Paralelogramo inclinado" },
            ]}
            onChange={(figure) =>
              update({
                figure:
                  figure === "quadrado"
                    ? "quadrado"
                    : figure === "retangulo"
                      ? "retangulo"
                      : figure === "triangulo-equilatero"
                        ? "triangulo-equilatero"
                        : "paralelogramo",
              })
            }
          />
          {launch.mode === "simetria-rotacional" ? (
            <NumberControl
              label="Quartos de volta ao redor do centro"
              value={state.turns}
              min={0}
              max={3}
              onChange={(turns) => update({ turns })}
            />
          ) : (
            <NumberControl
              label="Inclinação do eixo em graus"
              value={state.axisAngle}
              min={0}
              max={165}
              step={15}
              onChange={(axisAngle) => update({ axisAngle })}
            />
          )}
          <Plane
            extent={4}
            points={[]}
            polygons={[
              symmetryFigure(state),
              symmetryFigure(state).map((point) =>
                launch.mode === "simetria-rotacional"
                  ? rotatePoint(point, state.turns)
                  : reflectAtAngle(point, state.axisAngle),
              ),
            ]}
            lines={
              launch.mode === "simetria-rotacional"
                ? []
                : [
                    [
                      {
                        x: -4 * Math.cos((state.axisAngle * Math.PI) / 180),
                        y: -4 * Math.sin((state.axisAngle * Math.PI) / 180),
                      },
                      {
                        x: 4 * Math.cos((state.axisAngle * Math.PI) / 180),
                        y: 4 * Math.sin((state.axisAngle * Math.PI) / 180),
                      },
                    ],
                  ]
            }
            description={description}
          />
          <p className="text-sm">
            O contorno contínuo é o original; o tracejado é a imagem transformada. Para haver
            simetria, todos os lados devem coincidir.
          </p>
        </>
      ) : sizes ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberControl
              label={kind === "tales" ? "Largura na paralela próxima" : "Lado A do retângulo"}
              value={state.sideA}
              min={1}
              max={5}
              onChange={(sideA) => update({ sideA })}
            />
            {kind === "tales" ? (
              <>
                <NumberControl
                  label="Distância do vértice à paralela próxima"
                  value={state.near}
                  min={1}
                  max={Math.min(5, state.far - 1)}
                  onChange={(near) => update({ near })}
                />
                <NumberControl
                  label="Distância do vértice à paralela distante"
                  value={state.far}
                  min={state.near + 1}
                  max={10}
                  onChange={(far) => update({ far })}
                />
              </>
            ) : (
              <>
                <NumberControl
                  label="Lado B do retângulo"
                  value={state.sideB}
                  min={1}
                  max={5}
                  onChange={(sideB) => update({ sideB })}
                />
                <NumberControl
                  label="Fator de escala"
                  value={state.scale}
                  min={0.25}
                  max={4}
                  step={0.25}
                  onChange={(scale) => update({ scale })}
                />
              </>
            )}
          </div>
          {kind === "tales" ? (
            <svg
              viewBox="0 0 360 280"
              role="img"
              aria-label={description}
              className="mx-auto w-full max-w-md"
            >
              <line
                x1="180"
                y1="20"
                x2={180 - (taleWidth * taleScale) / 2}
                y2={20 + state.far * taleScale}
                stroke="#172e2a"
                strokeWidth="2"
              />
              <line
                x1="180"
                y1="20"
                x2={180 + (taleWidth * taleScale) / 2}
                y2={20 + state.far * taleScale}
                stroke="#172e2a"
                strokeWidth="2"
              />
              {[
                { distance: state.near, width: state.sideA, name: "próxima" },
                { distance: state.far, width: transformValue(launch, state), name: "distante" },
              ].map(({ distance, width, name }) => {
                return (
                  <g key={name}>
                    <line
                      x1={180 - (width * taleScale) / 2}
                      y1={20 + distance * taleScale}
                      x2={180 + (width * taleScale) / 2}
                      y2={20 + distance * taleScale}
                      stroke="#176344"
                      strokeWidth="3"
                    />
                    <text x="180" y={14 + distance * taleScale} textAnchor="middle" fontSize="13">
                      {hideResults && name === "distante" ? "?" : format(width)}
                    </text>
                    <text
                      x={185 + (width * taleScale) / 2}
                      y={20 + distance * taleScale}
                      fontSize="11"
                    >
                      {distance}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className={panelClass}>
              <svg viewBox="0 0 400 260" role="img" aria-label={description} className="w-full">
                <rect
                  x="20"
                  y="35"
                  width={state.sideA * 10}
                  height={state.sideB * 10}
                  fill="#c8e6d4"
                  stroke="#176344"
                  strokeWidth="2"
                />
                <text x="20" y="23" fontSize="13">
                  Original: A={state.sideA}, B={state.sideB}
                </text>
                <rect
                  x="130"
                  y="35"
                  width={state.sideA * state.scale * 10}
                  height={state.sideB * state.scale * 10}
                  fill="#ffdab1"
                  stroke="#994711"
                  strokeWidth="2"
                />
                {positions(Number.isInteger(state.scale) ? state.scale - 1 : 0).map((index) => (
                  <g key={index}>
                    <line
                      x1={130 + state.sideA * (index + 1) * 10}
                      y1="35"
                      x2={130 + state.sideA * (index + 1) * 10}
                      y2={35 + state.sideB * state.scale * 10}
                      stroke="#994711"
                      strokeDasharray="4 3"
                    />
                    <line
                      x1="130"
                      y1={35 + state.sideB * (index + 1) * 10}
                      x2={130 + state.sideA * state.scale * 10}
                      y2={35 + state.sideB * (index + 1) * 10}
                      stroke="#994711"
                      strokeDasharray="4 3"
                    />
                  </g>
                ))}
                <text x="130" y="23" fontSize="13">
                  {hideResults
                    ? "Imagem: lados A e B"
                    : `Imagem: A=${state.sideA * state.scale}, B=${state.sideB * state.scale}`}
                </text>
              </svg>
              {!hideResults && (
                <p className="text-sm">
                  A mesma escala é usada nos dois desenhos. A área da imagem é{" "}
                  {format(state.scale ** 2)} vezes a área original. Para fatores inteiros, as linhas
                  internas mostram as cópias do retângulo original.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberControl
              label={launch.grade <= 4 ? "Posição horizontal da marca" : "Coordenada x do ponto"}
              value={state.x}
              min={launch.grade <= 4 ? 0 : -4}
              max={4}
              onChange={(x) => update({ x })}
            />
            <NumberControl
              label={launch.grade <= 4 ? "Posição vertical da marca" : "Coordenada y do ponto"}
              value={state.y}
              min={launch.grade <= 4 ? 0 : -4}
              max={4}
              onChange={(y) => update({ y })}
            />
            {["reflect", "fold", "compose"].includes(kind) && (
              <Options
                label="Eixo do espelho"
                value={state.axis}
                options={[
                  {
                    value: "vertical",
                    label: launch.grade <= 4 ? "Vertical" : "Vertical (eixo y)",
                  },
                  {
                    value: "horizontal",
                    label: launch.grade <= 4 ? "Horizontal" : "Horizontal (eixo x)",
                  },
                ]}
                onChange={(axis) =>
                  update({ axis: axis === "vertical" ? "vertical" : "horizontal" })
                }
              />
            )}{" "}
            {["rotate", "compose"].includes(kind) && (
              <NumberControl
                label="Quartos de volta no sentido anti-horário"
                value={state.turns}
                min={0}
                max={3}
                onChange={(turns) => update({ turns })}
              />
            )}{" "}
            {["translate", "compose"].includes(kind) && (
              <>
                <NumberControl
                  label="Deslocamento horizontal"
                  value={state.tx}
                  min={-4}
                  max={4}
                  onChange={(tx) => update({ tx })}
                />
                <NumberControl
                  label="Deslocamento vertical"
                  value={state.ty}
                  min={-4}
                  max={4}
                  onChange={(ty) => update({ ty })}
                />
              </>
            )}
          </div>
          {kind === "compose" && (
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={state.secondReflection}
                onChange={(event) => update({ secondReflection: event.target.checked })}
              />
              Refletir uma segunda vez no mesmo eixo antes de girar
            </label>
          )}
          <Plane
            extent={8}
            showCoordinates={launch.grade > 4}
            points={[
              { point: { x: state.x, y: state.y }, label: "A" },
              { point, label: "A′", filled: true },
            ]}
            lines={
              kind === "fold" || kind === "reflect"
                ? [
                    [{ x: state.x, y: state.y }, point],
                    state.axis === "vertical"
                      ? [
                          { x: 0, y: -8 },
                          { x: 0, y: 8 },
                        ]
                      : [
                          { x: -8, y: 0 },
                          { x: 8, y: 0 },
                        ],
                  ]
                : [[{ x: state.x, y: state.y }, point]]
            }
            description={description}
          />
          {kind === "fold" && (
            <p className="text-sm">
              A é a marca antes de abrir o papel. A′ é sua imagem ao abrir. Se elas coincidirem na
              dobra, há apenas uma marca.
            </p>
          )}
        </>
      )}
      {!hideResults && <Output>{transformSummary(launch, state)}</Output>}
    </div>
  );
}

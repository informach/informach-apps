"use client";

import { useId } from "react";
import type { LabToolProps } from "../types";
import {
  advancedTriangleSummary,
  parseAdvancedTriangle,
  projectionMeasures,
  quadrilateralMeasures,
} from "./advanced-triangles";
import { AdvancedFrame, Choice, Range, useAdvancedState } from "./advanced-ui";
import { formatNumber } from "./math";
import { triangleGivenSummary } from "./triangle-given-summary";

export function AdvancedTriangleTool(props: LabToolProps) {
  const { state: s, update, error } = useAdvancedState(props, parseAdvancedTriangle),
    id = useId();
  const summary = props.hideResults
    ? triangleGivenSummary(props.launch, s)
    : advancedTriangleSummary(s);
  if (s.kind === "projections") {
    const measures = projectionMeasures(s),
      scale = Math.min(310 / measures.hypotenuse, 170 / measures.height),
      left = 40,
      right = 40 + measures.hypotenuse * scale,
      foot = 40 + s.p * scale,
      top = 215 - measures.height * scale;
    return (
      <AdvancedFrame summary={summary} error={error} disabled={props.disabled}>
        <svg
          viewBox="0 0 420 260"
          className="max-h-80 w-full bg-creme"
          role="img"
          aria-labelledby={id}
        >
          <title id={id}>
            {props.hideResults
              ? summary
              : `Triângulo retângulo com altura perpendicular à hipotenusa; projeções p=${s.p}, q=${s.q} e altura h=${formatNumber(measures.height)}.`}
          </title>
          <polygon
            points={`${left},215 ${right},215 ${foot},${top}`}
            fill="#d6ecdf"
            stroke="#247a58"
            strokeWidth="3"
          />
          <line
            x1={foot}
            x2={foot}
            y1={top}
            y2="215"
            stroke="#385cb0"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
          <path d={`M${foot},203 h12 v12`} fill="none" stroke="currentColor" />
          <text x={(left + foot) / 2} y="240" textAnchor="middle">
            p={s.p}
          </text>
          <text x={(foot + right) / 2} y="240" textAnchor="middle">
            q={s.q}
          </text>
          <text x={foot + 8} y={(top + 215) / 2}>
            h
          </text>
        </svg>
        <div className="grid gap-3 sm:grid-cols-2">
          <Range label="Projeção p" value={s.p} min={1} max={20} onChange={(p) => update({ p })} />
          <Range label="Projeção q" value={s.q} min={1} max={20} onChange={(q) => update({ q })} />
        </div>
        <Choice
          label="Medida pedida"
          value={s.target}
          options={[
            { value: "height", label: "Altura h" },
            { value: "left", label: "Cateto esquerdo" },
            { value: "right", label: "Cateto direito" },
            { value: "hypotenuse", label: "Hipotenusa inteira" },
          ]}
          onChange={(target) => update({ target })}
        />
      </AdvancedFrame>
    );
  }
  const measures = quadrilateralMeasures(s),
    rhombus = s.shape === "rhombus",
    scale = Math.min(
      310 / (rhombus ? s.diagonal : s.base),
      175 / (rhombus ? measures.diagonal : measures.height),
    );
  const left = 40,
    right = left + (rhombus ? s.diagonal : s.base) * scale,
    center = (left + right) / 2,
    top = 215 - (rhombus ? measures.diagonal : measures.height) * scale,
    middle = (top + 215) / 2;
  const topLeft = left + (s.shape === "isosceles-trapezoid" ? measures.offset * scale : 0),
    topRight = topLeft + s.top * scale;
  return (
    <AdvancedFrame summary={summary} error={error} disabled={props.disabled}>
      <svg
        viewBox="0 0 420 265"
        className="max-h-80 w-full bg-creme"
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>{summary}</title>
        {rhombus ? (
          <>
            <polygon
              points={`${left},${middle} ${center},${top} ${right},${middle} ${center},215`}
              fill="#d6ecdf"
              stroke="#247a58"
              strokeWidth="3"
            />
            <line
              x1={left}
              x2={right}
              y1={middle}
              y2={middle}
              stroke="#385cb0"
              strokeDasharray="5 3"
            />
            <line
              x1={center}
              x2={center}
              y1={top}
              y2="215"
              stroke="#385cb0"
              strokeDasharray="5 3"
            />
            <text x={center + 8} y={middle - 8}>
              90°
            </text>
            <text x={center} y="242" textAnchor="middle">
              diagonal horizontal {s.diagonal}
            </text>
          </>
        ) : (
          <>
            <polygon
              points={`${left},215 ${right},215 ${topRight},${top} ${topLeft},${top}`}
              fill="#d6ecdf"
              stroke="#247a58"
              strokeWidth="3"
            />
            <line
              x1={topRight}
              x2={topRight}
              y1={top}
              y2="215"
              stroke="#385cb0"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <path d={`M${topRight},203 h12 v12`} fill="none" stroke="currentColor" />
            {s.shape === "isosceles-trapezoid" && (
              <line
                x1={topLeft}
                x2={topLeft}
                y1={top}
                y2="215"
                stroke="#385cb0"
                strokeDasharray="5 3"
              />
            )}
            <text x={topRight - 15} y={(top + 215) / 2}>
              h
            </text>
            <text x={(topRight + right) / 2} y="245" textAnchor="middle">
              {props.hideResults ? "projeção" : formatNumber(measures.offset)}
            </text>
            <text x={(topLeft + topRight) / 2} y={top - 7} textAnchor="middle">
              base {s.top}
            </text>
          </>
        )}
      </svg>
      <Choice
        label="Figura"
        value={s.shape}
        options={[
          { value: "right-trapezoid", label: "Trapézio retângulo" },
          { value: "isosceles-trapezoid", label: "Trapézio isósceles" },
          { value: "rhombus", label: "Losango" },
        ]}
        onChange={(shape) => update({ shape, target: "area" })}
      />
      <Choice
        label="Medida pedida"
        value={s.target}
        options={
          rhombus
            ? [
                { value: "side", label: "Lado do losango" },
                { value: "diagonal", label: "Outra diagonal" },
                { value: "area", label: "Área do losango" },
              ]
            : [
                { value: "height", label: "Altura perpendicular" },
                { value: "area", label: "Área do trapézio" },
              ]
        }
        onChange={(target) => update({ target })}
      />
      {rhombus && (
        <Choice
          label="Medidas conhecidas"
          value={s.known}
          options={[
            { value: "diagonals", label: "As duas diagonais" },
            { value: "side-diagonal", label: "Lado e uma diagonal" },
          ]}
          onChange={(known) => update({ known })}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rhombus ? (
          <>
            <Range
              label="Diagonal horizontal inteira"
              value={s.diagonal}
              min={2}
              max={20}
              onChange={(diagonal) => update({ diagonal })}
            />
            {s.known === "diagonals" && (
              <Range
                label="Diagonal vertical inteira"
                value={s.otherDiagonal}
                min={2}
                max={20}
                onChange={(otherDiagonal) => update({ otherDiagonal })}
              />
            )}
          </>
        ) : (
          <>
            <Range
              label="Base maior"
              value={s.base}
              min={2}
              max={20}
              onChange={(base) => update({ base })}
            />
            <Range
              label="Base menor"
              value={s.top}
              min={1}
              max={19}
              onChange={(top) => update({ top })}
            />
          </>
        )}
        {(!rhombus || s.known === "side-diagonal") && (
          <Range
            label="Lado inclinado"
            value={s.side}
            min={1}
            max={25}
            onChange={(side) => update({ side })}
          />
        )}
      </div>
      <p className="text-sm">
        {rhombus
          ? "Cada um dos quatro triângulos retângulos usa as metades das diagonais. A área inteira é D·d/2."
          : "Some as áreas do retângulo e dos triângulos laterais: A=(B+b)·h/2. A altura vem do triângulo destacado."}
      </p>
    </AdvancedFrame>
  );
}

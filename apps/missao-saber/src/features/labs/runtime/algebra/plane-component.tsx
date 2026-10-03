"use client";
import { useId } from "react";
import type { LabToolProps } from "../types";
import {
  circleMetricSchema,
  circleMetrics,
  parsePlane,
  planeSummary,
  polygonMetricSchema,
  polygonMetrics,
} from "./plane";

const control = "mt-1 w-full rounded-controle border-2 border-sombra bg-creme p-3";
const point = (angle: number, radius: number) => ({
  x: 160 + radius * Math.cos((angle * Math.PI) / 180),
  y: 135 - radius * Math.sin((angle * Math.PI) / 180),
});
export function PlaneTool({ launch, state: raw, onChange, disabled }: LabToolProps) {
  const id = useId();
  const state = parsePlane(launch, raw);
  const update = (patch: Partial<typeof state>) =>
    onChange(parsePlane(launch, { ...state, ...patch }));
  const circle = launch.mode === "circulos-medidas-e-angulos";
  const radius = state.radius * 11;
  const end = point(state.angle, radius);
  const opposite = point(180 + state.angle / 2, radius);
  const vertices = Array.from({ length: state.sides }, (_, index) =>
    point(90 + (index * 360) / state.sides, 105),
  );
  const first = vertices[0];
  const triangle = state.polygonMetric === "missing";
  const height =
    160 /
    (1 / Math.tan((state.firstAngle * Math.PI) / 180) +
      1 / Math.tan((state.secondAngle * Math.PI) / 180));
  const peakX = 60 + height / Math.tan((state.firstAngle * Math.PI) / 180);
  const minX = Math.min(0, peakX - 30);
  const minY = Math.min(-10, 170 - height);
  const triangleView = `${minX} ${minY} ${Math.max(320, peakX + 30) - minX} ${280 - minY}`;
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 border-0 p-0">
      <legend className="sr-only">Controles de geometria plana</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="font-semibold" htmlFor={`${id}-metric`}>
          Medida a descobrir
          <select
            id={`${id}-metric`}
            className={control}
            value={circle ? state.circleMetric : state.polygonMetric}
            onChange={(event) =>
              update(
                circle
                  ? { circleMetric: circleMetricSchema.parse(event.target.value) }
                  : { polygonMetric: polygonMetricSchema.parse(event.target.value) },
              )
            }
          >
            {Object.entries(circle ? circleMetrics : polygonMetrics).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {circle ? (
          <>
            <label className="font-semibold">
              Raio em cm: {state.radius}
              <input
                className="mt-3 min-h-11 w-full"
                type="range"
                min={1}
                max={10}
                step={1}
                value={state.radius}
                onChange={(event) => update({ radius: Number(event.target.value) })}
              />
            </label>
            <label className="font-semibold">
              Ângulo central em graus: {state.angle}
              <input
                className="mt-3 min-h-11 w-full"
                type="range"
                min={10}
                max={350}
                step={10}
                value={state.angle}
                onChange={(event) => update({ angle: Number(event.target.value) })}
              />
            </label>
          </>
        ) : triangle ? (
          <>
            <label className="font-semibold">
              Primeiro ângulo: {state.firstAngle}°
              <input
                className="mt-3 min-h-11 w-full"
                type="range"
                min={10}
                max={150}
                step={1}
                value={state.firstAngle}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  update({
                    firstAngle: value,
                    secondAngle: Math.min(state.secondAngle, 179 - value),
                  });
                }}
              />
            </label>
            <label className="font-semibold">
              Segundo ângulo: {state.secondAngle}°
              <input
                className="mt-3 min-h-11 w-full"
                type="range"
                min={10}
                max={Math.min(150, 179 - state.firstAngle)}
                step={1}
                value={state.secondAngle}
                onChange={(event) => update({ secondAngle: Number(event.target.value) })}
              />
            </label>
          </>
        ) : (
          <label className="font-semibold">
            Quantidade de lados: {state.sides}
            <input
              className="mt-3 min-h-11 w-full"
              type="range"
              min={3}
              max={12}
              step={1}
              value={state.sides}
              onChange={(event) => update({ sides: Number(event.target.value) })}
            />
          </label>
        )}
      </div>
      <svg
        viewBox={triangle && !circle ? triangleView : "0 0 320 280"}
        className="mx-auto max-h-80 w-full max-w-md rounded-controle border-2 border-sombra bg-white"
        role="img"
        aria-label={planeSummary(launch, state)}
      >
        {circle ? (
          <>
            <circle cx={160} cy={135} r={radius} fill="#f4f1e8" stroke="#183d38" strokeWidth={2} />
            <path
              d={`M160,135 L${160 + radius},135 A${radius},${radius} 0 ${state.angle > 180 ? 1 : 0},0 ${end.x},${end.y} Z`}
              fill="#c4e7df"
              stroke="#183d38"
              strokeWidth={1.5}
            />
            <line x1={160} y1={135} x2={160 + radius} y2={135} stroke="#183d38" strokeWidth={2} />
            <text x={160 + radius / 2} y={154} fontSize={12} textAnchor="middle">
              r={state.radius} cm
            </text>
            {state.circleMetric === "inscribed" && (
              <>
                <polyline
                  points={`${160 + radius},135 ${opposite.x},${opposite.y} ${end.x},${end.y}`}
                  fill="none"
                  stroke="#6a3480"
                  strokeWidth={3}
                />
                <circle cx={opposite.x} cy={opposite.y} r={4} fill="#6a3480" />
              </>
            )}
            <text x={160} y={265} textAnchor="middle" fontSize={13}>
              Arco destacado: {state.angle}° da volta
            </text>
          </>
        ) : triangle ? (
          <>
            <polygon
              points={`60,200 220,200 ${peakX},${200 - height}`}
              fill="#c4e7df"
              stroke="#183d38"
              strokeWidth={2}
            />
            <text x={66} y={219} fontSize={13}>
              {state.firstAngle}°
            </text>
            <text x={192} y={219} fontSize={13}>
              {state.secondAngle}°
            </text>
            <text x={peakX} y={190 - height} fontSize={14}>
              ?
            </text>
          </>
        ) : (
          <>
            <polygon
              points={vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(" ")}
              fill="#c4e7df"
              stroke="#183d38"
              strokeWidth={2}
            />
            {first &&
              vertices
                .slice(2, -1)
                .map((vertex) => (
                  <line
                    key={`${vertex.x}-${vertex.y}`}
                    x1={first.x}
                    y1={first.y}
                    x2={vertex.x}
                    y2={vertex.y}
                    stroke="#6a3480"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                ))}
            <text x={160} y={265} fontSize={13} textAnchor="middle">
              {state.sides - 2} triângulos de 180°
            </text>
          </>
        )}
      </svg>
      <p className="text-sm">
        {planeSummary(launch, state)}{" "}
        {circle
          ? "A escala de 1 cm é a mesma quando você muda o raio. A área e o contorno usam unidades diferentes."
          : "Diagonais internas dividem a região sem criar nem retirar ângulos da soma. Um polígono regular tem lados e ângulos iguais."}
      </p>
    </fieldset>
  );
}

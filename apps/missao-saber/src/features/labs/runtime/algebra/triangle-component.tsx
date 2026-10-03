"use client";
import { useId } from "react";
import type { LabToolProps } from "../types";
import { button, Frame, panel, Select, Slider, useTool } from "./controls";
import { formatNumber } from "./math";
import { triangleGivenSummary } from "./triangle-given-summary";
import { parseTriangle, radians, triangleMeasures, triangleSummary } from "./triangles";
export function TriangleTool(props: LabToolProps) {
  const { state: s, update, error } = useTool(props, parseTriangle);
  const mode = props.launch.mode;
  const shape = triangleMeasures(props.launch, s);
  const minX = Math.min(0, shape.x),
    maxX = Math.max(shape.base, shape.x),
    width = maxX - minX;
  const scale = Math.min(275 / Math.max(1, width), 170 / Math.max(1, shape.height));
  const px = (x: number) => 50 + (x - minX) * scale,
    py = (y: number) => 225 - y * scale;
  const id = useId();
  const summary = props.hideResults
    ? triangleGivenSummary(props.launch, s)
    : triangleSummary(props.launch, s);
  const parallel = mode === "angulos-e-paralelas",
    circle = mode === "circulos-e-tangentes";
  const triangle = !parallel && !circle;
  const hypotenuseView = [
    "catetos-hipotenusa-e-quadrados",
    "alturas-diagonais",
    "razoes-triangulo",
  ].includes(mode);
  return (
    <Frame disabled={props.disabled} error={error} summary={summary}>
      <div className={panel}>
        <svg viewBox="0 0 400 280" role="img" aria-labelledby={id} className="w-full max-w-2xl">
          <title id={id}>{summary}</title>
          {triangle && (
            <>
              <polygon
                points={`${px(0)},${py(0)} ${px(shape.base)},${py(0)} ${px(shape.x)},${py(shape.height)}`}
                fill="#d9eaf2"
                stroke="#243846"
                strokeWidth="3"
              />
              <line
                x1={px(shape.x)}
                x2={px(shape.x)}
                y1={py(0)}
                y2={py(shape.height)}
                stroke="#a64b16"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
              <line
                x1={px(Math.min(0, shape.x))}
                x2={px(Math.max(shape.base, shape.x))}
                y1={py(0)}
                y2={py(0)}
                stroke="#243846"
                strokeDasharray="3 3"
              />
              <path
                d={`M${px(shape.x) + 9} ${py(0)} v-9 h-9`}
                fill="none"
                stroke="#a64b16"
                strokeWidth="2"
              />
              <text x={px(shape.base / 2)} y={py(0) + 25} textAnchor="middle" fontSize="15">
                Base
                {props.hideResults && ["lei-senos-cossenos", "angulos-notaveis"].includes(mode)
                  ? ""
                  : `: ${formatNumber(shape.base)}`}
              </text>
              <text x={px(shape.x) + 12} y={py(shape.height / 2)} fontSize="13">
                {props.hideResults ? "h" : `h = ${formatNumber(shape.height)}`}
              </text>
              {hypotenuseView && (
                <>
                  <text x={px(shape.base / 2) + 6} y={py(shape.height / 2) - 12} fontSize="14">
                    Hipotenusa
                  </text>
                  <text x={px(shape.base) - 25} y={py(0) - 10} fontSize="15">
                    A
                  </text>
                </>
              )}
              {mode === "alturas-diagonais" && (
                <path
                  d={`M${px(0)} ${py(shape.height)} H${px(shape.base)} V${py(0)}`}
                  fill="none"
                  stroke="#087f5b"
                  strokeDasharray="5 4"
                  strokeWidth="2"
                />
              )}
            </>
          )}
          {parallel &&
            (() => {
              const cx = 200,
                cy = 140,
                length = 220,
                cosine = Math.cos(radians(s.angle)),
                sine = Math.sin(radians(s.angle));
              const lowerX = cx - 45 / Math.tan(radians(s.angle)),
                upperX = cx + 45 / Math.tan(radians(s.angle));
              return (
                <>
                  <line x1="25" x2="375" y1="95" y2="95" stroke="#243846" strokeWidth="3" />
                  <line x1="25" x2="375" y1="185" y2="185" stroke="#243846" strokeWidth="3" />
                  <line
                    x1={cx - length * cosine}
                    x2={cx + length * cosine}
                    y1={cy + length * sine}
                    y2={cy - length * sine}
                    stroke="#087f5b"
                    strokeWidth="3"
                  />
                  <text x={upperX + 8} y="81" fontSize="16" fill="#155c8a">
                    {s.angle}°
                  </text>
                  <text x={upperX - 42} y="82" fontSize="16" fill="#a64b16">
                    ?
                  </text>
                  <text x={lowerX + 8} y="172" fontSize="14" fill="#155c8a">
                    Correspondente: {s.angle}°
                  </text>
                  <text x="200" y="240" textAnchor="middle" fontSize="14">
                    Retas paralelas; os ângulos junto a uma reta somam 180°.
                  </text>
                </>
              );
            })()}
          {circle &&
            (() => {
              const r = s.radius,
                d = s.distance,
                factor = Math.min(290 / (d + r), 105 / r),
                ox = 50 + r * factor,
                oy = 160,
                tx = (r * r) / d,
                ty = Math.sqrt(r * r - tx * tx);
              return (
                <>
                  <circle
                    cx={ox}
                    cy={oy}
                    r={r * factor}
                    fill="#d9eaf2"
                    stroke="#243846"
                    strokeWidth="2"
                  />
                  <line
                    x1={ox}
                    y1={oy}
                    x2={ox + d * factor}
                    y2={oy}
                    stroke="#243846"
                    strokeWidth="2"
                  />
                  <line
                    x1={ox}
                    y1={oy}
                    x2={ox + tx * factor}
                    y2={oy - ty * factor}
                    stroke="#087f5b"
                    strokeWidth="3"
                  />
                  <line
                    x1={ox + tx * factor}
                    y1={oy - ty * factor}
                    x2={ox + d * factor}
                    y2={oy}
                    stroke="#a64b16"
                    strokeWidth="3"
                  />
                  <circle cx={ox + tx * factor} cy={oy - ty * factor} r="4" fill="#243846" />
                  <text x={ox + 5} y={oy - 15} fontSize="14">
                    r = {r}
                  </text>
                  <text x={ox + (d * factor) / 2} y={oy + 23} fontSize="14">
                    d = {d}
                  </text>
                  <text
                    x={ox + ((tx + d) * factor) / 2}
                    y={oy - (ty * factor) / 2 - 8}
                    fontSize="14"
                  >
                    Tangente
                  </text>
                </>
              );
            })()}
        </svg>
        {mode === "catetos-hipotenusa-e-quadrados" && !props.hideResults && (
          <section
            className="flex flex-wrap items-end gap-4"
            aria-label={`Quadrados sobre os lados: áreas ${s.a ** 2}, ${s.b ** 2} e ${s.a ** 2 + s.b ** 2}`}
          >
            {[
              { side: s.a, name: "a²", area: s.a ** 2 },
              { side: s.b, name: "b²", area: s.b ** 2 },
              { side: Math.hypot(s.a, s.b), name: "c²", area: s.a ** 2 + s.b ** 2 },
            ].map(({ side, name, area }) => (
              <div key={name} className="text-center">
                <div
                  style={{
                    width: (side / Math.hypot(s.a, s.b)) * 110,
                    height: (side / Math.hypot(s.a, s.b)) * 110,
                  }}
                  className="border-2 border-sombra bg-sky-100"
                />
                <p className="text-sm">
                  {name} = {area}
                </p>
              </div>
            ))}
          </section>
        )}
        {triangle && (
          <p className="mt-2 text-xs">
            Desenho em escala: unidades horizontais e verticais têm o mesmo tamanho. A altura
            tracejada é perpendicular à base; a figura é ampliada para caber na tela.
          </p>
        )}
        {mode === "lei-senos-cossenos" && (
          <p className="mt-3 text-sm">
            {s.law === "cossenos"
              ? `Dois lados ${s.a} e ${s.b}; ângulo incluído ${s.angle}°. c² = a² + b² − 2ab·cos(${s.angle}°).`
              : `A = ${s.angle}°, B = ${s.secondAngle}°, C = ${180 - s.angle - s.secondAngle}°. a/sen(A) = b/sen(B).`}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {triangle && !["angulos-notaveis", "alturas-distancias-navegacao"].includes(mode) && (
          <Slider
            label={mode === "altura-para-area" ? "Metade da base (a)" : "Lado a"}
            value={s.a}
            min={1}
            max={20}
            onChange={(a) => update({ a })}
          />
        )}
        {triangle &&
          !(mode === "lei-senos-cossenos" && s.law === "senos") &&
          !["cateto-desconhecido", "altura-para-area", "alturas-distancias-navegacao"].includes(
            mode,
          ) && (
            <Slider
              label={mode === "angulos-notaveis" ? "Hipotenusa: tamanho do triângulo" : "Lado b"}
              value={s.b}
              min={1}
              max={20}
              onChange={(b) => update({ b })}
            />
          )}
        {[
          "cateto-desconhecido",
          "altura-para-area",
          "classificar-distancias",
          "construcoes",
        ].includes(mode) && (
          <Slider
            label={
              mode === "cateto-desconhecido" || mode === "altura-para-area"
                ? "Lado inclinado / hipotenusa c"
                : "Lado c (base)"
            }
            value={s.c}
            min={1}
            max={30}
            onChange={(c) => update({ c })}
          />
        )}
        {mode === "angulos-notaveis" ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Ângulo</p>
            <div className="flex gap-2">
              {[30, 45, 60].map((angle) => (
                <button
                  key={angle}
                  type="button"
                  className={button}
                  aria-pressed={s.angle === angle}
                  onClick={() => update({ angle })}
                >
                  {angle}°
                </button>
              ))}
            </div>
          </div>
        ) : (
          [
            "angulos-e-paralelas",
            "lei-senos-cossenos",
            "area-seno",
            "alturas-distancias-navegacao",
          ].includes(mode) && (
            <Slider
              label={
                mode === "lei-senos-cossenos" && s.law === "senos" ? "Ângulo A" : "Ângulo em graus"
              }
              value={s.angle}
              min={15}
              max={mode === "alturas-distancias-navegacao" ? 75 : 150}
              step={1}
              onChange={(angle) => update({ angle })}
            />
          )
        )}
        {mode === "lei-senos-cossenos" && (
          <>
            <Select
              label="Relação investigada"
              value={s.law}
              options={[
                { value: "cossenos", label: "Lei dos cossenos (dois lados e ângulo entre eles)" },
                { value: "senos", label: "Lei dos senos (dois ângulos e lado oposto a A)" },
              ]}
              onChange={(law) => {
                if (law === "cossenos" || law === "senos") update({ law });
              }}
            />
            {s.law === "senos" && (
              <Slider
                label="Ângulo B"
                value={s.secondAngle}
                min={15}
                max={150}
                onChange={(secondAngle) => update({ secondAngle })}
              />
            )}
          </>
        )}
        {mode === "razoes-triangulo" && (
          <Select
            label="Razão do ângulo A"
            value={s.ratio}
            options={[
              { value: "seno", label: "Seno: oposto / hipotenusa" },
              { value: "cosseno", label: "Cosseno: adjacente / hipotenusa" },
              { value: "tangente", label: "Tangente: oposto / adjacente" },
            ]}
            onChange={(ratio) => {
              if (ratio === "seno" || ratio === "cosseno" || ratio === "tangente")
                update({ ratio });
            }}
          />
        )}
        {circle && (
          <Slider
            label="Raio da circunferência"
            value={s.radius}
            min={1}
            max={10}
            onChange={(radius) => update({ radius })}
          />
        )}
        {(circle || mode === "alturas-distancias-navegacao") && (
          <Slider
            label={circle ? "Distância do ponto ao centro" : "Distância horizontal até a torre"}
            value={s.distance}
            min={2}
            max={25}
            onChange={(distance) => update({ distance })}
          />
        )}
      </div>
    </Frame>
  );
}

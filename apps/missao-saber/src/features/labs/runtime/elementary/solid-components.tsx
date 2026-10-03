"use client";
import type { LabToolProps } from "../types";
import { format } from "./math";
import type { SolidState } from "./solids";
import {
  basicSurfaceDescriptions,
  cuboidSection,
  parseSolid,
  polyhedronCounts,
  polyhedronGeometry,
  projectedHeights,
  rotatedStacks,
  solidDefinition,
  solidNames,
  solidShapeSchema,
  solidSummary,
} from "./solids";
import { buttonClass, NumberControl, Options, Output, panelClass } from "./ui";

function Stacks({ state, hideResults }: { state: SolidState; hideResults?: boolean }) {
  const stacks = rotatedStacks(state.stacks, state.rotation);
  const cubes = stacks
    .flatMap((height, index) =>
      Array.from({ length: height }, (_, level) => ({
        row: Math.floor(index / 3),
        column: index % 3,
        level,
      })),
    )
    .sort((a, b) => a.row + a.column - b.row - b.column || a.level - b.level);
  return (
    <svg
      viewBox="0 0 280 250"
      className="mx-auto w-full max-w-sm"
      role="img"
      aria-label={`${hideResults ? "Construção em perspectiva." : `Construção com ${stacks.reduce((a, b) => a + b, 0)} cubos.`} Alturas das pilhas: ${stacks.join(", ")}.`}
    >
      {cubes.map(({ row, column, level }) => {
        const x = 140 + (column - row) * 28;
        const y = 145 + (column + row) * 14 - level * 28;
        return (
          <g key={`${row}-${column}-${level}`}>
            <polygon
              points={`${x},${y - 28} ${x + 28},${y - 14} ${x},${y} ${x - 28},${y - 14}`}
              fill="#d3efdc"
              stroke="#172e2a"
            />
            <polygon
              points={`${x - 28},${y - 14} ${x},${y} ${x},${y + 28} ${x - 28},${y + 14}`}
              fill="#75ae8b"
              stroke="#172e2a"
            />
            <polygon
              points={`${x},${y} ${x + 28},${y - 14} ${x + 28},${y + 14} ${x},${y + 28}`}
              fill="#eac68d"
              stroke="#172e2a"
            />
          </g>
        );
      })}
      <text x="140" y="242" textAnchor="middle" fontSize="12">
        Vista em perspectiva; cubos podem ficar escondidos.
      </text>
    </svg>
  );
}
function Projection({ state, hideResults }: { state: SolidState; hideResults?: boolean }) {
  const heights = projectedHeights(state);
  const cells =
    state.view === "cima"
      ? heights.map((height) => height > 0)
      : Array.from(
          { length: 12 },
          (_, index) => (heights[index % 3] ?? 0) >= 4 - Math.floor(index / 3),
        );
  return (
    <div
      className="mx-auto grid w-36 grid-cols-3 gap-1"
      role="img"
      aria-label={`Vista ${state.view}.${hideResults ? "" : ` ${heights.reduce((a, b) => a + b, 0)} quadradinhos.`} ${state.view === "cima" ? `Uma casa por pilha não vazia: ${heights.map((height) => (height ? "ocupada" : "vazia")).join(", ")}.` : `Alturas visíveis ${heights.join(", ")}.`}`}
    >
      {cells
        .map((filled, index) => ({ filled, index }))
        .map(({ filled, index }) => (
          <span
            key={index}
            className={`flex size-11 items-center justify-center border-2 ${filled ? "border-tinta bg-emerald-100 text-emerald-950" : "border-dashed border-slate-300"}`}
          >
            {filled ? "■" : ""}
          </span>
        ))}
    </div>
  );
}
function ObliqueSection({ state, hideResults }: { state: SolidState; hideResults?: boolean }) {
  const scale = Math.min(
    230 / (state.width + state.depth),
    190 / (state.height + (state.width + state.depth) / 2),
  );
  const angle = (state.rotation * Math.PI) / 2;
  const project = (point: { x: number; y: number; z: number }) => {
    const x = point.x - state.width / 2;
    const y = point.y - state.depth / 2;
    const a = x * Math.cos(angle) - y * Math.sin(angle);
    const b = x * Math.sin(angle) + y * Math.cos(angle);
    return { x: 160 + (a - b) * scale, y: 195 - point.z * scale + ((a + b) * scale) / 2 };
  };
  const vertices = Array.from({ length: 8 }, (_, mask) => ({
    id: mask,
    ...project({
      x: mask & 1 ? state.width : 0,
      y: mask & 2 ? state.depth : 0,
      z: mask & 4 ? state.height : 0,
    }),
  }));
  const section = cuboidSection(state).map(project);
  return (
    <svg
      viewBox="0 0 320 280"
      className="mx-auto w-full max-w-md"
      role="img"
      aria-label={
        hideResults
          ? `Bloco ${state.width} por ${state.depth} por ${state.height} cm. Plano de direção (${state.normalX}, ${state.normalY}, ${state.normalZ}) na posição ${state.cut}%.`
          : `Corte oblíquo do bloco. ${section.length >= 3 ? `A seção possui ${section.length} lados.` : "O plano apenas toca o bloco, sem formar um polígono."}`
      }
    >
      {vertices.flatMap((from) =>
        [1, 2, 4]
          .filter((bit) => !(from.id & bit))
          .map((bit) => {
            const to = vertices[from.id | bit];
            return to ? (
              <line
                key={`${from.id}-${to.id}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#172e2a"
                strokeWidth={2}
              />
            ) : null;
          }),
      )}
      {section.length >= 3 && (
        <polygon
          points={section.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="#ffe19b"
          fillOpacity={0.85}
          stroke="#994711"
          strokeWidth={3}
        />
      )}
      {section.map((point) => (
        <circle key={`${point.x},${point.y}`} cx={point.x} cy={point.y} r={4} fill="#994711" />
      ))}
      <text x="160" y="270" textAnchor="middle" fontSize="12">
        O contorno marcado pertence ao plano de corte.
      </text>
    </svg>
  );
}
function PolyhedronPicture({
  state,
  geometry,
  cutting,
  diagonal,
  coordinates,
  basic,
}: {
  state: SolidState;
  geometry: NonNullable<ReturnType<typeof polyhedronGeometry>>;
  cutting: boolean;
  diagonal: boolean;
  coordinates: boolean;
  basic: boolean;
}) {
  const angle = (state.rotation * Math.PI) / 2;
  const project = (point: { x: number; y: number; z: number }) => {
    const x = point.x * Math.cos(angle) - point.y * Math.sin(angle);
    const y = point.x * Math.sin(angle) + point.y * Math.cos(angle);
    return { x: x - y, y: (x + y) / 2 - point.z };
  };
  const projected = geometry.vertices.map(project);
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const scale = Math.min(250 / (maxX - minX), 180 / (maxY - minY));
  const screen = (point: { x: number; y: number }) => ({
    x: 160 + (point.x - (minX + maxX) / 2) * scale,
    y: 115 + (point.y - (minY + maxY) / 2) * scale,
  });
  const points = projected.map(screen);
  const section = geometry.section.map((point) => screen(project(point)));
  const dimensions =
    state.shape === "tetraedro"
      ? `Todas as arestas medem ${state.width} cm.`
      : `${state.shape === "prisma-triangular" ? "Catetos da base" : "Base"}: ${state.width} e ${state.depth} cm; altura: ${state.height} cm.`;
  const first = points[0];
  const opposite = points[6];
  const spacePoint = screen(project({ x: state.spaceX, y: state.spaceY, z: state.spaceZ }));
  return (
    <svg
      viewBox="0 0 320 270"
      className="mx-auto w-full max-w-sm"
      role="img"
      aria-label={`${solidNames[state.shape]}. ${basic ? basicSurfaceDescriptions[state.shape] : dimensions}${cutting ? ` Seção paralela à base na posição ${state.cut}%.` : ""}${coordinates ? ` Origem O no vértice (0, 0, 0); ponto P (${state.spaceX}, ${state.spaceY}, ${state.spaceZ}) cm.` : ""}`}
    >
      {geometry.faces.map((face) => (
        <polygon
          key={face.join("-")}
          points={face
            .map((index) => {
              const point = points[index];
              return point ? `${point.x},${point.y}` : "";
            })
            .join(" ")}
          fill="#c8e6d4"
          fillOpacity={0.3}
          stroke="#172e2a"
          strokeWidth={2}
        />
      ))}
      {cutting && (
        <polygon
          points={section.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="#ffe19b"
          fillOpacity={0.85}
          stroke="#994711"
          strokeWidth={3}
        />
      )}
      {diagonal && first && opposite && (
        <line
          x1={first.x}
          y1={first.y}
          x2={opposite.x}
          y2={opposite.y}
          stroke="#994711"
          strokeWidth={3}
          strokeDasharray="5 3"
        />
      )}
      {coordinates && first && (
        <g>
          {[
            { label: "x", x: state.width, y: 0, z: 0 },
            { label: "y", x: 0, y: state.depth, z: 0 },
            { label: "z", x: 0, y: 0, z: state.height },
          ].map((axis) => {
            const end = screen(project(axis));
            return (
              <g key={axis.label}>
                <line
                  x1={first.x}
                  y1={first.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#994711"
                  strokeWidth={3}
                />
                <text x={end.x + 5} y={end.y - 6} fontWeight="bold" fontSize={14}>
                  {axis.label}
                </text>
              </g>
            );
          })}
          <text x={first.x - 12} y={first.y + 14} fontSize={14}>
            O
          </text>
          <circle cx={spacePoint.x} cy={spacePoint.y} r={5} fill="#994711" stroke="white" />
          <text x={spacePoint.x + 8} y={spacePoint.y - 8} fontWeight="bold" fontSize={14}>
            P
          </text>
        </g>
      )}
      {!basic && (
        <text x="160" y="242" textAnchor="middle" fontSize={11}>
          {dimensions}
        </text>
      )}
      <text x="160" y="260" textAnchor="middle" fontSize={11}>
        {basic ? "Girar não muda as partes do sólido." : "A rotação conserva todas as medidas."}
      </text>
    </svg>
  );
}
function SolidPicture({
  state,
  cutting = false,
  diagonal = false,
  coordinates = false,
  basic = false,
}: {
  state: SolidState;
  cutting?: boolean;
  diagonal?: boolean;
  coordinates?: boolean;
  basic?: boolean;
}) {
  const geometry = polyhedronGeometry(state);
  if (geometry)
    return (
      <PolyhedronPicture
        state={state}
        geometry={geometry}
        cutting={cutting}
        diagonal={diagonal}
        coordinates={coordinates}
        basic={basic}
      />
    );
  const h = state.height * 10;
  const r = state.radius * 10;
  const fraction = state.cut / 100;
  return (
    <svg
      viewBox="0 0 320 280"
      className="mx-auto w-full max-w-sm"
      role="img"
      aria-label={
        basic
          ? `${solidNames[state.shape]}. ${basicSurfaceDescriptions[state.shape]}`
          : `${solidNames[state.shape]}. Raio ${state.radius} cm${state.shape === "esfera" ? `; diâmetro ${state.radius * 2} cm` : `; altura ${state.height} cm`}.${cutting ? ` Plano de corte em ${state.cut}%.` : ""}`
      }
    >
      {state.shape === "esfera" ? (
        <>
          <circle cx="160" cy="135" r={r} fill="#d3efdc" stroke="#172e2a" strokeWidth="2" />
          <ellipse
            cx="160"
            cy="135"
            rx={r}
            ry={r / 3}
            fill="none"
            stroke="#176344"
            strokeDasharray="4 3"
          />
          {cutting && (
            <ellipse
              cx="160"
              cy={135 - fraction * r}
              rx={r * Math.sqrt(1 - fraction ** 2)}
              ry={(r * Math.sqrt(1 - fraction ** 2)) / 4}
              fill="#ffe19b"
              stroke="#994711"
              strokeWidth="2"
            />
          )}
          {!basic && (
            <>
              <line x1="160" y1="135" x2={160 + r} y2="135" stroke="#172e2a" />
              <text x="162" y="128" fontSize="12">
                r={state.radius}
              </text>
            </>
          )}
        </>
      ) : state.shape === "cilindro" || state.shape === "cone" ? (
        <>
          <path
            d={
              state.shape === "cilindro"
                ? `M ${160 - r} ${220 - h} V 220 A ${r} ${r / 3} 0 0 0 ${160 + r} 220 V ${220 - h} Z`
                : `M 160 ${220 - h} L ${160 - r} 220 A ${r} ${r / 3} 0 0 0 ${160 + r} 220 Z`
            }
            fill="#d3efdc"
            stroke="#172e2a"
            strokeWidth="2"
          />
          <ellipse
            cx="160"
            cy="220"
            rx={r}
            ry={r / 3}
            fill="none"
            stroke="#172e2a"
            strokeDasharray="4 3"
          />
          {state.shape === "cilindro" && (
            <ellipse
              cx="160"
              cy={220 - h}
              rx={r}
              ry={r / 3}
              fill="#e8f7ed"
              stroke="#172e2a"
              strokeWidth="2"
            />
          )}
          {cutting && (
            <ellipse
              cx="160"
              cy={state.shape === "cone" ? 220 - h + h * fraction : 220 - h * fraction}
              rx={state.shape === "cone" ? r * fraction : r}
              ry={(state.shape === "cone" ? r * fraction : r) / 3}
              fill="#ffe19b"
              stroke="#994711"
              strokeWidth="2"
            />
          )}
          {!basic && (
            <>
              <text x={165 + r} y={220 - h / 2} fontSize="12">
                h={state.height}
              </text>
              <text x="150" y="253" fontSize="12">
                r={state.radius}
              </text>
            </>
          )}
        </>
      ) : null}
    </svg>
  );
}
function Net({ state }: { state: SolidState }) {
  const scale = 5;
  const w = state.width * scale;
  const d = state.depth * scale;
  const h = state.height * scale;
  const r = state.radius * scale;
  const rect = (x: number, y: number, width: number, height: number, label: string) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={width} height={height} fill="#d3efdc" stroke="#172e2a" />
      <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fontSize="10">
        {label}
      </text>
    </g>
  );
  if (state.shape === "esfera")
    return (
      <div className={panelClass}>
        <p>
          Uma esfera não pode ser aberta no plano preservando todos os comprimentos e áreas sem
          deformação.
        </p>
        <p className="mt-2">
          A área da superfície é 4πr². Fatias desenhadas em um mapa não são uma planificação exata.
        </p>
      </div>
    );
  if (state.shape === "bloco")
    return (
      <svg
        viewBox="0 0 320 240"
        className="w-full"
        role="img"
        aria-label="Planificação: quatro retângulos em faixa, com as bases acima e abaixo da segunda face."
      >
        {rect(10, 20 + d, d, h, "lateral")}
        {rect(10 + d, 20 + d, w, h, "frente")}
        {rect(10 + d + w, 20 + d, d, h, "lateral")}
        {rect(10 + 2 * d + w, 20 + d, w, h, "trás")}
        {rect(10 + d, 20, w, d, "base")}
        {rect(10 + d, 20 + d + h, w, d, "base")}
        <text x="10" y="230" fontSize="12">
          2 × ({state.width}×{state.depth} + {state.width}×{state.height} + {state.depth}×
          {state.height}) cm²
        </text>
      </svg>
    );
  if (state.shape === "cilindro")
    return (
      <svg
        viewBox="0 0 320 260"
        className="w-full"
        role="img"
        aria-label={`Planificação do cilindro: retângulo de largura 2π vezes ${state.radius} e altura ${state.height}, com dois círculos de raio ${state.radius}.`}
      >
        {rect(20, 25 + 2 * r, 2 * Math.PI * r, h, "retângulo lateral")}
        <circle cx={20 + r} cy={25 + r} r={r} fill="#eac68d" stroke="#172e2a" />
        <circle cx={20 + r} cy={25 + 3 * r + h} r={r} fill="#eac68d" stroke="#172e2a" />
        <text x="20" y="245" fontSize="12">
          Lateral: 2πrh. Duas bases: 2πr².
        </text>
      </svg>
    );
  if (state.shape === "cone") {
    const slant = Math.hypot(state.radius, state.height);
    const radius = slant * 5;
    const angle = (2 * Math.PI * state.radius) / slant;
    const end = { x: 150 + Math.cos(angle) * radius, y: 105 + Math.sin(angle) * radius };
    return (
      <svg
        viewBox="0 0 320 250"
        className="w-full"
        role="img"
        aria-label={`Planificação do cone: setor de raio ${format(slant)} e ângulo ${format((angle * 180) / Math.PI)} graus, mais um círculo de raio ${state.radius}.`}
      >
        <path
          d={`M 150 105 L ${150 + radius} 105 A ${radius} ${radius} 0 ${angle > Math.PI ? 1 : 0} 1 ${end.x} ${end.y} Z`}
          fill="#d3efdc"
          stroke="#172e2a"
        />
        <circle cx="55" cy="175" r={r} fill="#eac68d" stroke="#172e2a" />
        <text x="20" y="225" fontSize="12">
          Setor lateral: πr × geratriz. Base: πr².
        </text>
        <text x="20" y="244" fontSize="11">
          Geratriz = √(r² + h²) = {format(slant)} cm.
        </text>
      </svg>
    );
  }
  if (state.shape === "piramide") {
    const sx = Math.hypot(state.height, state.depth / 2) * scale;
    const sy = Math.hypot(state.height, state.width / 2) * scale;
    const x = 160 - w / 2;
    const y = 120 - d / 2;
    return (
      <svg
        viewBox="0 0 320 260"
        className="w-full"
        role="img"
        aria-label="Planificação da pirâmide reta: base retangular e quatro triângulos ligados aos lados da base."
      >
        {rect(x, y, w, d, "base")}
        {[
          `${x},${y} ${x + w},${y} ${x + w / 2},${y - sx}`,
          `${x},${y + d} ${x + w},${y + d} ${x + w / 2},${y + d + sx}`,
          `${x},${y} ${x},${y + d} ${x - sy},${y + d / 2}`,
          `${x + w},${y} ${x + w},${y + d} ${x + w + sy},${y + d / 2}`,
        ].map((points) => (
          <polygon key={points} points={points} fill="#eac68d" stroke="#172e2a" />
        ))}
        <text x="20" y="248" fontSize="11">
          As alturas das faces triangulares são inclinadas; não são a altura vertical.
        </text>
      </svg>
    );
  }
  if (state.shape === "tetraedro") {
    const edge = state.width * 7;
    const altitude = (edge * Math.sqrt(3)) / 2;
    const x = 160 - edge / 2;
    const y = 80;
    return (
      <svg
        viewBox="0 0 320 250"
        className="w-full"
        role="img"
        aria-label="Planificação do tetraedro regular: quatro triângulos equiláteros congruentes."
      >
        {[
          `${x},${y} ${x + edge},${y} ${x + edge / 2},${y + altitude}`,
          `${x},${y} ${x + edge},${y} ${x + edge / 2},${y - altitude}`,
          `${x},${y} ${x + edge / 2},${y + altitude} ${x - edge / 2},${y + altitude}`,
          `${x + edge},${y} ${x + edge / 2},${y + altitude} ${x + edge * 1.5},${y + altitude}`,
        ].map((points) => (
          <polygon key={points} points={points} fill="#d3efdc" stroke="#172e2a" />
        ))}
        <text x="20" y="235" fontSize="12">
          4 triângulos de lado {state.width} cm.
        </text>
      </svg>
    );
  }
  const diagonal = Math.hypot(w, d);
  return (
    <svg
      viewBox="0 0 320 250"
      className="w-full"
      role="img"
      aria-label="Planificação do prisma triangular retângulo: três retângulos laterais e duas bases triangulares congruentes."
    >
      {rect(10, 25 + d, w, h, "lateral A")}
      {rect(10 + w, 25 + d, d, h, "lateral B")}
      {rect(10 + w + d, 25 + d, diagonal, h, "lateral C")}
      <polygon points={`10,${25 + d} ${10 + w},${25 + d} 10,25`} fill="#eac68d" stroke="#172e2a" />
      <polygon
        points={`10,${25 + d + h} ${10 + w},${25 + d + h} 10,${25 + 2 * d + h}`}
        fill="#eac68d"
        stroke="#172e2a"
      />
      <text x="10" y="240" fontSize="12">
        Bases: catetos {state.width} e {state.depth}; lado C ={" "}
        {format(Math.hypot(state.width, state.depth))} cm.
      </text>
    </svg>
  );
}
export function SolidsTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseSolid(launch, raw);
  const kind = solidDefinition(launch).kind;
  const stacks = kind === "cubes" || kind === "view";
  const update = (changes: Partial<SolidState>) =>
    onChange(parseSolid(launch, { ...state, ...changes }));
  const shapes = solidShapeSchema.options.filter((shape) =>
    kind === "euler"
      ? polyhedronCounts(shape) !== null
      : kind === "diagonal" || kind === "packing" || kind === "oblique"
        ? shape === "bloco"
        : true,
  );
  const curved = ["cilindro", "cone", "esfera"].includes(state.shape);
  return (
    <div className="space-y-4">
      {stacks ? (
        <>
          <p className="text-sm">
            Toque numa casa do chão para acrescentar um cubo à pilha. Depois de quatro cubos, a casa
            fica vazia novamente. O número mostra a altura.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mx-auto grid w-44 grid-cols-3 gap-2">
                {state.stacks
                  .map((height, index) => ({ height, index }))
                  .map(({ height, index }) => (
                    <button
                      type="button"
                      key={index}
                      className={buttonClass}
                      aria-label={`Pilha na linha ${Math.floor(index / 3) + 1}, coluna ${(index % 3) + 1}: ${height} cubos. Acrescentar um; depois de quatro, esvaziar.`}
                      onClick={() =>
                        update({
                          stacks: state.stacks.map((value, position) =>
                            position === index ? (value + 1) % 5 : value,
                          ),
                        })
                      }
                    >
                      {height}
                    </button>
                  ))}
              </div>
              <p className="mt-2 text-center text-sm">Alturas das pilhas vistas de cima</p>
            </div>
            <Stacks state={state} hideResults={hideResults} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Options
              label="Vista para observar"
              value={state.view}
              options={[
                { value: "frente", label: "Frente" },
                { value: "lado", label: "Lado" },
                { value: "cima", label: "Cima" },
              ]}
              onChange={(view) =>
                update({ view: view === "frente" ? "frente" : view === "lado" ? "lado" : "cima" })
              }
            />
            <button
              type="button"
              className={buttonClass}
              onClick={() => update({ rotation: (state.rotation + 1) % 4 })}
            >
              Girar um quarto de volta
            </button>
          </div>
          <Projection state={state} hideResults={hideResults} />
        </>
      ) : (
        <>
          <Options
            label="Sólido"
            value={state.shape}
            options={shapes.map((shape) => ({ value: shape, label: solidNames[shape] }))}
            onChange={(shape) => update({ shape: solidShapeSchema.parse(shape) })}
          />
          {kind !== "basic" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {curved ? (
                <NumberControl
                  label="Raio em cm"
                  value={state.radius}
                  min={1}
                  max={6}
                  onChange={(radius) => update({ radius })}
                />
              ) : (
                <>
                  <NumberControl
                    label={state.shape === "tetraedro" ? "Aresta em cm" : "Largura da base em cm"}
                    value={state.width}
                    min={1}
                    max={12}
                    onChange={(width) => update({ width, spaceX: Math.min(state.spaceX, width) })}
                  />
                  {state.shape !== "tetraedro" && (
                    <NumberControl
                      label="Profundidade da base em cm"
                      value={state.depth}
                      min={1}
                      max={12}
                      onChange={(depth) => update({ depth, spaceY: Math.min(state.spaceY, depth) })}
                    />
                  )}
                </>
              )}{" "}
              {!["esfera", "tetraedro"].includes(state.shape) && (
                <NumberControl
                  label="Altura do sólido em cm"
                  value={state.height}
                  min={1}
                  max={12}
                  onChange={(height) => update({ height, spaceZ: Math.min(state.spaceZ, height) })}
                />
              )}{" "}
              {(kind === "cut" || kind === "oblique") && (
                <NumberControl
                  label="Posição do corte em %"
                  value={state.cut}
                  min={0}
                  max={100}
                  onChange={(cut) => update({ cut })}
                />
              )}{" "}
              {kind === "oblique" && (
                <>
                  <NumberControl
                    label="Direção horizontal x do plano"
                    value={state.normalX}
                    min={state.normalY + state.normalZ === 0 ? 1 : 0}
                    max={3}
                    onChange={(normalX) => update({ normalX })}
                  />
                  <NumberControl
                    label="Direção horizontal y do plano"
                    value={state.normalY}
                    min={state.normalX + state.normalZ === 0 ? 1 : 0}
                    max={3}
                    onChange={(normalY) => update({ normalY })}
                  />
                  <NumberControl
                    label="Direção vertical z do plano"
                    value={state.normalZ}
                    min={state.normalX + state.normalY === 0 ? 1 : 0}
                    max={3}
                    onChange={(normalZ) => update({ normalZ })}
                  />
                </>
              )}
              {kind === "packing" && (
                <>
                  <NumberControl
                    label="Coordenada x de P em cm"
                    value={state.spaceX}
                    min={0}
                    max={state.width}
                    onChange={(spaceX) => update({ spaceX })}
                  />
                  <NumberControl
                    label="Coordenada y de P em cm"
                    value={state.spaceY}
                    min={0}
                    max={state.depth}
                    onChange={(spaceY) => update({ spaceY })}
                  />
                  <NumberControl
                    label="Coordenada z de P em cm"
                    value={state.spaceZ}
                    min={0}
                    max={state.height}
                    onChange={(spaceZ) => update({ spaceZ })}
                  />
                  <NumberControl
                    label="Aresta de cada caixa cúbica em cm"
                    value={state.packing}
                    min={1}
                    max={6}
                    onChange={(packing) => update({ packing })}
                  />
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => update({ rotation: (state.rotation + 1) % 4 })}
            >
              Girar a vista
            </button>
            {kind === "surface" && (
              <button
                type="button"
                className={buttonClass}
                aria-pressed={state.unfolded}
                onClick={() => update({ unfolded: !state.unfolded })}
              >
                {state.unfolded ? "Ver sólido montado" : "Abrir a superfície"}
              </button>
            )}
          </div>
          {kind === "oblique" ? (
            <ObliqueSection state={state} hideResults={hideResults} />
          ) : kind === "surface" && state.unfolded ? (
            <Net state={state} />
          ) : (
            <SolidPicture
              state={state}
              cutting={kind === "cut"}
              diagonal={kind === "diagonal"}
              coordinates={kind === "packing"}
              basic={kind === "basic"}
            />
          )}{" "}
          {kind === "euler" && !hideResults && (
            <div className={panelClass}>
              <p>
                Vértices: {polyhedronCounts(state.shape)?.vertices}; arestas:{" "}
                {polyhedronCounts(state.shape)?.edges}; faces:{" "}
                {polyhedronCounts(state.shape)?.faces}.
              </p>
              <p className="mt-2 text-sm">
                Use V − A + F. Cilindros, cones e esferas não pertencem ao conjunto de poliedros
                deste roteiro.
              </p>
            </div>
          )}{" "}
          {kind === "volume" && (
            <div className={panelClass}>
              <p>
                1 cm³ corresponde a 1 mL. O volume mede o espaço interno; a área da superfície mede
                o material que reveste o sólido.
              </p>
              <p className="mt-2 text-sm">
                Bloco: largura × profundidade × altura. Cilindro: πr²h. Cone: πr²h/3. Pirâmide: área
                da base × altura/3. Esfera: 4πr³/3.
              </p>
            </div>
          )}
        </>
      )}
      {!hideResults && <Output>{solidSummary(launch, state)}</Output>}
    </div>
  );
}

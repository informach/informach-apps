"use client";
import { useId } from "react";
import type { ItemFigureData } from "@/features/content/figures";

const format = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export function ItemFigure({ figure }: { figure?: ItemFigureData }) {
  const id = useId();
  if (!figure) return null;
  const styles = ["", "8 5", "2 4"];
  return (
    <figure className="my-5 rounded-card border-2 border-sombra bg-creme p-3 text-tinta">
      <figcaption className="font-semibold">{figure.title}</figcaption>
      {figure.kind === "graph" ? (
        (() => {
          const px = (x: number) => 50 + ((x - figure.x.min) * 390) / (figure.x.max - figure.x.min);
          const py = (y: number) =>
            260 - ((y - figure.y.min) * 230) / (figure.y.max - figure.y.min);
          const ticks = (a: typeof figure.x) =>
            Array.from(
              { length: Math.floor((a.max - a.min) / a.step) + 1 },
              (_, i) => a.min + i * a.step,
            );
          return (
            <>
              <svg
                viewBox="0 0 480 300"
                role="img"
                aria-labelledby={`${id}-title ${id}-desc`}
                className="w-full rounded-lg bg-white"
                style={{ color: "#1c2840" }}
              >
                <title id={`${id}-title`}>{figure.title}</title>
                <desc id={`${id}-desc`}>{figure.description}</desc>
                {ticks(figure.x).map((x) => (
                  <g key={x}>
                    <path d={`M ${px(x)} 30 V 260`} stroke="#c7ccd4" />
                    <text x={px(x)} y="280" fontSize="13" textAnchor="middle" fill="currentColor">
                      {format(x)}
                    </text>
                  </g>
                ))}
                {ticks(figure.y).map((y) => (
                  <g key={y}>
                    <path d={`M 50 ${py(y)} H 440`} stroke="#c7ccd4" />
                    <text x="42" y={py(y) + 4} fontSize="13" textAnchor="end" fill="currentColor">
                      {format(y)}
                    </text>
                  </g>
                ))}
                <path
                  d={`M 50 ${py(Math.max(figure.y.min, Math.min(0, figure.y.max)))} H 440 M ${px(Math.max(figure.x.min, Math.min(0, figure.x.max)))} 30 V 260`}
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <text x="462" y="280" textAnchor="middle" fill="currentColor">
                  {figure.x.label}
                </text>
                <text x="26" y="20" fill="currentColor">
                  {figure.y.label}
                </text>
                {figure.series.map((s, i) => (
                  <polyline
                    key={s.label}
                    points={s.points.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}
                    fill="none"
                    stroke={i === 0 ? "#174f84" : "#872f64"}
                    strokeWidth="3"
                    strokeDasharray={styles[i]}
                  />
                ))}
              </svg>
              <p className="text-sm">
                {figure.series
                  .map(
                    (s, i) =>
                      `${s.label}: ${i === 0 ? "linha contínua" : i === 1 ? "linha tracejada" : "linha pontilhada"}`,
                  )
                  .join(" · ")}
              </p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Ler descrição e tabela do gráfico
                </summary>
                <p className="my-2">{figure.description}</p>
                <div className="flex flex-wrap gap-6">
                  {figure.series.map((s) => (
                    <table key={s.label} className="border-collapse text-left">
                      <caption className="font-semibold">Série {s.label}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="pr-6">
                            {figure.x.label}
                          </th>
                          <th scope="col">{figure.y.label}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.points.map(([x, y]) => (
                          <tr key={`${x},${y}`}>
                            <td className="pr-6">{format(x)}</td>
                            <td>{format(y)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
                </div>
              </details>
            </>
          );
        })()
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {figure.nets.map((net) => (
              <div key={net.label}>
                <p className="font-semibold">Arranjo {net.label}</p>
                <svg
                  viewBox={`0 0 200 ${Math.max(150, 50 + 30 * Math.max(...net.cells.map(([, y]) => y)))}`}
                  role="img"
                  aria-label={`Arranjo ${net.label}; coordenadas na descrição abaixo`}
                  className="w-full max-w-64 rounded-lg bg-white"
                >
                  {net.cells.map(([x, y]) => (
                    <rect
                      key={`${x},${y}`}
                      x={10 + 30 * x}
                      y={10 + 30 * y}
                      width="30"
                      height="30"
                      fill="#e4eef8"
                      stroke="#1c2840"
                      strokeWidth="2"
                    />
                  ))}
                </svg>
              </div>
            ))}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Ler os arranjos em texto</summary>
            <p>
              {figure.description} As posições (coluna, linha) começam em (0, 0), no canto superior
              esquerdo; colunas crescem para a direita e linhas para baixo.
            </p>
            {figure.nets.map((net) => (
              <p key={net.label} className="mt-2">
                {net.label}: {net.cells.map((c) => `(${c.join(", ")})`).join("; ")}.
              </p>
            ))}
          </details>
        </>
      )}
    </figure>
  );
}

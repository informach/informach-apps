import { z } from "zod";

const axis = z
  .object({
    label: z.string().min(1),
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().finite().positive(),
  })
  .refine((a) => a.min < a.max && (a.max - a.min) / a.step <= 30, "Invalid axis range");
const point = z.tuple([z.number().finite(), z.number().finite()]);
export const figureSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("graph"),
      title: z.string().min(1),
      description: z.string().min(1),
      x: axis,
      y: axis,
      series: z
        .array(z.object({ label: z.string().min(1), points: z.array(point).min(2).max(81) }))
        .min(1)
        .max(3),
    }),
    z.object({
      kind: z.literal("nets"),
      title: z.string().min(1),
      description: z.string().min(1),
      nets: z
        .array(
          z.object({
            label: z.string().min(1),
            cells: z
              .array(z.tuple([z.number().int().min(0).max(5), z.number().int().min(0).max(5)]))
              .length(6)
              .refine(
                (cells) => new Set(cells.map((c) => c.join(","))).size === 6,
                "Duplicate cell",
              ),
          }),
        )
        .min(2)
        .max(3),
    }),
  ])
  .superRefine((figure, ctx) => {
    if (
      figure.kind === "graph" &&
      figure.series.some((s) =>
        s.points.some(
          ([x, y]) => x < figure.x.min || x > figure.x.max || y < figure.y.min || y > figure.y.max,
        ),
      )
    )
      ctx.addIssue({ code: "custom", message: "Point outside graph" });
  });
export type ItemFigureData = z.infer<typeof figureSchema>;

function graph(
  title: string,
  x: [number, number],
  y: [number, number],
  series: { label: string; points: [number, number][] }[],
): ItemFigureData {
  return {
    kind: "graph",
    title,
    description:
      "Eixo x horizontal e eixo y vertical. A linha contínua representa a primeira série; a tracejada, quando presente, representa a segunda. A tabela apresenta as coordenadas desenhadas.",
    x: { label: "x", min: x[0], max: x[1], step: 1 },
    y: { label: "y", min: y[0], max: y[1], step: 1 },
    series,
  };
}
const points = (
  start: number,
  end: number,
  step: number,
  f: (x: number) => number,
): [number, number][] =>
  Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => {
    const x = start + i * step;
    return [x, f(x)];
  });
export const functionGraphs = [
  graph(
    "Compare f e g",
    [-3, 3],
    [-1, 7],
    [
      { label: "f", points: points(-3, 3, 1, Math.abs) },
      { label: "g", points: points(-3, 3, 1, (x) => Math.abs(x) + 3) },
    ],
  ),
  graph("Uma reta", [-1, 3], [-2, 6], [{ label: "f", points: points(-1, 3, 1, (x) => 4 - 2 * x) }]),
  graph(
    "Sinal da função",
    [-2, 4],
    [-3, 3],
    [{ label: "f", points: points(-2, 4, 1, (x) => 1 - x) }],
  ),
  graph(
    "Compare os vértices de f e g",
    [-2, 4],
    [-1, 5],
    [
      { label: "f", points: points(-2, 4, 1, Math.abs) },
      { label: "g", points: points(-2, 4, 1, (x) => Math.abs(x - 2)) },
    ],
  ),
  graph(
    "Interseções com o eixo x",
    [-3, 3],
    [-4, 5],
    [{ label: "f", points: points(-3, 3, 0.25, (x) => x * x - 4) }],
  ),
  graph(
    "Compare as ordenadas de f e g",
    [-2, 2],
    [-3, 3],
    [
      { label: "f", points: points(-2, 2, 1, (x) => x + 1) },
      { label: "g", points: points(-2, 2, 1, (x) => -x - 1) },
    ],
  ),
  graph(
    "Uma parábola simétrica",
    [0, 4],
    [-1, 4],
    [{ label: "f", points: points(0, 4, 0.25, (x) => (x - 2) ** 2 - 1) }],
  ),
  graph(
    "Encontro das retas",
    [0, 4],
    [0, 4],
    [
      { label: "f", points: points(0, 4, 1, (x) => x) },
      { label: "g", points: points(0, 4, 1, (x) => 4 - x) },
    ],
  ),
] satisfies ItemFigureData[];

export const cubeNets: ItemFigureData = {
  kind: "nets",
  title: "Três arranjos de seis quadrados",
  description:
    "Todos os quadrados têm o mesmo tamanho e são ligados por lados inteiros. As linhas internas são dobras. Compare os arranjos A, B e C.",
  nets: [
    {
      label: "A",
      cells: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
        [1, 3],
      ],
    },
    {
      label: "B",
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
    {
      label: "C",
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [5, 0],
      ],
    },
  ],
};

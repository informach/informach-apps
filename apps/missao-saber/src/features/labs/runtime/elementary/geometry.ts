import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assessNumber, requireMode } from "./math";

export type Point = { x: number; y: number };
export function polygonArea(points: Point[]): number {
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return next ? sum + point.x * next.y - point.y * next.x : sum;
      }, 0),
    ) / 2
  );
}
export function cellMeasures(
  cells: boolean[],
  columns = 6,
): { area: number; perimeter: number; dark: number; light: number; shared: number } {
  if (columns < 1 || cells.length % columns !== 0)
    throw new Error("A malha precisa ter linhas completas.");
  let area = 0;
  let perimeter = 0;
  let dark = 0;
  let light = 0;
  cells.forEach((occupied, index) => {
    if (!occupied) return;
    area++;
    const col = index % columns;
    const row = Math.floor(index / columns);
    if ((row + col) % 2 === 0) dark++;
    else light++;
    if (row === 0 || !cells[index - columns]) perimeter++;
    if (index + columns >= cells.length || !cells[index + columns]) perimeter++;
    if (col === 0 || !cells[index - 1]) perimeter++;
    if (col === columns - 1 || !cells[index + 1]) perimeter++;
  });
  return { area, perimeter, dark, light, shared: (4 * area - perimeter) / 2 };
}
export function triminoCells(row: number, column: number, turn: number): boolean[] {
  const missing = [
    [1, 1],
    [0, 1],
    [0, 0],
    [1, 0],
  ][turn];
  if (!missing || row < 0 || row > 4 || column < 0 || column > 4)
    throw new Error("A peça deve caber na malha.");
  return Array.from({ length: 36 }, (_, index) => {
    const localRow = Math.floor(index / 6) - row;
    const localColumn = (index % 6) - column;
    return (
      localRow >= 0 &&
      localRow <= 1 &&
      localColumn >= 0 &&
      localColumn <= 1 &&
      !(localRow === missing[0] && localColumn === missing[1])
    );
  });
}
export function squaresBySize(cells: boolean[], columns = 6): number[] {
  if (columns < 1 || cells.length % columns !== 0)
    throw new Error("A malha precisa ter linhas completas.");
  const rows = cells.length / columns;
  return Array.from({ length: Math.min(columns, rows) }, (_, offset) => {
    const size = offset + 1;
    let count = 0;
    for (let row = 0; row + size <= rows; row++)
      for (let col = 0; col + size <= columns; col++) {
        let full = true;
        for (let dy = 0; dy < size; dy++)
          for (let dx = 0; dx < size; dx++)
            if (!cells[(row + dy) * columns + col + dx]) full = false;
        if (full) count++;
      }
    return count;
  });
}
export function tileDeficientBoard(power: number, missing: Point): Point[][] {
  if (!Number.isInteger(power) || power < 1 || power > 3)
    throw new Error("Use potências de 1 a 3 nesta montagem.");
  const size = 2 ** power;
  if (
    !Number.isInteger(missing.x) ||
    !Number.isInteger(missing.y) ||
    missing.x < 0 ||
    missing.y < 0 ||
    missing.x >= size ||
    missing.y >= size
  )
    throw new Error("A casa removida precisa pertencer ao tabuleiro.");
  const tiles: Point[][] = [];
  function cover(x: number, y: number, width: number, hole: Point) {
    if (width === 1) return;
    const half = width / 2;
    const quadrant = (hole.y >= y + half ? 2 : 0) + (hole.x >= x + half ? 1 : 0);
    const centers = [
      { x: x + half - 1, y: y + half - 1 },
      { x: x + half, y: y + half - 1 },
      { x: x + half - 1, y: y + half },
      { x: x + half, y: y + half },
    ];
    tiles.push(centers.filter((_, index) => index !== quadrant));
    centers.forEach((center, index) => {
      cover(
        x + (index % 2) * half,
        y + Math.floor(index / 2) * half,
        half,
        index === quadrant ? hole : center,
      );
    });
  }
  cover(0, 0, size, missing);
  return tiles;
}
const pointSchema = z
  .object({ x: z.number().int().min(0).max(6), y: z.number().int().min(0).max(6) })
  .strict();
export const geometrySchema = z
  .object({
    cells: z.array(z.boolean()).length(36),
    side: z.number().int().min(1).max(4),
    shape: z.enum(["triangulo", "quadrado", "pentagono", "hexagono"]),
    points: z.array(pointSchema).length(3),
    pieceRow: z.number().int().min(0).max(4).default(0),
    pieceColumn: z.number().int().min(0).max(4).default(0),
    pieceTurn: z.number().int().min(0).max(3).default(0),
    tilingPower: z.number().int().min(1).max(3).default(2),
    missingRow: z.number().int().min(0).max(7).default(0),
    missingColumn: z.number().int().min(0).max(7).default(0),
    tilingStep: z.number().int().min(0).max(21).default(0),
  })
  .strict()
  .refine(
    (state) => polygonArea(state.points) > 0,
    "Os três pontos precisam formar um triângulo, sem ficar na mesma reta.",
  );
export type GeometryState = z.infer<typeof geometrySchema>;
type Kind =
  | "area"
  | "perimeter"
  | "shared"
  | "units"
  | "color"
  | "polygon"
  | "shape"
  | "trimino"
  | "squares"
  | "tiling";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const geometryCases: Record<string, Definition> = {
  "cobertura-por-triminos": {
    title: "Um buraco e quatro tabuleiros menores",
    kind: "tiling",
    prompt:
      "Escolha um tabuleiro de lado 2, 4 ou 8 e remova uma casa. Construa a cobertura com peças L: a primeira peça deixa um buraco em cada um dos quatro quadrantes. Repita a ideia nos quadrantes. Complete a montagem e diga quantas peças foram usadas. Os exemplos apoiam a conjectura; a prova por indução exige justificar o passo para qualquer tamanho 2^n.",
    label: "Quantidade de peças L na cobertura",
  },
  "contar-quadrados": {
    title: "Os quadrados dentro do quadrado",
    kind: "squares",
    prompt:
      "Monte uma região preenchida na malha. Conte todos os quadrados que ela contém, de todos os tamanhos, com lados sobre as linhas da malha. Um quadrado de lado 2 contém quatro pequenos e também conta como um quadrado maior.",
    label: "Quantidade total de quadrados",
  },
  "coloracao-triminos": {
    title: "Três casas em forma de L",
    kind: "trimino",
    prompt:
      "Mova e gire a peça de três casas em forma de L sobre uma pintura de xadrez. Quantas cores diferentes ela cobre? Registre também quantas casas de cada cor aparecem. Testar posições ajuda a formular a ideia; explique pela vizinhança por que ela vale em todas as posições.",
    label: "Número de cores diferentes cobertas",
  },
  "area-e-contorno": {
    title: "Dentro e em volta",
    kind: "perimeter",
    prompt:
      "Pinte quadradinhos para construir uma figura. A área conta o que está dentro; o perímetro mede as bordas expostas. Qual é o perímetro da sua figura?",
    label: "Perímetro em unidades",
  },
  "retirar-canto-e-borda": {
    title: "Tirar uma peça muda o contorno?",
    kind: "perimeter",
    prompt:
      "Comece com o retângulo e retire um quadrado de um canto. Depois compare com retirar um quadrado do meio da borda. Qual é o perímetro da montagem atual? Bordas de um buraco também contam.",
    label: "Perímetro em unidades",
  },
  "unidades-area-perimetro": {
    title: "Uma unidade para cada medida",
    kind: "units",
    prompt:
      "Pinte a figura e escolha o comprimento do lado de cada quadrado em centímetros. Qual é a área em cm²? Duplicar o lado multiplica a área de cada quadrado por quatro.",
    label: "Área em cm²",
  },
  "decompor-e-recortar": {
    title: "Recortar sem criar área",
    kind: "area",
    prompt:
      "Selecione uma peça pintada e mova para um espaço vazio. Compare a figura antes e depois. Quantos quadradinhos formam a área atual? Mover conserva a quantidade de peças.",
    label: "Área em unidades quadradas",
  },
  "coloracao-e-cobertura": {
    title: "Duas cores, uma condição",
    kind: "color",
    prompt:
      "Um dominó cobre dois quadrados vizinhos: um claro e um escuro. Remova peças e conte as duas cores. Qual é a diferença absoluta entre suas quantidades? Se a diferença não é zero, cobrir com dominós é impossível; diferença zero sozinha não garante cobertura.",
    label: "Diferença entre as cores",
  },
  "montar-com-pecas": {
    title: "Monte uma figura",
    kind: "area",
    prompt:
      "Toque nos quadradinhos para montar uma figura. Cada peça vale uma unidade quadrada. Quantas peças você usou?",
    label: "Peças usadas",
  },
  "lados-compartilhados": {
    title: "O lado que ficou escondido",
    kind: "shared",
    prompt:
      "Aproxime peças até que dividam um lado. Cada lado compartilhado deixa de aparecer duas vezes no contorno. Quantos lados são compartilhados na sua montagem?",
    label: "Lados compartilhados",
  },
  "cobrir-regiao": {
    title: "Cobrir sem sobrepor",
    kind: "area",
    prompt:
      "Cubra a região que você desenhar com quadrados inteiros, sem colocar dois no mesmo lugar. Conte a área da região atual.",
    label: "Área em quadradinhos",
  },
  "cortar-completar-area": {
    title: "Reorganizar uma área",
    kind: "units",
    prompt:
      "Construa uma figura composta e mova peças para completar linhas. A área se conserva quando apenas movemos peças. Qual é a área atual em cm²?",
    label: "Área em cm²",
  },
  "area-coordenadas": {
    title: "Área pelos vértices",
    kind: "polygon",
    prompt:
      "Mova os três vértices do triângulo. Observe sua posição no plano. Qual é a área em unidades quadradas? Use base e altura ou a decomposição no retângulo que o envolve.",
    label: "Área do triângulo",
  },
  "formas-planas": {
    title: "Contorne a forma",
    kind: "shape",
    prompt:
      "Escolha uma forma plana. Passe por cada lado uma única vez. Quantos lados ela tem? Girar a forma não muda esse número.",
    label: "Número de lados",
  },
  montar: {
    title: "Desenho com quadradinhos",
    kind: "area",
    prompt:
      "Use as peças para fazer seu desenho. Toque em uma casa para pôr ou tirar uma peça. Quantas peças há no desenho?",
    label: "Quantidade de peças",
  },
};
export function geometryDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L05", geometryCases);
}
export function parseGeometry(launch: ToolLaunch, raw: unknown): GeometryState {
  const kind = geometryDefinition(launch).kind;
  const state = geometrySchema.parse(raw);
  if (kind === "tiling") {
    const tiles = tileDeficientBoard(state.tilingPower, {
      x: state.missingColumn,
      y: state.missingRow,
    });
    if (state.tilingStep > tiles.length)
      throw new Error("Há mais passos do que peças na cobertura.");
  }
  return state;
}
export function geometryValue(launch: ToolLaunch, state: GeometryState): number {
  const measures = cellMeasures(state.cells);
  switch (geometryDefinition(launch).kind) {
    case "tiling":
      return (4 ** state.tilingPower - 1) / 3;
    case "squares":
      return squaresBySize(state.cells).reduce((sum, count) => sum + count, 0);
    case "trimino": {
      const counts = cellMeasures(triminoCells(state.pieceRow, state.pieceColumn, state.pieceTurn));
      return Number(counts.dark > 0) + Number(counts.light > 0);
    }
    case "area":
      return measures.area;
    case "perimeter":
      return measures.perimeter;
    case "shared":
      return measures.shared;
    case "units":
      return measures.area * state.side * state.side;
    case "color":
      return Math.abs(measures.dark - measures.light);
    case "polygon":
      return polygonArea(state.points);
    case "shape":
      return { triangulo: 3, quadrado: 4, pentagono: 5, hexagono: 6 }[state.shape];
  }
}
export function geometrySummary(launch: ToolLaunch, state: GeometryState): string {
  const kind = geometryDefinition(launch).kind;
  if (kind === "tiling")
    return `Tabuleiro ${2 ** state.tilingPower} × ${2 ** state.tilingPower}; casa removida na linha ${state.missingRow + 1}, coluna ${state.missingColumn + 1}; ${state.tilingStep} de ${(4 ** state.tilingPower - 1) / 3} peças L colocadas. A primeira peça cria um buraco em cada quadrante para repetir a construção.`;
  if (kind === "squares")
    return `Quadrados por tamanho: ${squaresBySize(state.cells)
      .map((count, index) => `lado ${index + 1}: ${count}`)
      .join("; ")}. Total: ${geometryValue(launch, state)} quadrados, incluindo os maiores.`;
  if (kind === "trimino") {
    const counts = cellMeasures(triminoCells(state.pieceRow, state.pieceColumn, state.pieceTurn));
    return `Peça L com 3 casas: ${counts.dark} escuras e ${counts.light} claras. As três casas cobrem duas cores; uma aparece duas vezes e a outra uma vez.`;
  }
  if (kind === "shape") return `${state.shape}: ${geometryValue(launch, state)} lados.`;
  if (kind === "polygon")
    return `Vértices ${state.points.map((point) => `(${point.x}, ${point.y})`).join(", ")}; área ${polygonArea(state.points)} unidades quadradas.`;
  const measures = cellMeasures(state.cells);
  return `${measures.area} quadrados, ${measures.perimeter} lados expostos, ${measures.shared} lados compartilhados; ${measures.dark} escuros e ${measures.light} claros. Cada lado mede ${state.side} cm; área ${measures.area * state.side ** 2} cm²; perímetro ${measures.perimeter * state.side} cm.`;
}
export const geometryTool: ToolModule = {
  family: "L05",
  modes: Object.keys(geometryCases),
  activity(launch) {
    const definition = geometryDefinition(launch);
    const width = launch.variant ? 4 : 3;
    const cells = Array.from(
      { length: 36 },
      (_, index) => index % 6 < width && Math.floor(index / 6) < 3,
    );
    return activity(
      definition.title,
      definition.prompt,
      {
        cells,
        side: 1 + launch.variant,
        shape: launch.variant ? "pentagono" : "triangulo",
        points: [
          { x: 1, y: 1 },
          { x: 5, y: 1 },
          { x: 2, y: 4 + launch.variant },
        ],
        pieceRow: launch.variant,
        pieceColumn: 1,
        pieceTurn: launch.variant,
        tilingPower: 2 + launch.variant,
        missingRow: launch.variant,
        missingColumn: launch.variant,
        tilingStep: 0,
      },
      definition.label,
      { ...(definition.kind === "polygon" ? { answerKeys: ["decimal", "fraction"] } : {}) },
    );
  },
  parse: parseGeometry,
  assess(launch, raw, answer) {
    const state = parseGeometry(launch, raw);
    if (
      geometryDefinition(launch).kind === "tiling" &&
      state.tilingStep !== geometryValue(launch, state)
    )
      return {
        correct: false,
        message:
          "Complete a cobertura usando o botão de colocar a próxima peça. Observe como a peça central permite repetir o problema nos quatro quadrantes.",
        summary: geometrySummary(launch, state),
      };
    return assessNumber(
      answer,
      geometryValue(launch, state),
      geometryDefinition(launch).kind === "color"
        ? "Cada dominó usa uma casa de cada cor. A igualdade das quantidades é necessária, mas não é uma prova de que a cobertura existe."
        : "Conte a medida pedida, diferenciando interior, lados compartilhados e contorno.",
      geometrySummary(launch, state),
      geometryDefinition(launch).kind === "units" ? ["cm²", "cm^2", "cm2"] : undefined,
    );
  },
  summarize: (launch, raw) => geometrySummary(launch, parseGeometry(launch, raw)),
};

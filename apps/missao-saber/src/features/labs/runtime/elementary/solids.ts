import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, assessNumber, format, requireMode } from "./math";

export const solidShapeSchema = z.enum([
  "bloco",
  "cilindro",
  "cone",
  "piramide",
  "esfera",
  "prisma-triangular",
  "tetraedro",
]);
export type SolidShape = z.infer<typeof solidShapeSchema>;
export const solidSchema = z
  .object({
    shape: solidShapeSchema,
    width: z.number().int().min(1).max(12),
    depth: z.number().int().min(1).max(12),
    height: z.number().int().min(1).max(12),
    radius: z.number().int().min(1).max(6),
    cut: z.number().int().min(0).max(100),
    packing: z.number().int().min(1).max(6),
    stacks: z.array(z.number().int().min(0).max(4)).length(9),
    view: z.enum(["frente", "lado", "cima"]),
    rotation: z.number().int().min(0).max(3),
    unfolded: z.boolean(),
    normalX: z.number().int().min(0).max(3).default(1),
    normalY: z.number().int().min(0).max(3).default(1),
    normalZ: z.number().int().min(0).max(3).default(1),
    spaceX: z.number().int().min(0).max(12).default(1),
    spaceY: z.number().int().min(0).max(12).default(1),
    spaceZ: z.number().int().min(0).max(12).default(1),
  })
  .strict();
export type SolidState = z.infer<typeof solidSchema>;
type Kind =
  | "cubes"
  | "view"
  | "diagonal"
  | "euler"
  | "surface"
  | "volume"
  | "cut"
  | "packing"
  | "basic"
  | "oblique";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const solidCases: Record<string, Definition> = {
  "cortes-obliquos": {
    title: "Um cubo pode mostrar um hexágono?",
    kind: "oblique",
    prompt:
      "Incline o plano de corte mudando sua direção e posição. O contorno amarelo é a interseção real do plano com o bloco. Quantos lados tem a seção? Se o plano tocar somente um vértice ou uma aresta, ainda não há um polígono: responda zero.",
    label: "Lados do polígono da seção",
  },
  "pecas-e-faces-ocultas": {
    title: "Cubinhos escondidos",
    kind: "cubes",
    prompt:
      "Construa pilhas de cubinhos. Cada casa do chão mostra quantos cubos há naquela pilha. Gire e compare as vistas. Quantos cubinhos formam a construção inteira, incluindo os escondidos?",
    label: "Total de cubinhos",
  },
  vistas: {
    title: "Olhar de outro lado",
    kind: "view",
    prompt:
      "Monte pilhas e escolha uma vista: frente, lado ou cima. Quantos quadradinhos aparecem nessa vista? Cubos alinhados podem esconder uns aos outros.",
    label: "Quadradinhos visíveis na vista escolhida",
  },
  "diagonal-espacial": {
    title: "De um vértice ao oposto",
    kind: "diagonal",
    prompt:
      "Ajuste as três dimensões do bloco retangular. Calcule primeiro a diagonal da base e depois a diagonal espacial. Quanto mede a diagonal espacial?",
    label: "Diagonal espacial em cm",
  },
  "poliedros-euler": {
    title: "Vértices, arestas e faces",
    kind: "euler",
    prompt:
      "Escolha um poliedro convexo e observe suas faces. Conte vértices V, arestas A e faces F. Qual é o valor de V − A + F? Esta investigação usa apenas poliedros convexos.",
    label: "Valor de V − A + F",
  },
  "planificacoes-area": {
    title: "Abrir a superfície",
    kind: "surface",
    prompt:
      "Escolha o sólido e examine as partes da superfície. Some as áreas das bases e da parte lateral. Qual é a área total? Uma esfera não tem uma planificação plana exata sem deformação. Nos valores com π, use o valor de π e arredonde para 4 casas.",
    label: "Área total em cm²",
  },
  volumes: {
    title: "O espaço que cabe dentro",
    kind: "volume",
    prompt:
      "Compare blocos, prismas, cilindros, pirâmides, cones e esferas. Ajuste as medidas e calcule o volume do sólido escolhido. Cone e pirâmide têm um terço do volume do cilindro ou prisma de mesma base e altura. Arredonde para 4 casas se precisar.",
    label: "Volume em cm³",
  },
  "cortes-vistas-projecoes": {
    title: "Cortar paralelamente à base",
    kind: "cut",
    prompt:
      "Mova o plano de corte paralelo à base. No cone, na pirâmide e no tetraedro, a porcentagem mede a distância do vértice até o plano, como parte da altura. Na esfera, mede a distância do centro ao plano, como parte do raio. Qual é a área da seção?",
    label: "Área da seção em cm²",
  },
  "coordenadas-capacidade-embalagem": {
    title: "Quantas caixas realmente cabem?",
    kind: "packing",
    prompt:
      "Localize o ponto P pelas três coordenadas a partir do vértice O. Preencha o bloco retangular com caixas cúbicas alinhadas aos eixos, sem cortar caixas. Quantas cabem? Dividir somente os volumes pode ignorar espaços que sobram nas bordas.",
    label: "Número de caixas inteiras",
  },
  "solidos-basicos": {
    title: "Superfície plana ou curva?",
    kind: "basic",
    prompt:
      "Escolha um sólido e gire a vista. Quantas faces planas ele tem? Uma superfície curva não conta como face plana nesta atividade.",
    label: "Quantidade de faces planas",
  },
};
export const solidNames: Record<SolidShape, string> = {
  bloco: "Bloco retangular",
  cilindro: "Cilindro",
  cone: "Cone",
  piramide: "Pirâmide de base retangular",
  esfera: "Esfera",
  "prisma-triangular": "Prisma de base triangular retângula",
  tetraedro: "Tetraedro regular",
};
/** Describe the surface pieces without giving their total, including hidden faces. */
export const basicSurfaceDescriptions: Record<SolidShape, string> = {
  bloco: "Partes planas na frente, atrás, à esquerda, à direita, em cima e embaixo.",
  cilindro: "Uma parte plana circular em cima, outra embaixo e uma superfície curva ao redor.",
  cone: "Uma base plana circular e uma superfície curva que termina numa ponta.",
  piramide: "Uma base retangular e um triângulo plano ligado a cada lado dessa base.",
  esfera: "Toda a superfície é curva, como a de uma bola.",
  "prisma-triangular":
    "Uma base triangular em cada ponta e um retângulo plano ligado a cada lado da base.",
  tetraedro: "Uma base triangular e um triângulo plano ligado a cada lado dessa base.",
};
export function solidDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L19", solidCases);
}
export function polyhedronCounts(
  shape: SolidShape,
): { vertices: number; edges: number; faces: number } | null {
  if (shape === "bloco") return { vertices: 8, edges: 12, faces: 6 };
  if (shape === "piramide") return { vertices: 5, edges: 8, faces: 5 };
  if (shape === "prisma-triangular") return { vertices: 6, edges: 9, faces: 5 };
  if (shape === "tetraedro") return { vertices: 4, edges: 6, faces: 4 };
  return null;
}
export function solidVolume(state: SolidState): number {
  const { width: w, depth: d, height: h, radius: r } = state;
  switch (state.shape) {
    case "bloco":
      return w * d * h;
    case "cilindro":
      return Math.PI * r * r * h;
    case "cone":
      return (Math.PI * r * r * h) / 3;
    case "piramide":
      return (w * d * h) / 3;
    case "esfera":
      return (4 * Math.PI * r ** 3) / 3;
    case "prisma-triangular":
      return (w * d * h) / 2;
    case "tetraedro":
      return w ** 3 / (6 * Math.SQRT2);
  }
}
export function solidSurface(state: SolidState): number {
  const { width: w, depth: d, height: h, radius: r } = state;
  switch (state.shape) {
    case "bloco":
      return 2 * (w * d + w * h + d * h);
    case "cilindro":
      return 2 * Math.PI * r * (r + h);
    case "cone":
      return Math.PI * r * (r + Math.hypot(r, h));
    case "piramide":
      return w * d + w * Math.hypot(d / 2, h) + d * Math.hypot(w / 2, h);
    case "esfera":
      return 4 * Math.PI * r ** 2;
    case "prisma-triangular":
      return w * d + h * (w + d + Math.hypot(w, d));
    case "tetraedro":
      return Math.sqrt(3) * w * w;
  }
}
export function horizontalSection(state: SolidState): number {
  const fraction = state.cut / 100;
  switch (state.shape) {
    case "bloco":
      return state.width * state.depth;
    case "cilindro":
      return Math.PI * state.radius ** 2;
    case "cone":
      return Math.PI * (state.radius * fraction) ** 2;
    case "piramide":
      return state.width * state.depth * fraction ** 2;
    case "esfera":
      return Math.PI * state.radius ** 2 * (1 - fraction ** 2);
    case "prisma-triangular":
      return (state.width * state.depth) / 2;
    case "tetraedro":
      return (Math.sqrt(3) * state.width ** 2 * fraction ** 2) / 4;
  }
}
export type Point3 = { x: number; y: number; z: number };
/** Physical vertices and faces before projection; rotation must never alter these lengths. */
export function polyhedronGeometry(
  state: SolidState,
): { vertices: Point3[]; faces: number[][]; section: Point3[] } | null {
  const { width: w, depth: d, height: h } = state;
  let base: Point3[];
  let vertices: Point3[];
  let faces: number[][];
  let apex: Point3 | undefined;
  if (state.shape === "tetraedro") {
    base = [
      { x: 0, y: 0, z: 0 },
      { x: w, y: 0, z: 0 },
      { x: w / 2, y: (w * Math.sqrt(3)) / 2, z: 0 },
    ];
    apex = { x: w / 2, y: (w * Math.sqrt(3)) / 6, z: w * Math.sqrt(2 / 3) };
  } else if (state.shape === "prisma-triangular") {
    base = [
      { x: 0, y: 0, z: 0 },
      { x: w, y: 0, z: 0 },
      { x: 0, y: d, z: 0 },
    ];
  } else if (state.shape === "bloco" || state.shape === "piramide") {
    base = [
      { x: 0, y: 0, z: 0 },
      { x: w, y: 0, z: 0 },
      { x: w, y: d, z: 0 },
      { x: 0, y: d, z: 0 },
    ];
    if (state.shape === "piramide") apex = { x: w / 2, y: d / 2, z: h };
  } else return null;
  const n = base.length;
  const indices = base.map((_, index) => index);
  if (apex) {
    vertices = [...base, apex];
    faces = [indices, ...indices.map((index) => [index, (index + 1) % n, n])];
  } else {
    vertices = [...base, ...base.map((point) => ({ ...point, z: h }))];
    faces = [
      indices,
      indices.map((index) => index + n),
      ...indices.map((index) => [index, (index + 1) % n, ((index + 1) % n) + n, index + n]),
    ];
  }
  const fraction = state.cut / 100;
  const top = apex;
  const section = base.map((point) =>
    top
      ? {
          x: top.x + (point.x - top.x) * fraction,
          y: top.y + (point.y - top.y) * fraction,
          z: top.z * (1 - fraction),
        }
      : { ...point, z: h * fraction },
  );
  return { vertices, faces, section };
}
/** Intersect the twelve cuboid edges, then order the section in its own plane. */
export function cuboidSection(
  state: Pick<SolidState, "width" | "depth" | "height" | "normalX" | "normalY" | "normalZ" | "cut">,
): Point3[] {
  const normal = { x: state.normalX, y: state.normalY, z: state.normalZ };
  const norm = Math.hypot(normal.x, normal.y, normal.z);
  if (norm === 0) throw new Error("Escolha uma direção não nula para o plano.");
  const dot = (point: Point3) => point.x * normal.x + point.y * normal.y + point.z * normal.z;
  const offset =
    ((normal.x * state.width + normal.y * state.depth + normal.z * state.height) * state.cut) / 100;
  const vertices = Array.from({ length: 8 }, (_, mask) => ({
    x: mask & 1 ? state.width : 0,
    y: mask & 2 ? state.depth : 0,
    z: mask & 4 ? state.height : 0,
  }));
  const points: Point3[] = [];
  const add = (point: Point3) => {
    if (
      !points.some(
        (existing) =>
          Math.hypot(point.x - existing.x, point.y - existing.y, point.z - existing.z) < 1e-9,
      )
    )
      points.push(point);
  };
  vertices.forEach((from, index) => {
    for (const bit of [1, 2, 4]) {
      if (index & bit) continue;
      const to = vertices[index | bit];
      if (!to) continue;
      const a = dot(from) - offset;
      const b = dot(to) - offset;
      if (Math.abs(a) < 1e-9) add(from);
      if (Math.abs(b) < 1e-9) add(to);
      if (a * b < 0) {
        const fraction = a / (a - b);
        add({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        });
      }
    }
  });
  if (points.length < 3) return points;
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
      z: sum.z + point.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const first = points[0];
  if (!first) return [];
  const ux = first.x - center.x;
  const uy = first.y - center.y;
  const uz = first.z - center.z;
  const uLength = Math.hypot(ux, uy, uz);
  const u = { x: ux / uLength, y: uy / uLength, z: uz / uLength };
  const v = {
    x: (normal.y * u.z - normal.z * u.y) / norm,
    y: (normal.z * u.x - normal.x * u.z) / norm,
    z: (normal.x * u.y - normal.y * u.x) / norm,
  };
  const angle = (point: Point3) =>
    Math.atan2(
      (point.x - center.x) * v.x + (point.y - center.y) * v.y + (point.z - center.z) * v.z,
      (point.x - center.x) * u.x + (point.y - center.y) * u.y + (point.z - center.z) * u.z,
    );
  return points.sort((a, b) => angle(a) - angle(b));
}
export function sectionArea(points: Point3[]): number {
  const vector = points.reduce(
    (sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return next
        ? {
            x: sum.x + point.y * next.z - point.z * next.y,
            y: sum.y + point.z * next.x - point.x * next.z,
            z: sum.z + point.x * next.y - point.y * next.x,
          }
        : sum;
    },
    { x: 0, y: 0, z: 0 },
  );
  return Math.hypot(vector.x, vector.y, vector.z) / 2;
}
export function rotatedStacks(stacks: number[], turns: number): number[] {
  let result = [...stacks];
  for (let turn = 0; turn < turns; turn++) {
    const previous = result;
    result = Array.from(
      { length: 9 },
      (_, index) => previous[(2 - (index % 3)) * 3 + Math.floor(index / 3)] ?? 0,
    );
  }
  return result;
}
export function projectedHeights(state: SolidState): number[] {
  const stacks = rotatedStacks(state.stacks, state.rotation);
  if (state.view === "cima") return stacks.map((height) => (height > 0 ? 1 : 0));
  return Array.from({ length: 3 }, (_, index) =>
    Math.max(
      ...Array.from(
        { length: 3 },
        (_, other) => stacks[state.view === "frente" ? other * 3 + index : index * 3 + other] ?? 0,
      ),
    ),
  );
}
export function parseSolid(launch: ToolLaunch, raw: unknown): SolidState {
  const kind = solidDefinition(launch).kind;
  const state = solidSchema.parse(raw);
  if (kind === "euler" && !polyhedronCounts(state.shape))
    throw new Error("A relação de Euler deste roteiro usa poliedros convexos.");
  if ((kind === "diagonal" || kind === "packing" || kind === "oblique") && state.shape !== "bloco")
    throw new Error("Este roteiro usa um bloco retangular.");
  if (kind === "oblique" && state.normalX + state.normalY + state.normalZ === 0)
    throw new Error("Escolha ao menos uma direção não nula para o plano de corte.");
  if (
    kind === "packing" &&
    (state.spaceX > state.width || state.spaceY > state.depth || state.spaceZ > state.height)
  )
    throw new Error("O ponto espacial precisa permanecer dentro do bloco.");
  return state;
}
export function solidValue(launch: ToolLaunch, state: SolidState): number {
  switch (solidDefinition(launch).kind) {
    case "oblique": {
      const section = cuboidSection(state);
      return section.length >= 3 ? section.length : 0;
    }
    case "cubes":
      return state.stacks.reduce((sum, height) => sum + height, 0);
    case "view":
      return projectedHeights(state).reduce((sum, height) => sum + height, 0);
    case "diagonal":
      return Math.hypot(state.width, state.depth, state.height);
    case "euler": {
      const counts = polyhedronCounts(state.shape);
      if (!counts) throw new Error("Use um poliedro.");
      return counts.vertices - counts.edges + counts.faces;
    }
    case "surface":
      return solidSurface(state);
    case "volume":
      return solidVolume(state);
    case "cut":
      return horizontalSection(state);
    case "packing":
      return (
        Math.floor(state.width / state.packing) *
        Math.floor(state.depth / state.packing) *
        Math.floor(state.height / state.packing)
      );
    case "basic":
      return (
        polyhedronCounts(state.shape)?.faces ??
        (state.shape === "cilindro" ? 2 : state.shape === "cone" ? 1 : 0)
      );
  }
}
export function solidSummary(launch: ToolLaunch, state: SolidState): string {
  const kind = solidDefinition(launch).kind;
  if (kind === "basic")
    return `${solidNames[state.shape]}: ${solidValue(launch, state)} faces planas. ${basicSurfaceDescriptions[state.shape]}`;
  if (kind === "oblique") {
    const section = cuboidSection(state);
    return `Bloco ${state.width} × ${state.depth} × ${state.height} cm. Plano com direção (${state.normalX}, ${state.normalY}, ${state.normalZ}), posição ${state.cut}%: ${section.length >= 3 ? `${section.length} lados, área ${format(sectionArea(section))} cm²` : "contato sem região poligonal"}.`;
  }
  if (kind === "cubes" || kind === "view")
    return `Pilhas, por linha: ${state.stacks.slice(0, 3).join(", ")}; ${state.stacks.slice(3, 6).join(", ")}; ${state.stacks.slice(6).join(", ")}. Total ${state.stacks.reduce((a, b) => a + b, 0)} cubos; vista ${state.view}, rotação ${state.rotation * 90}°: ${projectedHeights(state).reduce((a, b) => a + b, 0)} quadrados.`;
  const counts = polyhedronCounts(state.shape);
  const dimensions =
    state.shape === "esfera"
      ? `raio ${state.radius} cm`
      : state.shape === "tetraedro"
        ? `aresta ${state.width} cm; altura ${format(state.width * Math.sqrt(2 / 3))} cm`
        : state.shape === "cilindro" || state.shape === "cone"
          ? `raio ${state.radius} cm e altura ${state.height} cm`
          : `base ${state.width} × ${state.depth} cm; altura ${state.height} cm`;
  return `${solidNames[state.shape]}; ${dimensions}. Área total ${format(solidSurface(state))} cm²; volume ${format(solidVolume(state))} cm³.${counts ? ` V=${counts.vertices}, A=${counts.edges}, F=${counts.faces}.` : ""}${kind === "cut" ? ` Corte em ${state.cut}%: área ${format(horizontalSection(state))} cm².` : ""}${kind === "packing" ? ` Caixas de aresta ${state.packing} cm: cabem ${solidValue(launch, state)}.` : ""}`;
}
export const solidsTool: ToolModule = {
  family: "L19",
  modes: Object.keys(solidCases),
  activity(launch) {
    const definition = solidDefinition(launch);
    return activity(
      definition.title,
      definition.prompt,
      {
        shape:
          definition.kind === "volume" || definition.kind === "cut"
            ? launch.variant
              ? "cone"
              : "cilindro"
            : definition.kind === "basic" && launch.variant
              ? "esfera"
              : definition.kind === "euler" && launch.variant
                ? "piramide"
                : "bloco",
        width: 3 + launch.variant,
        depth: 4,
        height: 6,
        radius: 3,
        cut: 50,
        packing: 2,
        stacks: launch.variant ? [1, 2, 1, 2, 3, 0, 1, 0, 0] : [1, 1, 0, 2, 1, 0, 0, 0, 0],
        view: "frente",
        rotation: 0,
        unfolded: definition.kind === "surface",
      },
      definition.label,
      {
        ...(["surface", "volume", "cut", "diagonal"].includes(definition.kind)
          ? { answerKeys: ["decimal", "fraction"] }
          : {}),
        answerHint:
          definition.kind === "basic"
            ? "Conte as partes planas, incluindo as que ficam escondidas."
            : ["surface", "volume", "cut", "diagonal"].includes(definition.kind)
              ? "Use decimal ou fração. Quando necessário, arredonde para 4 casas decimais."
              : "Responda com um número inteiro.",
        rubric:
          definition.kind === "basic"
            ? [
                "As partes planas e curvas são reconhecidas.",
                "As faces escondidas também entram na contagem.",
                "Girar a vista não muda o sólido.",
              ]
            : [
                "A vista ou a planificação corresponde ao sólido.",
                "Faces escondidas, unidade e dimensões são consideradas.",
                "Comprimento, área e volume não são confundidos.",
              ],
      },
    );
  },
  parse: parseSolid,
  assess(launch, raw, answer) {
    const state = parseSolid(launch, raw);
    const kind = solidDefinition(launch).kind;
    return assessNumber(
      answer,
      solidValue(launch, state),
      kind === "basic"
        ? "Conte cada parte plana uma vez. A superfície curva não entra nessa contagem."
        : kind === "packing"
          ? "Conte quantas caixas inteiras cabem em cada dimensão e multiplique; os restos não formam caixas inteiras."
          : "Considere também as partes ocultas e use a dimensão correta: comprimento, área ou volume.",
      solidSummary(launch, state),
      kind === "diagonal"
        ? "cm"
        : kind === "surface" || kind === "cut"
          ? ["cm²", "cm^2", "cm2"]
          : kind === "volume"
            ? ["cm³", "cm^3", "cm3"]
            : undefined,
    );
  },
  summarize: (launch, raw) => solidSummary(launch, parseSolid(launch, raw)),
};

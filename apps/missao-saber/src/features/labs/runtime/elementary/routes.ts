import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import type { Point } from "./geometry";
import { activity, assessNumber, format, requireMode } from "./math";

const routePointSchema = z
  .object({ x: z.number().int().min(-5).max(5), y: z.number().int().min(-5).max(5) })
  .strict();
const commandSchema = z.enum(["N", "E", "S", "W", "L", "R", "F"]);
export type Command = z.infer<typeof commandSchema>;
export const routeSchema = z
  .object({
    start: routePointSchema,
    target: routePointSchema,
    commands: z.array(commandSchema).max(60),
    obstacles: z.array(routePointSchema).max(20),
    heading: z.number().int().min(0).max(3),
    unit: z.number().int().min(1).max(10),
    horizontalAxis: z.enum(["x", "y"]).default("x"),
    recorded: z.array(z.array(commandSchema).max(20)).max(70),
  })
  .strict();
export type RouteState = z.infer<typeof routeSchema>;
type Kind =
  | "position"
  | "reach"
  | "turn"
  | "map"
  | "enumerate"
  | "distance"
  | "shortest"
  | "cost"
  | "quadrant"
  | "displace"
  | "area"
  | "midpoint"
  | "direct";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const routeCases: Record<string, Definition> = {
  posicoes: {
    title: "Onde está o ponto?",
    kind: "position",
    prompt: "Olhe as colunas numeradas do mapa. Mova o ponto de partida. Em qual coluna ele está?",
    label: "Número da coluna",
  },
  "instrucoes-malha": {
    title: "Dê as instruções",
    kind: "reach",
    prompt:
      "Use os comandos para sair de A e chegar a B. Cada comando de movimento avança uma casa. Ao chegar, conte quantos passos usou.",
    label: "Passos do seu caminho",
  },
  giros: {
    title: "Para onde estou olhando?",
    kind: "turn",
    prompt:
      "Comece olhando na direção indicada. Gire à esquerda ou à direita, ou avance. Qual é a direção para a qual você olha no final?",
    label: "Direção final",
  },
  mapas: {
    title: "A escala do mapa",
    kind: "map",
    prompt:
      "Crie um caminho de A até B. Cada passo tem o comprimento indicado em metros. Qual é a distância total percorrida?",
    label: "Distância total em m",
  },
  "enumerar-caminhos": {
    title: "Todos os caminhos curtos",
    kind: "enumerate",
    prompt:
      "Vá de A até B usando somente movimentos para cima e para a direita. Guarde os caminhos que encontrar, sem repetir a mesma sequência. Quantos caminhos diferentes existem?",
    label: "Quantidade de caminhos diferentes",
  },
  "distancia-total": {
    title: "Some os trechos",
    kind: "distance",
    prompt:
      "Monte um percurso até B. Some todos os trechos, inclusive quando voltar por um lugar já visitado. Qual é a distância percorrida em metros?",
    label: "Distância percorrida em m",
  },
  restricoes: {
    title: "Desvie do bloqueio",
    kind: "shortest",
    prompt:
      "Chegue a B sem entrar nas casas bloqueadas. Construa um caminho com o menor número de passos. Quantos passos ele tem?",
    label: "Menor número de passos",
  },
  "labirinto-e-retrocesso": {
    title: "Tentar, voltar e encontrar",
    kind: "reach",
    prompt:
      "Encontre uma passagem de A até B. Você pode desfazer o último comando e tentar outra direção. Conte os passos da rota que ficou registrada.",
    label: "Passos da rota registrada",
  },
  "multiplos-criterios": {
    title: "Distância e esforço",
    kind: "cost",
    prompt:
      "Chegue a B. Cada passo horizontal custa 1 ponto de esforço e cada passo vertical custa 2. Qual é o custo total da sua rota? Compare caminhos de mesma distância.",
    label: "Pontos de esforço da rota",
  },
  "pontos-quadrantes": {
    title: "Sinais no plano",
    kind: "quadrant",
    prompt:
      "Mova o ponto A pelo plano. Em qual quadrante ele está? Pontos nos eixos não pertencem a quadrantes.",
    label: "Quadrante ou eixo",
  },
  "deslocamentos-caminhos": {
    title: "Caminho e deslocamento",
    kind: "displace",
    prompt:
      "Faça um percurso e compare seu comprimento com a mudança de posição. Qual é a coordenada x da posição final? Voltar sobre os próprios passos aumenta o caminho, mas pode anular o deslocamento.",
    label: "Coordenada x final",
  },
  "distancias-e-areas": {
    title: "Um retângulo entre pontos",
    kind: "area",
    prompt:
      "A e B são vértices opostos de um retângulo com lados paralelos aos eixos. Ajuste os pontos. Qual é a área desse retângulo?",
    label: "Área em unidades quadradas",
  },
  "problemas-com-transformacoes": {
    title: "Deslocar no plano",
    kind: "displace",
    prompt:
      "Construa uma translação em passos horizontais e verticais. Qual é a coordenada x final do ponto A? Compare a ordem dos passos com o deslocamento total.",
    label: "Coordenada x final",
  },
  "distancia-ponto-medio": {
    title: "No meio de dois pontos",
    kind: "midpoint",
    prompt:
      "Ajuste A e B e localize o ponto médio do segmento. Qual é a coordenada x do ponto médio? Observe também sua coordenada y e a distância aos extremos.",
    label: "Coordenada x do ponto médio",
  },
  coordenadas: {
    title: "Distância em coordenadas",
    kind: "direct",
    prompt:
      "Escolha A e B. Compare a distância em linha reta com um caminho paralelo aos eixos. Qual é a distância direta entre A e B? Use Pitágoras e arredonde para 4 casas decimais se precisar.",
    label: "Distância direta em unidades",
  },
  passos: {
    title: "Passo a passo",
    kind: "reach",
    prompt:
      "Leve A até B com os botões de direção. Cada movimento vale um passo. Quantos passos você usou?",
    label: "Quantidade de passos",
  },
};
export function routeDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L07", routeCases);
}
export function routeMinimum(launch: ToolLaunch): number {
  return launch.grade <= 4 ? 0 : -5;
}
const directions: Point[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
];
export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
export function traceRoute(
  state: Pick<RouteState, "start" | "heading" | "commands" | "obstacles">,
  minimum = -5,
) {
  let point = { ...state.start };
  let heading = state.heading;
  let steps = 0;
  let cost = 0;
  const points = [{ ...point }];
  for (const command of state.commands) {
    if (command === "L" || command === "R") {
      heading = (heading + (command === "L" ? 3 : 1)) % 4;
      continue;
    }
    const index =
      command === "F"
        ? heading
        : command === "N"
          ? 0
          : command === "E"
            ? 1
            : command === "S"
              ? 2
              : 3;
    const delta = directions[index];
    if (!delta) throw new Error("Direção inválida.");
    point = { x: point.x + delta.x, y: point.y + delta.y };
    if (
      point.x < minimum ||
      point.x > 5 ||
      point.y < minimum ||
      point.y > 5 ||
      state.obstacles.some((obstacle) => samePoint(point, obstacle))
    )
      throw new Error("O percurso saiu do mapa ou atravessou um bloqueio.");
    points.push({ ...point });
    steps++;
    cost += delta.x === 0 ? 2 : 1;
  }
  return { point, heading, steps, cost, points };
}
export function shortestRoute(
  state: Pick<RouteState, "start" | "target" | "obstacles">,
  minimum = -5,
): number | null {
  const queue = [{ point: state.start, distance: 0 }];
  const visited = new Set([`${state.start.x},${state.start.y}`]);
  for (let index = 0; index < queue.length; index++) {
    const entry = queue[index];
    if (!entry) continue;
    if (samePoint(entry.point, state.target)) return entry.distance;
    for (const delta of directions) {
      const point = { x: entry.point.x + delta.x, y: entry.point.y + delta.y };
      const key = `${point.x},${point.y}`;
      if (
        point.x < minimum ||
        point.x > 5 ||
        point.y < minimum ||
        point.y > 5 ||
        visited.has(key) ||
        state.obstacles.some((obstacle) => samePoint(point, obstacle))
      )
        continue;
      visited.add(key);
      queue.push({ point, distance: entry.distance + 1 });
    }
  }
  return null;
}
export function monotonePaths(state: Pick<RouteState, "start" | "target" | "obstacles">): number {
  if (state.target.x < state.start.x || state.target.y < state.start.y) return 0;
  const counts = new Map<string, number>();
  for (let x = state.start.x; x <= state.target.x; x++)
    for (let y = state.start.y; y <= state.target.y; y++) {
      const point = { x, y };
      const key = `${x},${y}`;
      counts.set(
        key,
        state.obstacles.some((obstacle) => samePoint(obstacle, point))
          ? 0
          : samePoint(point, state.start)
            ? 1
            : (counts.get(`${x - 1},${y}`) ?? 0) + (counts.get(`${x},${y - 1}`) ?? 0),
      );
    }
  return counts.get(`${state.target.x},${state.target.y}`) ?? 0;
}
export function parseRoute(launch: ToolLaunch, raw: unknown): RouteState {
  const definition = routeDefinition(launch);
  const state = routeSchema.parse(raw);
  if (
    [state.start, state.target, ...state.obstacles].some(
      (point) => point.x < routeMinimum(launch) || point.y < routeMinimum(launch),
    )
  )
    throw new Error("Este mapa usa apenas linhas e colunas não negativas.");
  if (definition.kind === "quadrant" && state.horizontalAxis !== "x")
    throw new Error("Neste roteiro de quadrantes, use x na horizontal e y na vertical.");
  if (
    state.obstacles.some((point) => samePoint(point, state.start) || samePoint(point, state.target))
  )
    throw new Error("O começo e o destino precisam ficar livres.");
  traceRoute(state, routeMinimum(launch));
  if (definition.kind === "enumerate") {
    if (
      state.target.x <= state.start.x ||
      state.target.y <= state.start.y ||
      state.target.x - state.start.x > 4 ||
      state.target.y - state.start.y > 4
    )
      throw new Error("Este roteiro usa até quatro passos em cada direção.");
    if (state.commands.some((command) => command !== "N" && command !== "E"))
      throw new Error("Aqui os caminhos usam somente cima e direita.");
    const unique = new Set(state.recorded.map((commands) => commands.join("")));
    if (unique.size !== state.recorded.length)
      throw new Error("Não repita o mesmo caminho na lista.");
    for (const commands of state.recorded)
      if (
        commands.some((command) => command !== "N" && command !== "E") ||
        !samePoint(traceRoute({ ...state, commands }, routeMinimum(launch)).point, state.target)
      )
        throw new Error("Cada caminho guardado deve chegar ao destino com movimentos permitidos.");
  }
  if (shortestRoute(state, routeMinimum(launch)) === null)
    throw new Error("O mapa precisa permitir um caminho até o destino.");
  return state;
}
export function routeValue(launch: ToolLaunch, state: RouteState): number {
  const trace = traceRoute(state);
  switch (routeDefinition(launch).kind) {
    case "position":
      return state.start.x;
    case "reach":
      return trace.steps;
    case "map":
    case "distance":
      return trace.steps * state.unit;
    case "enumerate":
      return monotonePaths(state);
    case "shortest": {
      const distance = shortestRoute(state, routeMinimum(launch));
      if (distance === null) throw new Error("Não há caminho.");
      return distance;
    }
    case "cost":
      return trace.cost;
    case "displace":
      return trace.point.x;
    case "area":
      return Math.abs((state.target.x - state.start.x) * (state.target.y - state.start.y));
    case "midpoint":
      return (state.start.x + state.target.x) / 2;
    case "direct":
      return Math.hypot(state.target.x - state.start.x, state.target.y - state.start.y);
    case "turn":
      return trace.heading;
    case "quadrant":
      return state.start.x === 0 || state.start.y === 0
        ? 0
        : state.start.x > 0
          ? state.start.y > 0
            ? 1
            : 4
          : state.start.y > 0
            ? 2
            : 3;
  }
}
export function routeSummary(launch: ToolLaunch, state: RouteState): string {
  const trace = traceRoute(state);
  return `A (${state.start.x}, ${state.start.y}); B (${state.target.x}, ${state.target.y}); posição final (${trace.point.x}, ${trace.point.y}); ${trace.steps} passos de ${state.unit} m. Distância direta A–B: ${format(Math.hypot(state.target.x - state.start.x, state.target.y - state.start.y))} unidades. ${routeDefinition(launch).kind === "enumerate" ? `${state.recorded.length} caminhos distintos guardados.` : ""}`;
}
export const routesTool: ToolModule = {
  family: "L07",
  modes: Object.keys(routeCases),
  activity(launch) {
    const definition = routeDefinition(launch);
    const advanced = ["quadrant", "area", "midpoint", "direct"].includes(definition.kind);
    return activity(
      definition.title,
      definition.prompt,
      {
        start: advanced
          ? { x: -2 - launch.variant, y: 1 }
          : definition.kind === "position"
            ? { x: 1 + launch.variant * 2, y: 1 }
            : { x: 0, y: 0 },
        target: { x: 2 + launch.variant, y: 2 },
        commands: [],
        heading: launch.variant,
        unit: 2 + launch.variant,
        obstacles:
          definition.kind === "shortest" || launch.mode === "labirinto-e-retrocesso"
            ? [
                { x: 1, y: 0 },
                { x: 1, y: 1 },
              ]
            : [],
        recorded: [],
      },
      definition.label,
      definition.kind === "quadrant"
        ? { choices: ["I", "II", "III", "IV", "Eixo"] }
        : definition.kind === "turn"
          ? { choices: ["Norte", "Leste", "Sul", "Oeste"] }
          : {
              answerKeys: [
                ...(["midpoint", "direct"].includes(definition.kind)
                  ? ["decimal" as const, "fraction" as const]
                  : []),
                ...(["displace", "midpoint"].includes(definition.kind) && launch.grade > 4
                  ? ["negative" as const]
                  : []),
              ],
              answerHint:
                "Use decimal ou fração. Quando necessário, arredonde para 4 casas decimais.",
            },
    );
  },
  parse: parseRoute,
  assess(launch, raw, answer) {
    const state = parseRoute(launch, raw);
    const kind = routeDefinition(launch).kind;
    const trace = traceRoute(state);
    const summary = routeSummary(launch, state);
    if (
      ["reach", "map", "distance", "shortest", "cost"].includes(kind) &&
      !samePoint(trace.point, state.target)
    )
      return {
        correct: false,
        message: "Complete primeiro uma rota que chegue ao ponto B sem atravessar bloqueios.",
        summary,
      };
    if (kind === "shortest" && trace.steps !== shortestRoute(state, routeMinimum(launch)))
      return {
        correct: false,
        message:
          "Sua rota chega a B. Agora procure uma que use menos passos; compare com o deslocamento e os desvios necessários.",
        summary,
      };
    if (kind === "turn") {
      const expected = ["norte", "leste", "sul", "oeste"][trace.heading];
      return {
        correct: answer.trim().toLocaleLowerCase("pt-BR") === expected,
        message: `Depois dos giros, a direção é ${expected}. Cada giro vale um quarto de volta.`,
        summary,
      };
    }
    if (kind === "quadrant") {
      const expected = ["Eixo", "I", "II", "III", "IV"][routeValue(launch, state)];
      return {
        correct: answer.trim().toUpperCase() === expected?.toUpperCase(),
        message: `A posição pertence a ${expected}. Nos eixos, uma das coordenadas é zero.`,
        summary,
      };
    }
    return assessNumber(
      answer,
      routeValue(launch, state),
      kind === "enumerate"
        ? "Cada sequência diferente de movimentos conta uma vez. Ordene a lista para conferir que não faltou nem repetiu caminho."
        : "Diferencie quantidade de passos, distância percorrida e posição final.",
      summary,
      kind === "map" || kind === "distance" ? "m" : undefined,
    );
  },
  summarize: (launch, raw) => routeSummary(launch, parseRoute(launch, raw)),
};

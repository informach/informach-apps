import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, ensureMode, numberAssessment } from "./common";
import { enumerationTool } from "./enumeration";

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const countStateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tree"),
      first: integer(2, 5),
      second: integer(2, 5),
      selected: z.array(z.string().max(12)).max(30),
    })
    .strict(),
  z
    .object({
      kind: z.literal("arrangement"),
      size: integer(2, 6),
      take: integer(1, 4),
      ordered: z.boolean(),
      repeat: z.boolean(),
      selected: z.array(z.string().max(30)).max(1300),
    })
    .strict(),
  z
    .object({
      kind: z.literal("drawers"),
      boxes: integer(2, 6),
      positions: z.array(integer(0, 5)).min(1).max(72),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sets"),
      size: integer(4, 16),
      multiplesA: integer(2, 5),
      multiplesB: integer(2, 5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("distribution"),
      balls: integer(1, 8),
      boxes: integer(2, 4),
      minimum: integer(0, 1),
      selected: z.array(z.string().max(20)).max(200),
    })
    .strict(),
]);
export type CountState = z.infer<typeof countStateSchema>;
export function adaptLegacyGroups(raw: unknown): CountState {
  const legacy = z
    .object({
      kind: z.literal("groups"),
      groups: integer(2, 6),
      tokens: z
        .array(z.object({ id: integer(0, 10000), box: integer(0, 5) }))
        .min(1)
        .max(72),
    })
    .parse(raw);
  if (
    new Set(legacy.tokens.map((token) => token.id)).size !== legacy.tokens.length ||
    legacy.tokens.some((token) => token.box >= legacy.groups)
  )
    throw new Error("Montagem antiga contém fichas repetidas ou caixas inexistentes.");
  return {
    kind: "drawers",
    boxes: legacy.groups,
    positions: legacy.tokens.map((token) => token.box),
  };
}
type CountKind = CountState["kind"];
type CountDefinition = {
  title: string;
  kind: CountKind;
  question: string;
  rule?: "sum" | "different" | "at-least-a" | "no-adjacent" | "double" | "threshold" | "maximum";
  ordered?: boolean;
  repeat?: boolean;
  minimum?: 0 | 1;
  requireList?: boolean;
  requireSmallestMaximum?: boolean;
};
export const countDefinitions: Record<string, CountDefinition> = {
  "arvore-de-escolhas": {
    title: "Uma escolha em cada etapa",
    kind: "tree",
    requireList: true,
    question:
      "Cada lanche tem uma fruta e uma bebida. Marque todos os pares e conte os lanches diferentes.",
  },
  "combinacoes-visuais": {
    title: "Combine camisetas e bonés",
    kind: "tree",
    requireList: true,
    question:
      "Monte um conjunto com uma camiseta e um boné. Toque nos pares para marcar os que já contou.",
  },
  produto: {
    title: "Decisões em sequência",
    kind: "tree",
    question: "Uma senha tem um símbolo da primeira lista e um da segunda. Quantas senhas existem?",
  },
  "soma-ou-produto": {
    title: "Uma opção ou duas etapas?",
    kind: "tree",
    rule: "sum",
    question:
      "Hoje você escolhe só uma fruta OU uma bebida. Quantas opções individuais existem? Compare com escolher uma de cada.",
  },
  "soma-produto": {
    title: "Caminhos alternativos",
    kind: "tree",
    rule: "sum",
    question:
      "O ingresso dá direito a uma atração da ala A OU da ala B. Conte as opções e compare com visitar ambas as alas.",
  },
  "listar-sem-repetir": {
    title: "Uma lista sem duplicatas",
    kind: "tree",
    requireList: true,
    question:
      "Registre todos os pares da primeira e da segunda listas. Como sabe que nenhum par ficou de fora?",
  },
  "casos-e-complementar": {
    title: "Conte e retire os proibidos",
    kind: "tree",
    rule: "different",
    question:
      "Use um número de cada lista, mas os dois números não podem ser iguais. Conte os pares permitidos.",
  },
  "restricoes-e-exaustao": {
    title: "Todos os casos permitidos",
    kind: "tree",
    requireList: true,
    rule: "at-least-a",
    question:
      "Um par é permitido quando pelo menos um dos números é 1. Liste sem contar (1,1) duas vezes.",
  },
  "filas-anagramas": {
    title: "Filas com letras repetidas",
    kind: "arrangement",
    ordered: true,
    repeat: true,
    question:
      "Há uma ficha A para cada posição menos uma e uma ficha B. Troque a posição de B e conte as palavras distintas. As fichas A são indistinguíveis.",
  },
  "escolhas-sem-ordem": {
    title: "Uma equipe, sem cargos",
    kind: "arrangement",
    ordered: false,
    question:
      "Escolha uma equipe entre as pessoas. A mesma equipe em outra ordem continua sendo uma só escolha.",
  },
  "arranjo-combinacao": {
    title: "Equipe ou cargos distintos",
    kind: "arrangement",
    ordered: true,
    question:
      "Compare uma equipe sem cargos com a escolha de pessoas para cargos distintos. Quantos resultados há com a configuração selecionada?",
  },
  "multiplas-restricoes": {
    title: "A primeira pessoa participa",
    kind: "arrangement",
    requireList: true,
    ordered: true,
    rule: "at-least-a",
    question:
      "Escolha uma fila sem repetir pessoas. A pessoa A precisa participar. Liste apenas as filas permitidas.",
  },
  "restricoes-caminhos-e-distribuicoes": {
    title: "Caminhos com passos obrigatórios",
    kind: "arrangement",
    ordered: true,
    rule: "no-adjacent",
    question:
      "Não pode haver dois passos C seguidos. Conte as rotas distintas; passos iguais são indistinguíveis.",
  },
  "complementar-inclusao-exclusao": {
    title: "Sobreposição entre conjuntos",
    kind: "sets",
    question:
      "Nos números de 1 até o limite, conte os múltiplos de A OU de B. Mostre quais foram contados duas vezes.",
  },
  "contagem-dupla": {
    title: "Conte as pontas e os pares",
    kind: "arrangement",
    ordered: false,
    rule: "double",
    question:
      "Cada dupla aperta as mãos uma vez. Contar os cumprimentos de cada pessoa conta cada aperto duas vezes. Quantos apertos distintos há?",
  },
  "repeticoes-distribuicoes": {
    title: "Distribuir objetos iguais",
    kind: "distribution",
    minimum: 0,
    question:
      "Distribua fichas iguais em caixas identificadas. Uma distribuição é a quantidade em cada caixa; a ordem de colocar as fichas não cria outra distribuição.",
  },
  "possivel-ou-garantido": {
    title: "Pode acontecer ou precisa acontecer?",
    kind: "drawers",
    rule: "threshold",
    question:
      "Experimente distribuir as fichas. Qual é o menor total de fichas que garante uma caixa com pelo menos duas, em qualquer distribuição?",
  },
  "categorias-e-repeticao": {
    title: "Cada caixa é uma categoria",
    kind: "drawers",
    rule: "threshold",
    question:
      "Distribua fichas nas categorias. Quantas fichas são necessárias para garantir uma repetição de categoria?",
  },
  "primeira-repeticao": {
    title: "Adie a primeira repetição",
    kind: "drawers",
    rule: "threshold",
    question:
      "Tente colocar uma ficha em cada caixa antes de repetir. Com quantas fichas a primeira repetição se torna inevitável?",
  },
  "pior-caso": {
    title: "O melhor jeito de adiar",
    kind: "drawers",
    rule: "maximum",
    requireSmallestMaximum: true,
    question:
      "Distribua as fichas para reduzir ao máximo a caixa mais cheia. Mesmo nessa distribuição, qual quantidade mínima precisa estar em alguma caixa?",
  },
  "teto-media": {
    title: "A média e a garantia",
    kind: "drawers",
    rule: "maximum",
    question:
      "Qual é a menor quantidade que podemos garantir em alguma caixa? Compare a média com o próximo inteiro.",
  },
  gavetas: {
    title: "Uma garantia para toda distribuição",
    kind: "drawers",
    rule: "maximum",
    requireSmallestMaximum: true,
    question:
      "Construa o pior caso. Qual ocupação mínima é garantida para a caixa mais cheia? Justifique por que menos não comportaria todas as fichas.",
  },
};

export function countDefinition(launch: ToolLaunch): CountDefinition {
  ensureMode(launch, "L12", Object.keys(countDefinitions));
  const result = countDefinitions[launch.mode];
  if (!result) throw new Error("Modo de contagem não publicado.");
  return result;
}

export function parseCount(launch: ToolLaunch, raw: unknown): CountState {
  const definition = countDefinition(launch);
  const state = countStateSchema.parse(raw);
  if (state.kind !== definition.kind)
    throw new Error("Representação incompatível com esta contagem.");
  if (state.kind === "drawers" && state.positions.some((box) => box >= state.boxes))
    throw new Error("Ficha em uma caixa inexistente.");
  if (state.kind === "arrangement" && !state.repeat && state.take > state.size)
    throw new Error("Não há pessoas suficientes sem repetição.");
  if (state.kind === "distribution" && state.minimum * state.boxes > state.balls)
    throw new Error("Não há fichas suficientes para o mínimo de cada caixa.");
  if (state.kind === "arrangement") {
    if (launch.mode === "filas-anagramas" && (!state.ordered || !state.repeat))
      throw new Error("As letras repetidas têm posições distintas.");
    if (
      launch.mode === "restricoes-caminhos-e-distribuicoes" &&
      (state.size !== 2 || state.take !== 4 || !state.ordered || !state.repeat)
    )
      throw new Error("Esta rota usa dois tipos e quatro passos.");
    if (launch.mode === "escolhas-sem-ordem" && (state.ordered || state.repeat))
      throw new Error("Equipes não repetem pessoas nem distinguem ordem.");
    if (definition.rule === "double" && (state.take !== 2 || state.ordered || state.repeat))
      throw new Error("Cada aperto corresponde a uma dupla distinta.");
    if (definition.rule === "at-least-a" && (!state.ordered || state.repeat))
      throw new Error("A fila não repete pessoas.");
  }
  if ("selected" in state) {
    const cases = countCases(launch, state);
    if (
      new Set(state.selected).size !== state.selected.length ||
      state.selected.some((item) => !cases.some((candidate) => candidate.id === item))
    )
      throw new Error("A lista contém um caso inexistente ou repetido.");
  }
  return state;
}

export function countInitial(launch: ToolLaunch): CountState {
  const definition = countDefinition(launch);
  const v = launch.variant;
  switch (definition.kind) {
    case "tree":
      return {
        kind: "tree",
        first: 2 + v,
        second: launch.grade <= 3 ? 2 + v : 3 + v,
        selected: [],
      };
    case "drawers":
      return {
        kind: "drawers",
        boxes: 3 + v,
        positions: Array.from({ length: 7 + v * 3 }, () => 0),
      };
    case "sets":
      return { kind: "sets", size: 12 + v * 4, multiplesA: 2 + v, multiplesB: 3 + v };
    case "distribution":
      return {
        kind: "distribution",
        balls: 4 + v,
        boxes: 3,
        minimum: definition.minimum ?? 0,
        selected: [],
      };
    case "arrangement":
      return {
        kind: "arrangement",
        size: definition.rule === "no-adjacent" ? 2 : 4 + v,
        take: definition.rule === "no-adjacent" ? 4 : launch.mode === "filas-anagramas" ? 3 + v : 2,
        ordered: definition.ordered ?? false,
        repeat: definition.repeat ?? definition.rule === "no-adjacent",
        selected: [],
      };
  }
}

export type CountCase = { id: string; label: string; allowed: boolean };
export function countCases(launch: ToolLaunch, state: CountState): CountCase[] {
  const definition = countDefinition(launch);
  if (state.kind === "tree") {
    if (definition.rule === "sum")
      return [
        ...Array.from({ length: state.first }, (_, i) => ({
          id: `A${i + 1}`,
          label: `A${i + 1}`,
          allowed: true,
        })),
        ...Array.from({ length: state.second }, (_, i) => ({
          id: `B${i + 1}`,
          label: `B${i + 1}`,
          allowed: true,
        })),
      ];
    return Array.from({ length: state.first }, (_, a) =>
      Array.from({ length: state.second }, (_, b) => ({
        id: `${a + 1},${b + 1}`,
        label:
          launch.grade <= 3 && launch.mode === "combinacoes-visuais"
            ? `Camiseta ${a + 1} + boné ${b + 1}`
            : launch.grade <= 3 && launch.mode === "arvore-de-escolhas"
              ? `Fruta ${a + 1} + bebida ${b + 1}`
              : `(${a + 1}, ${b + 1})`,
        allowed:
          definition.rule === "different"
            ? a !== b
            : definition.rule === "at-least-a"
              ? a === 0 || b === 0
              : true,
      })),
    ).flat();
  }
  if (state.kind === "sets")
    return Array.from({ length: state.size }, (_, index) => ({
      id: String(index + 1),
      label: String(index + 1),
      allowed: (index + 1) % state.multiplesA === 0 || (index + 1) % state.multiplesB === 0,
    }));
  if (state.kind === "drawers") return [];
  if (state.kind === "distribution") {
    const results: CountCase[] = [];
    const visit = (parts: number[], remaining: number) => {
      if (parts.length === state.boxes - 1) {
        if (remaining >= state.minimum) {
          const values = [...parts, remaining];
          results.push({ id: values.join(","), label: values.join(" · "), allowed: true });
        }
        return;
      }
      for (let count = state.minimum; count <= remaining; count++)
        visit([...parts, count], remaining - count);
    };
    visit([], state.balls);
    return results;
  }
  if (launch.mode === "filas-anagramas")
    return Array.from({ length: state.take }, (_, b) => {
      const word = Array.from({ length: state.take }, (_, i) => (i === b ? "B" : "A")).join("");
      return { id: word, label: word, allowed: true };
    });
  const results: CountCase[] = [];
  const visit = (values: number[]) => {
    if (values.length === state.take) {
      if (
        !state.ordered &&
        values.some((value, index) => index > 0 && value < (values[index - 1] ?? 0))
      )
        return;
      const id = values.map((value) => String.fromCharCode(65 + value)).join("");
      const allowed =
        definition.rule === "at-least-a"
          ? values.includes(0)
          : definition.rule === "no-adjacent"
            ? values.filter((value) => value === 0).length === 2 + launch.variant &&
              !id.includes("BB")
            : true;
      results.push({
        id,
        label:
          definition.rule === "no-adjacent"
            ? id.replaceAll("A", "D").replaceAll("B", "C")
            : id.split("").join(" → "),
        allowed,
      });
      return;
    }
    for (let i = 0; i < state.size; i++)
      if (state.repeat || !values.includes(i)) visit([...values, i]);
  };
  visit([]);
  return results;
}

export function countExpected(launch: ToolLaunch, state: CountState): number {
  return state.kind === "drawers"
    ? countDefinition(launch).rule === "threshold"
      ? state.boxes + 1
      : Math.ceil(state.positions.length / state.boxes)
    : countCases(launch, state).filter((item) => item.allowed).length;
}

export function summarizeCount(launch: ToolLaunch, state: CountState) {
  if (state.kind === "drawers")
    return `${state.positions.length} fichas em ${state.boxes} caixas. Ocupações: ${Array.from({ length: state.boxes }, (_, box) => state.positions.filter((position) => position === box).length).join(", ")}. Uma distribuição observada não basta para uma garantia universal.`;
  if (state.kind === "sets")
    return `Universo: 1 a ${state.size}; A: múltiplos de ${state.multiplesA}; B: múltiplos de ${state.multiplesB}. A interseção é contada uma única vez na união.`;
  return `${countDefinition(launch).title}: ${countCases(launch, state).length} casos exibidos; ${state.selected.length} marcados. ${state.kind === "arrangement" ? `Ordem ${state.ordered ? "importa" : "não importa"}; repetição ${state.repeat ? "permitida" : "proibida"}.` : ""}`;
}

const countingTool: ToolModule = {
  family: "L12",
  modes: Object.keys(countDefinitions),
  parse: parseCount,
  activity: (launch) => {
    const definition = countDefinition(launch);
    return activity({
      title: definition.title,
      prompt: `${definition.question}${definition.rule === "no-adjacent" ? ` A rota deve usar exatamente ${2 + launch.variant} passos D e ${2 - launch.variant} passos C.` : ""}`,
      initialState: countInitial(launch),
      answerLabel: "Quantidade de casos ou fichas",
      explanation:
        "Descreva como organizou a contagem e por que nenhum caso foi repetido ou esquecido.",
    });
  },
  summarize: (launch, raw) => summarizeCount(launch, parseCount(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseCount(launch, raw);
    const definition = countDefinition(launch);
    const expected = countExpected(launch, state);
    const summary = summarizeCount(launch, state);
    const explanation =
      state.kind === "drawers"
        ? countDefinition(launch).rule === "threshold"
          ? `${state.boxes} fichas ainda podem ocupar caixas diferentes. A ficha ${expected} força a primeira repetição.`
          : `Se todas as caixas tivessem menos de ${expected}, não caberiam as ${state.positions.length} fichas. Uma distribuição equilibrada atinge esse limite.`
        : `A enumeração completa tem ${expected} resultados permitidos. Casos proibidos e duplicatas ficam fora.`;
    const assessment = numberAssessment(answer, expected, summary, explanation);
    if ("selected" in state && (definition.requireList || state.selected.length > 0)) {
      const permitted = countCases(launch, state).filter((item) => item.allowed);
      if (
        state.selected.length !== permitted.length ||
        permitted.some((item) => !state.selected.includes(item.id))
      )
        return {
          ...assessment,
          correct: false,
          message: `Sua lista ainda inclui um caso proibido ou deixa um permitido de fora. ${explanation}`,
        };
    }
    if (state.kind === "drawers" && definition.requireSmallestMaximum) {
      const occupancies = Array.from(
        { length: state.boxes },
        (_, box) => state.positions.filter((position) => position === box).length,
      );
      if (Math.max(...occupancies) !== expected)
        return {
          ...assessment,
          correct: false,
          message: `Redistribua as fichas: ainda é possível reduzir a ocupação da caixa mais cheia. ${explanation}`,
        };
    }
    return assessment;
  },
};
export const combinatoricsTool: ToolModule = {
  family: "L12",
  modes: [...countingTool.modes, ...enumerationTool.modes],
  activity: (launch) =>
    (enumerationTool.modes.includes(launch.mode) ? enumerationTool : countingTool).activity(launch),
  parse: (launch, raw) =>
    (enumerationTool.modes.includes(launch.mode) ? enumerationTool : countingTool).parse(
      launch,
      raw,
    ),
  summarize: (launch, raw) =>
    (enumerationTool.modes.includes(launch.mode) ? enumerationTool : countingTool).summarize(
      launch,
      raw,
    ),
  assess: (launch, raw, answer) =>
    (enumerationTool.modes.includes(launch.mode) ? enumerationTool : countingTool).assess(
      launch,
      raw,
      answer,
    ),
};

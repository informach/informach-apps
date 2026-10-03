import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { activity, ensureMode, numberAssessment } from "./common";

export const enumerationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("digits"),
      count: z.number().int().min(2).max(6),
      width: z.number().int().min(1).max(4),
      repeat: z.boolean(),
      firstOdd: z.boolean(),
      lastEven: z.boolean(),
      required: z.number().int().min(-1).max(5),
      sum: z.number().int().min(-1).max(20),
    })
    .strict(),
  z.object({ kind: z.literal("seating"), count: z.number().int().min(3).max(6) }).strict(),
  z
    .object({
      kind: z.literal("quota"),
      boxes: z.number().int().min(2).max(12),
      quota: z.number().int().min(2).max(6),
      extra: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("subsets"),
      count: z.number().int().min(2).max(6),
      selected: z.array(z.string().max(6)).max(64),
    })
    .strict(),
  z
    .object({
      kind: z.literal("word"),
      word: z.enum(["AAB", "ARARA", "BANANA", "CASA"]),
      selected: z.array(z.string().max(6)).max(90),
    })
    .strict(),
  z
    .object({
      kind: z.literal("triple"),
      first: z.number().int().min(2).max(4),
      second: z.number().int().min(2).max(4),
      third: z.number().int().min(2).max(4),
    })
    .strict(),
  z.object({ kind: z.literal("relations"), links: z.array(z.boolean()).length(12) }).strict(),
]);
export type EnumerationState = z.infer<typeof enumerationSchema>;
export const enumerationDefinitions: Record<
  string,
  { title: string; question: string; kind: EnumerationState["kind"] }
> = {
  permutacoes: {
    title: "Todos os objetos em uma fila",
    kind: "seating",
    question:
      "Todos os objetos são diferentes e todos precisam participar. Quantas filas distintas existem? A ordem importa e nenhum objeto se repete.",
  },
  "algarismos-e-restricoes": {
    title: "Números com condições nos algarismos",
    kind: "digits",
    question:
      "Escolha as restrições e conte os números válidos. Números não começam por zero neste roteiro; uma condição adicional pode reduzir o conjunto até ficar vazio.",
  },
  "senhas-e-restricoes": {
    title: "Senhas, repetição e complementar",
    kind: "digits",
    question:
      "Uma senha admite zero à esquerda. Conte as senhas que respeitam as condições selecionadas. Compare exigir um algarismo com excluir todas as senhas que não o contêm.",
  },
  "filas-com-bloco": {
    title: "Duas pessoas precisam ficar juntas",
    kind: "seating",
    question:
      "Organize todas as filas sem repetição em que A e B estão lado a lado. Conte o bloco e não esqueça que A–B e B–A são ordens diferentes.",
  },
  "mesa-redonda": {
    title: "Girar a mesa não cria outra ordem",
    kind: "seating",
    question:
      "Quantas ordens circulares existem? Fixe A como referência para não contar rotações novamente. Reflexões ainda são ordens diferentes.",
  },
  "cota-nas-gavetas": {
    title: "Garantir mais que uma repetição",
    kind: "quota",
    question:
      "Quantas fichas garantem que alguma caixa tenha pelo menos a cota indicada? Construa primeiro o maior total que ainda evita a cota em todas as caixas.",
  },
  subconjuntos: {
    title: "Incluir ou não cada elemento",
    kind: "subsets",
    question:
      "Cada adesivo pode ser incluído ou deixado de fora, independentemente dos demais. Quantas seleções diferentes existem, incluindo a vazia? Marque todas as seleções para organizar a lista.",
  },
  "anagramas-com-repeticao": {
    title: "Letras iguais não criam novas palavras",
    kind: "word",
    question:
      "Troque as posições das letras sem mudar suas quantidades. Marque todas as palavras distintas e conte quantas existem. Não conte novamente uma palavra só porque duas letras iguais trocaram de lugar.",
  },
  "produto-tres-etapas": {
    title: "Uma árvore de três decisões",
    kind: "triple",
    question:
      "Um caminho escolhe uma ponte, uma trilha e uma saída. Quantos percursos completos existem? Uma escolha em cada etapa é obrigatória.",
  },
  "relacoes-contagem-dupla": {
    title: "Contar vínculos por linha ou coluna",
    kind: "relations",
    question:
      "Marque quais estudantes participam de quais clubes. Quantos vínculos estudante–clube existem? Conte por estudante e depois por clube; ambas as somas precisam contar os mesmos vínculos.",
  },
};
function definition(launch: ToolLaunch) {
  ensureMode(launch, "L12", Object.keys(enumerationDefinitions));
  const result = enumerationDefinitions[launch.mode];
  if (!result) throw new Error("Enumeração não publicada.");
  return result;
}
export function enumeratedCases(state: EnumerationState, mode = ""): string[] {
  if (state.kind === "digits") {
    const results: string[] = [];
    const visit = (values: number[]) => {
      if (values.length === state.width) {
        if (
          (mode === "algarismos-e-restricoes" && values[0] === 0) ||
          (state.firstOdd && (values[0] ?? 0) % 2 !== 1) ||
          (state.lastEven && (values.at(-1) ?? 0) % 2 !== 0) ||
          (state.required >= 0 && !values.includes(state.required)) ||
          (state.sum >= 0 && values.reduce((total, value) => total + value, 0) !== state.sum)
        )
          return;
        results.push(values.join(""));
        return;
      }
      for (let digit = 0; digit < state.count; digit++)
        if (state.repeat || !values.includes(digit)) visit([...values, digit]);
    };
    visit([]);
    return results;
  }
  if (state.kind === "seating") {
    const results: string[] = [];
    const visit = (word: string) => {
      if (word.length === state.count) {
        if (
          mode === "mesa-redonda"
            ? word[0] !== "A"
            : mode === "filas-com-bloco" && Math.abs(word.indexOf("A") - word.indexOf("B")) !== 1
        )
          return;
        results.push(word);
        return;
      }
      for (let number = 0; number < state.count; number++) {
        const letter = String.fromCharCode(65 + number);
        if (!word.includes(letter)) visit(word + letter);
      }
    };
    visit("");
    return results;
  }
  if (state.kind === "subsets")
    return Array.from(
      { length: 2 ** state.count },
      (_, mask) =>
        Array.from({ length: state.count }, (_, bit) =>
          mask & (2 ** bit) ? String.fromCharCode(65 + bit) : "",
        ).join("") || "∅",
    );
  if (state.kind === "word") {
    const cases = new Set<string>();
    const visit = (prefix: string, remaining: string) => {
      if (remaining.length === 0) cases.add(prefix);
      else
        for (let i = 0; i < remaining.length; i++)
          visit(prefix + remaining[i], remaining.slice(0, i) + remaining.slice(i + 1));
    };
    visit("", state.word);
    return [...cases].sort();
  }
  if (state.kind === "triple")
    return Array.from({ length: state.first }, (_, a) =>
      Array.from({ length: state.second }, (_, b) =>
        Array.from({ length: state.third }, (_, c) => `P${a + 1} → T${b + 1} → S${c + 1}`),
      ),
    ).flat(2);
  return [];
}
export function parseEnumeration(launch: ToolLaunch, raw: unknown) {
  const state = enumerationSchema.parse(raw);
  if (state.kind !== definition(launch).kind)
    throw new Error("Estado incompatível com a enumeração.");
  if (
    "selected" in state &&
    (new Set(state.selected).size !== state.selected.length ||
      state.selected.some((item) => !enumeratedCases(state).includes(item)))
  )
    throw new Error("Caso inexistente ou duplicado.");
  return state;
}
export function enumerationSummary(launch: ToolLaunch, state: EnumerationState) {
  return `${definition(launch).title}. ${state.kind === "quota" ? `${state.boxes} caixas; cota ${state.quota}; antes da garantia cabem ${state.boxes * (state.quota - 1)} fichas. Ficha extra: ${state.extra ? "sim" : "não"}.` : state.kind === "relations" ? `12 vínculos possíveis; ${state.links.filter(Boolean).length} marcados.` : `${enumeratedCases(state, launch.mode).length} resultados distintos enumerados.`}`;
}
export const enumerationTool: ToolModule = {
  family: "L12",
  modes: Object.keys(enumerationDefinitions),
  parse: parseEnumeration,
  activity: (launch) => {
    const config = definition(launch);
    const v = launch.variant;
    const initialState: EnumerationState =
      config.kind === "digits"
        ? {
            kind: "digits",
            count: 4 + v,
            width: 2 + v,
            repeat: false,
            firstOdd: false,
            lastEven: true,
            required: -1,
            sum: -1,
          }
        : config.kind === "seating"
          ? { kind: "seating", count: 4 + v }
          : config.kind === "quota"
            ? { kind: "quota", boxes: 3 + v, quota: 3 + v, extra: false }
            : config.kind === "subsets"
              ? { kind: "subsets", count: 3 + v, selected: [] }
              : config.kind === "word"
                ? { kind: "word", word: v === 0 ? "ARARA" : "BANANA", selected: [] }
                : config.kind === "triple"
                  ? { kind: "triple", first: 2 + v, second: 3, third: 2 }
                  : {
                      kind: "relations",
                      links: Array.from({ length: 12 }, (_, index) => (index + v) % 3 !== 0),
                    };
    return activity({
      title: config.title,
      prompt: config.question,
      initialState,
      answerLabel: "Quantidade",
    });
  },
  summarize: (launch, raw) => enumerationSummary(launch, parseEnumeration(launch, raw)),
  assess: (launch, raw, answer) => {
    const state = parseEnumeration(launch, raw);
    const expected =
      state.kind === "quota"
        ? state.boxes * (state.quota - 1) + 1
        : state.kind === "relations"
          ? state.links.filter(Boolean).length
          : enumeratedCases(state, launch.mode).length;
    const result = numberAssessment(
      answer,
      expected,
      enumerationSummary(launch, state),
      state.kind === "quota"
        ? `Cada caixa pode conter ${state.quota - 1} sem atingir a cota. A ficha seguinte garante a cota: ${state.boxes} × ${state.quota - 1} + 1 = ${expected}.`
        : state.kind === "relations"
          ? "Somar as linhas e somar as colunas conta cada vínculo uma vez em cada método."
          : `A lista completa contém ${expected} resultados distintos.`,
    );
    if ("selected" in state && state.selected.length !== expected)
      return {
        ...result,
        correct: false,
        message:
          "A lista marcada ainda deixa casos de fora. Confira também a seleção vazia quando ela fizer parte do espaço de escolhas.",
      };
    return result;
  },
};

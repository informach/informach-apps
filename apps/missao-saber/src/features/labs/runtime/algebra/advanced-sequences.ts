import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { formatNumber } from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const advancedSequenceModes = [
  "recorrencia-afim",
  "torres-de-hanoi",
  "blocos-repetidos",
  "figuras-por-regra",
  "maquinas-condicionais",
  "somas-por-termos",
  "maquina-inversa",
  "escadas-de-pecas",
];
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const advancedSequenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("stairs"),
      rows: integer(1, 10),
      first: integer(1, 4),
      step: integer(1, 3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inverse"),
      output: integer(-30, 50),
      multiplier: integer(1, 5),
      increment: integer(-10, 10),
      multiplyFirst: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("affine"),
      start: integer(-10, 20),
      multiplier: integer(-2, 3),
      increment: integer(-6, 8),
      steps: integer(0, 10),
    })
    .strict(),
  z
    .object({
      kind: z.literal("hanoi"),
      disks: integer(1, 6),
      moves: z.array(z.object({ from: integer(0, 2), to: integer(0, 2) }).strict()).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("block"),
      block: z.array(integer(0, 6)).min(2).max(7),
      position: integer(1, 200),
      alphabet: z.enum(["figures", "week"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("figures"),
      a: integer(0, 3),
      b: integer(-6, 8),
      c: integer(-6, 12),
      position: integer(1, 10),
    })
    .strict(),
  z
    .object({
      kind: z.literal("machine"),
      start: integer(1, 9999),
      steps: integer(0, 12),
      rule: z.enum(["collatz", "digit-sum"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sum"),
      count: integer(1, 15),
      rule: z.enum(["squares", "products", "odds", "multiples", "telescoping"]),
      factor: integer(1, 10),
    })
    .strict(),
]);
export type AdvancedSequenceState = z.infer<typeof advancedSequenceSchema>;
const kinds: Record<string, AdvancedSequenceState["kind"]> = {
  "recorrencia-afim": "affine",
  "torres-de-hanoi": "hanoi",
  "blocos-repetidos": "block",
  "figuras-por-regra": "figures",
  "maquinas-condicionais": "machine",
  "somas-por-termos": "sum",
  "maquina-inversa": "inverse",
  "escadas-de-pecas": "stairs",
};
export const blockFigures = [
  "círculo",
  "quadrado",
  "triângulo",
  "estrela",
  "losango",
  "coração",
  "hexágono",
];
export const weekdays = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
export function hanoiTowers(state: Extract<AdvancedSequenceState, { kind: "hanoi" }>): number[][] {
  const towers = [Array.from({ length: state.disks }, (_, i) => state.disks - i), [], []];
  for (const move of state.moves) {
    const source = towers[move.from],
      target = towers[move.to];
    if (!source || !target || move.from === move.to)
      throw new Error("Escolha duas hastes diferentes.");
    const disk = source.at(-1),
      top = target.at(-1);
    if (disk === undefined) throw new Error("A haste de partida está vazia.");
    if (top !== undefined && top < disk)
      throw new Error("Um disco maior não pode ficar sobre um menor.");
    source.pop();
    target.push(disk);
  }
  return towers;
}
export function parseAdvancedSequence(launch: ToolLaunch, raw: unknown): AdvancedSequenceState {
  assertMode(launch, "L09", advancedSequenceModes);
  const state = advancedSequenceSchema.parse(raw);
  if (kinds[launch.mode] !== state.kind)
    throw new Error("Esta montagem pertence a outro tipo de sequência.");
  if (state.kind === "hanoi") hanoiTowers(state);
  if (
    state.kind === "figures" &&
    Array.from({ length: 10 }, (_, i) => figureValue(state, i + 1)).some((value) => value < 0)
  )
    throw new Error("A regra precisa produzir quantidades não negativas nas posições 1 a 10.");
  if (
    state.kind === "figures" &&
    launch.grade <= 5 &&
    (state.b < 0 || state.c < 0 || (launch.grade <= 3 && state.a !== 0))
  )
    throw new Error(
      "Nesta faixa, use faixas e peças que são acrescentadas; nos primeiros anos o crescimento é por fileiras.",
    );
  if (launch.grade <= 5 && state.kind === "affine" && affineTrace(state).some((n) => n < 0))
    throw new Error("Nesta faixa, escolha uma regra que mantenha quantidades não negativas.");
  return state;
}
export function affineTrace(state: Extract<AdvancedSequenceState, { kind: "affine" }>): number[] {
  const values = [state.start];
  for (let step = 0; step < state.steps; step++)
    values.push((values.at(-1) ?? state.start) * state.multiplier + state.increment);
  return values;
}
export function conditionalTrace(
  state: Extract<AdvancedSequenceState, { kind: "machine" }>,
): number[] {
  const values = [state.start];
  for (let step = 0; step < state.steps; step++) {
    const previous = values.at(-1) ?? state.start;
    values.push(
      state.rule === "collatz"
        ? previous % 2 === 0
          ? previous / 2
          : 3 * previous + 1
        : String(previous)
            .split("")
            .reduce((sum, digit) => sum + Number(digit), 0),
    );
  }
  return values;
}
export function figureValue(state: Extract<AdvancedSequenceState, { kind: "figures" }>, n: number) {
  return state.a * n * n + state.b * n + state.c;
}
export function sumTerm(state: Extract<AdvancedSequenceState, { kind: "sum" }>, n: number) {
  if (state.rule === "squares") return n * n;
  if (state.rule === "products") return n * (n + 1);
  if (state.rule === "odds") return 2 * n - 1;
  if (state.rule === "telescoping") return 1 / (n * (n + 1));
  return state.factor * n;
}
export function sumValue(state: Extract<AdvancedSequenceState, { kind: "sum" }>) {
  if (state.rule === "telescoping") return state.count / (state.count + 1);
  return Array.from({ length: state.count }, (_, index) => sumTerm(state, index + 1)).reduce(
    (sum, term) => sum + term,
    0,
  );
}
export function advancedSequenceSummary(state: AdvancedSequenceState, grade = 12): string {
  switch (state.kind) {
    case "stairs":
      return `Escada com ${state.rows} fileiras. A primeira tem ${state.first} peças; cada nova fileira tem mais ${state.step}. Peças por fileira: ${Array.from({ length: state.rows }, (_, i) => state.first + i * state.step).join(", ")}.`;
    case "inverse":
      return `Número que saiu: ${state.output}. A máquina ${state.multiplyFirst ? `multiplica por ${state.multiplier} e soma ${state.increment}` : `soma ${state.increment} e multiplica por ${state.multiplier}`}. Para descobrir a entrada, desfaça a última operação primeiro.`;
    case "affine":
      return grade <= 7
        ? `Comece com ${state.start}. Em cada passo, multiplique por ${state.multiplier} e some ${state.increment}. ${state.steps} passos: ${affineTrace(state).join(" → ")}.`
        : `a₀=${state.start}; aₙ₊₁=${state.multiplier}aₙ+(${state.increment}). ${state.steps} passos: ${affineTrace(state).join(" → ")}.`;
    case "hanoi":
      return `${state.disks} discos; ${state.moves.length} movimentos legais. Hastes: ${hanoiTowers(
        state,
      )
        .map((tower, i) => `${i + 1}: ${tower.join(", ") || "vazia"}`)
        .join("; ")}. H(n)=2H(n−1)+1; H(0)=0.`;
    case "block":
      return `Bloco: ${state.block.map((index) => (state.alphabet === "week" ? weekdays : blockFigures)[index]).join(", ")}; posição ${state.position}, contada desde 1.`;
    case "figures":
      return grade <= 5
        ? `Posição ${state.position}: ${state.a} blocos quadrados com ${state.position} peças em cada lado, ${state.b} faixas de ${state.position} peças e ${state.c} peças fixas. Quantidades nas primeiras posições: ${Array.from({ length: 5 }, (_, i) => figureValue(state, i + 1)).join(", ")}.`
        : `Figura n: ${state.a}n²+(${state.b})n+(${state.c}); n=${state.position}. Quantidades: ${Array.from({ length: 5 }, (_, i) => figureValue(state, i + 1)).join(", ")}.`;
    case "machine":
      return `${state.rule === "collatz" ? "Par: dividir por 2; ímpar: triplicar e somar 1" : "Somar os algarismos decimais"}. ${state.steps} passos: ${conditionalTrace(state).join(" → ")}. Estes exemplos finitos não provam o comportamento para todos os naturais.`;
    case "sum":
      return `Soma de ${state.count} termos, regra ${{ squares: "quadrados", products: "produtos consecutivos", odds: "ímpares", multiples: "múltiplos", telescoping: "diferenças de frações" }[state.rule]}; termos ${Array.from({ length: state.count }, (_, i) => formatNumber(sumTerm(state, i + 1))).join(" + ")}. O novo termo é o da posição n+1.`;
  }
}
export const advancedSequencesTool: ToolModule = {
  family: "L09",
  modes: advancedSequenceModes,
  activity(launch) {
    assertMode(launch, "L09", advancedSequenceModes);
    const v = launch.variant;
    let state: AdvancedSequenceState, title: string, prompt: string;
    switch (launch.mode) {
      case "escadas-de-pecas":
        state = { kind: "stairs", rows: 4 + v, first: 1 + v, step: 1 };
        title = "Uma fileira de cada vez";
        prompt =
          "Monte uma escada de peças. A primeira fileira tem a quantidade indicada, e cada nova fileira ganha mais peças. Quantas peças há na escada inteira? Conte todas as fileiras, não apenas a última. Acrescente uma fileira e veja quanto o total aumenta.";
        break;
      case "maquina-inversa":
        state = {
          kind: "inverse",
          output: v ? 24 : 13,
          multiplier: v ? 3 : 2,
          increment: v ? 2 : 3,
          multiplyFirst: v === 0,
        };
        title = "Descubra o número que entrou";
        prompt =
          "A máquina fez duas operações e mostrou a saída. Qual número entrou? Volte pelo caminho: desfaça primeiro a última operação, usando subtração para desfazer adição e divisão para desfazer multiplicação.";
        break;
      case "recorrencia-afim":
        state = {
          kind: "affine",
          start: 1 + v,
          multiplier: 2,
          increment: v ? -1 : 1,
          steps: 4 + v,
        };
        title = "A saída volta para a máquina";
        prompt =
          "Comece em a₀ e aplique a mesma regra a cada passo. Qual é o valor depois da quantidade de passos escolhida? Compare multiplicar o anterior e somar uma constante com somar dois termos anteriores.";
        break;
      case "torres-de-hanoi":
        state = { kind: "hanoi", disks: 3 + v, moves: [] };
        title = "Uma torre, dois subproblemas";
        prompt =
          "Mova a torre da haste 1 para a 3: um disco por vez e nunca um maior sobre um menor. Qual é o número mínimo de movimentos? Antes de mover o maior, é preciso liberar os menores; depois, reconstruí-los sobre ele.";
        break;
      case "blocos-repetidos":
        state = {
          kind: "block",
          block: v ? [0, 1, 1] : [0, 0, 1],
          position: 11 + v,
          alphabet: "figures",
        };
        title = "O bloco pode repetir a mesma figura";
        prompt =
          "Monte o bloco que se repete e escolha uma posição, contando desde 1. Qual figura ou dia ocupa essa posição? Marque o bloco inteiro; uma figura repetida dentro dele não inicia automaticamente outro bloco.";
        break;
      case "figuras-por-regra":
        state = {
          kind: "figures",
          a: launch.grade <= 5 ? 0 : v ? 0 : 1,
          b: v ? 3 : 2,
          c: v ? 2 : 1,
          position: 4 + v,
        };
        title = "Quadrados, faixas e peças fixas";
        prompt =
          launch.grade <= 5
            ? "Construa uma figura com blocos quadrados, faixas que crescem e peças que ficam iguais. Quantas peças há na posição escolhida? Mude a posição e conte o que foi acrescentado. Compare figuras vizinhas e procure uma regra para continuar."
            : "Cada figura tem a·n² + b·n + c peças. Construa quadrados, faixas e peças fixas; valores negativos retiram peças. Quantas peças tem a posição indicada? Compare o crescimento linear (a=0) com o quadrático.";
        break;
      case "maquinas-condicionais":
        state = {
          kind: "machine",
          start: v ? 9876 : 6,
          steps: v ? 3 : 4,
          rule: v ? "digit-sum" : "collatz",
        };
        title = "A regra depende da entrada";
        prompt =
          "Aplique a regra indicada exatamente uma vez por passo. Qual é a saída depois dos passos escolhidos? Para a regra par/ímpar, escolha o ramo usando o número atual, não o inicial. Experimentar casos não prova que todos terminam em 1.";
        break;
      default:
        state = { kind: "sum", count: 4 + v, rule: v ? "products" : "squares", factor: 5 };
        title = "O que muda de S(n) para S(n+1)?";
        prompt =
          "Escolha uma família de termos e some até n. Qual é S(n)? Acompanhe as parcelas e a nova camada. Para justificar uma fórmula por indução, além da base, mostre que acrescentar o termo n+1 produz a fórmula seguinte.";
    }
    return activity(title, prompt, state, {
      answerHint:
        state.kind === "block"
          ? "Escreva o nome da figura ou do dia exibido na legenda."
          : "Decimais e frações são aceitos. A unidade já está no enunciado.",
      rubric: [
        "Identificar a unidade de repetição ou a regra aplicada ao estado anterior.",
        "Contar posições ou passos a partir do início indicado.",
        "Relacionar a mudança visível ao cálculo e explicar por que vale.",
      ],
    });
  },
  parse: parseAdvancedSequence,
  summarize(launch, raw) {
    return advancedSequenceSummary(parseAdvancedSequence(launch, raw), launch.grade);
  },
  assess(launch, raw, answer) {
    const state = parseAdvancedSequence(launch, raw),
      summary = advancedSequenceSummary(state, launch.grade);
    if (state.kind === "stairs")
      return numericChecked(
        answer,
        (state.rows * (2 * state.first + (state.rows - 1) * state.step)) / 2,
        "Junte as peças de todas as fileiras. Ao aumentar a escada, somente a nova fileira é acrescentada ao total anterior.",
        summary,
      );
    if (state.kind === "inverse")
      return numericChecked(
        answer,
        state.multiplyFirst
          ? (state.output - state.increment) / state.multiplier
          : state.output / state.multiplier - state.increment,
        "A ordem inversa importa: a operação feita por último deve ser desfeita primeiro. Confira passando sua entrada pela máquina de ida.",
        summary,
      );
    if (state.kind === "block") {
      const index = state.block[(state.position - 1) % state.block.length];
      const expected = (state.alphabet === "week" ? weekdays : blockFigures)[index ?? 0] ?? "";
      return checked(
        normalized(answer.trim().replace(/(?:-| )feira$/i, "")) === normalized(expected),
        expected,
        "Use o resto de posição − 1 pelo comprimento do bloco, pois a primeira posição tem deslocamento zero.",
        summary,
      );
    }
    const expected =
      state.kind === "affine"
        ? (affineTrace(state).at(-1) ?? state.start)
        : state.kind === "hanoi"
          ? 2 ** state.disks - 1
          : state.kind === "figures"
            ? figureValue(state, state.position)
            : state.kind === "machine"
              ? (conditionalTrace(state).at(-1) ?? state.start)
              : sumValue(state);
    return numericChecked(
      answer,
      expected,
      state.kind === "hanoi"
        ? "Liberar o maior exige H(n−1) movimentos, movê-lo exige 1 e reconstruir exige mais H(n−1). Isso dá H(n)=2H(n−1)+1."
        : state.kind === "sum"
          ? "A soma inclui todas as parcelas de 1 até n. S(n+1) difere de S(n) exatamente pelo próximo termo."
          : "Cada posição ou passo depende da regra declarada; uma mudança na regra exige refazer a cadeia.",
      summary,
    );
  },
};

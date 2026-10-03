import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { affineIdentity, formatNumber } from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const sequenceModes = [
  "testar-regras",
  "posicao-e-quantidade",
  "regra-com-exemplos",
  "termo-geral",
  "diferencas-ciclos-recorrencias",
  "maquina-de-instrucoes",
  "repetir-e-crescer",
  "posicao-distante",
  "ciclos",
  "quadros-e-figuras",
  "prever-e-explicar",
  "pa-termo",
  "pa-soma",
  "pg-termo-soma",
  "recorrencia",
  "modelos-crescimento",
  "casos-e-conjecturas",
  "processos",
  "padrao-repetido",
  "crescer-diminuir",
  "figuras-crescentes",
  "lacunas",
];
const sequenceRuleSchema = z.enum([
  "linear",
  "geometric",
  "recurrence",
  "squares",
  "cycle",
  "machine",
  "competing",
]);
export const sequenceStateSchema = z
  .object({
    rule: sequenceRuleSchema,
    start: z.number().int().min(-10).max(20),
    step: z.number().int().min(-6).max(8),
    ratio: z
      .number()
      .min(0.5)
      .max(3)
      .refine((value) => Number.isInteger(value * 2)),
    position: z.number().int().min(1).max(30),
    visible: z.number().int().min(3).max(12),
    second: z.number().int().min(0).max(10),
    period: z.number().int().min(2).max(5),
    multiplyFirst: z.boolean(),
    showSum: z.boolean(),
  })
  .strict();
export type SequenceState = z.infer<typeof sequenceStateSchema>;
export function ruleForMode(mode: string): SequenceState["rule"] {
  if (["pg-termo-soma", "modelos-crescimento"].includes(mode)) return "geometric";
  if (["recorrencia", "processos", "diferencas-ciclos-recorrencias"].includes(mode))
    return "recurrence";
  if (["padrao-repetido", "ciclos", "posicao-distante"].includes(mode)) return "cycle";
  if (["quadros-e-figuras", "figuras-crescentes"].includes(mode)) return "squares";
  if (["testar-regras", "casos-e-conjecturas"].includes(mode)) return "competing";
  if (mode === "maquina-de-instrucoes") return "machine";
  return "linear";
}
export function parseSequence(launch: ToolLaunch, raw: unknown) {
  assertMode(launch, "L09", sequenceModes);
  const state = sequenceStateSchema.parse(raw);
  if (state.rule !== ruleForMode(launch.mode))
    throw new Error("A regra não pertence a esta experiência.");
  if (state.rule === "recurrence" && state.start < 0)
    throw new Error("O processo usa quantidades não negativas.");
  if (state.rule === "squares" && state.start < 0)
    throw new Error("A quantidade de peças fixas acrescentadas ao quadrado não pode ser negativa.");
  if (
    launch.grade <= 5 &&
    (state.start < 0 ||
      state.start + (Math.max(state.position, state.visible) - 1) * state.step < 0) &&
    state.rule === "linear"
  )
    throw new Error("Nesta atividade inicial, a quantidade de peças não pode ficar negativa.");
  return state;
}
export function sequenceTerm(s: SequenceState, position: number, alternative = false): number {
  if (!Number.isInteger(position) || position < 1 || position > 30)
    throw new Error("A posição deve estar entre 1 e 30.");
  if (s.rule === "cycle") return (position - 1) % s.period;
  if (s.rule === "geometric") return s.start * s.ratio ** (position - 1);
  if (s.rule === "squares") return position ** 2 + s.start;
  if (s.rule === "machine")
    return s.multiplyFirst ? position * s.ratio + s.step : (position + s.step) * s.ratio;
  if (s.rule === "recurrence") {
    if (position === 1) return s.start;
    let a = s.start,
      b = s.second;
    for (let index = 2; index < position; index++) {
      [a, b] = [b, a + b];
    }
    return b;
  }
  const linear = s.start + (position - 1) * s.step;
  return s.rule === "competing" && alternative
    ? linear + (position - 1) * (position - 2) * (position - 3)
    : linear;
}
export function sequenceSum(s: SequenceState, count: number) {
  return Array.from({ length: count }, (_, index) => sequenceTerm(s, index + 1)).reduce(
    (sum, value) => sum + value,
    0,
  );
}
export const cycleNames = ["círculo", "quadrado", "triângulo", "estrela", "losango"];
export function sequenceFormula(s: SequenceState, grade = 12) {
  if (grade <= 7) {
    if (s.rule === "cycle") return `Repita o bloco inteiro de ${s.period} figuras.`;
    if (s.rule === "recurrence")
      return `Comece com ${s.start} e ${s.second}. Cada próxima quantidade junta as duas anteriores.`;
    if (s.rule === "squares")
      return `Em cada posição, faça um quadrado com esse número de peças em cada lado e acrescente ${s.start} peças fixas.`;
    if (s.rule === "geometric")
      return `Comece com ${s.start}. Em cada nova posição, multiplique a quantidade anterior por ${s.ratio}.`;
    if (s.rule === "machine")
      return s.multiplyFirst
        ? `Multiplique a entrada por ${s.ratio}; depois some ${s.step}.`
        : `Some ${s.step} à entrada; depois multiplique por ${s.ratio}.`;
    if (s.rule === "competing")
      return `A regra A começa em ${s.start} e muda ${s.step} a cada posição. A regra B acrescenta (posição−1)×(posição−2)×(posição−3).`;
    return `Comece com ${s.start}. Em cada nova posição, ${s.step < 0 ? `retire ${Math.abs(s.step)}` : `acrescente ${s.step}`}.`;
  }
  if (s.rule === "cycle") return `Ciclo de ${s.period} figuras, recomeçando depois da última.`;
  if (s.rule === "recurrence")
    return `a₁ = ${s.start}, a₂ = ${s.second}; aₙ = aₙ₋₁ + aₙ₋₂ para n ≥ 3.`;
  if (s.rule === "squares") return `aₙ = n² + ${s.start}.`;
  if (s.rule === "geometric") return `aₙ = ${s.start} × ${s.ratio}^(n − 1).`;
  if (s.rule === "machine")
    return s.multiplyFirst
      ? `Saída = n × ${s.ratio} + ${s.step}.`
      : `Saída = (n + ${s.step}) × ${s.ratio}.`;
  return `Regra A: aₙ = ${s.start} + (n − 1) × ${s.step}.${s.rule === "competing" ? " Regra B soma (n − 1)(n − 2)(n − 3) à regra A." : ""}`;
}
export function sequenceSummary(launch: ToolLaunch, s: SequenceState) {
  return `${sequenceFormula(s, launch.grade)} Posição investigada: ${s.position}. ${Array.from(
    { length: Math.min(s.visible, 6) },
    (_, index) => {
      const value = sequenceTerm(s, index + 1);
      return s.rule === "cycle" ? cycleNames[value] : formatNumber(value);
    },
  ).join(
    ", ",
  )}. ${launch.mode === "pa-soma" || s.showSum ? "A pergunta considera a soma até a posição investigada." : ""}`;
}
export const sequencesTool: ToolModule = {
  family: "L09",
  modes: sequenceModes,
  activity(launch) {
    assertMode(launch, "L09", sequenceModes);
    const rule = ruleForMode(launch.mode),
      v = launch.variant;
    const state: SequenceState = {
      rule,
      start: rule === "squares" ? v : 2 + v,
      step: 2 + v,
      ratio: 2 + v,
      position: 6 + v,
      visible: 6,
      second: 3 + v,
      period: 3 + v,
      multiplyFirst: v === 1,
      showSum: launch.mode === "pa-soma",
    };
    let prompt =
      rule === "cycle"
        ? "A sequência repete o bloco de figuras. Qual figura ocupará a posição indicada no controle? Conte as posições a partir de 1. Mude o comprimento do bloco e faça outra previsão."
        : rule === "competing"
          ? "Duas regras coincidem nas três primeiras posições. Qual será o valor da regra B na posição indicada? Um número finito de exemplos não determina uma única regra; investigue onde elas deixam de coincidir."
          : rule === "machine"
            ? "Passe a posição n pela máquina. Qual será a saída na entrada indicada? Troque a ordem entre somar e multiplicar e compare as duas saídas."
            : launch.mode === "pa-soma"
              ? "As barras representam os termos de uma PA. Qual é a soma desde a posição 1 até a posição indicada? Forme pares do primeiro com o último termo."
              : launch.mode === "pg-termo-soma"
                ? "Nesta PG, cada termo é multiplicado pela razão. Escolha “termo” ou “soma” no painel; calcule o termo da posição indicada ou a soma até ela. Investigue também a razão 1."
                : rule === "recurrence"
                  ? "Cada termo, a partir do terceiro, soma os dois anteriores. Qual é o termo da posição indicada? Modifique uma das duas sementes e acompanhe como a mudança se propaga."
                  : rule === "squares"
                    ? "A figura da posição n tem um quadrado de n por n peças, mais as peças fixas. Quantas peças tem a figura da posição indicada? Compare as diferenças entre figuras vizinhas."
                    : launch.mode === "termo-geral"
                      ? "Escreva uma regra para qualquer posição n da PA, contando desde 1. Use n, números, +, −, *, / e parênteses; por exemplo, 3 + (n-1)*2. Formas algébricas equivalentes são aceitas."
                      : launch.mode === "lacunas"
                        ? "Encontre o número escondido na posição indicada. Use a mesma diferença entre termos vizinhos e confira pelos dois lados da lacuna."
                        : rule === "geometric"
                          ? "A quantidade cresce pelo mesmo fator em cada etapa. Qual é o valor na posição indicada? Compare dobrar a quantidade com somar sempre uma quantidade fixa."
                          : "A sequência começa no valor inicial e muda pelo passo indicado. Qual é o termo da posição escolhida? Relacione a posição n com as n − 1 mudanças desde o começo.";
    if (launch.grade <= 7) {
      if (launch.mode === "pa-soma")
        prompt =
          "As barras mostram quantidades que crescem sempre pelo mesmo passo. Quantas peças há juntando todas as posições, da primeira até a indicada? Experimente formar pares da primeira com a última.";
      else if (launch.mode === "pg-termo-soma")
        prompt =
          "Em cada nova posição, multiplique a quantidade anterior pelo fator escolhido. Descubra a quantidade da posição indicada ou marque a opção para juntar todas as quantidades até ela. Compare multiplicar por 2 com acrescentar 2.";
      else if (rule === "linear" && launch.mode !== "termo-geral" && launch.mode !== "lacunas")
        prompt =
          "Comece com a quantidade indicada e faça sempre a mesma mudança. Qual quantidade aparece na posição escolhida? A primeira posição mostra o começo; para chegar à segunda, faça uma mudança.";
    }
    return activity(
      rule === "cycle"
        ? "O bloco que se repete"
        : rule === "squares"
          ? "Figuras que crescem"
          : rule === "competing"
            ? "Os exemplos não escolhem uma única regra"
            : rule === "machine"
              ? "Máquina de instruções"
              : "Posições, regras e termos",
      prompt,
      state,
      {
        answerKeys:
          rule === "cycle"
            ? undefined
            : launch.mode === "termo-geral"
              ? ["decimal", "fraction", "negative", "parentheses"]
              : ["decimal", "fraction", "negative"],
        choices: rule === "cycle" ? cycleNames : undefined,
        explanation:
          rule === "competing"
            ? "Por que concordar em três exemplos não prova que duas regras são iguais para toda posição?"
            : "Explique como o termo depende da posição e das regras escolhidas.",
        rubric: [
          "Usar posições a partir de 1.",
          "Relacionar cada representação com a regra declarada.",
          "Distinguir uma previsão apoiada na regra de uma prova de que ela é a única possível.",
        ],
      },
    );
  },
  parse: parseSequence,
  summarize(launch, raw) {
    return sequenceSummary(launch, parseSequence(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseSequence(launch, raw);
    const summary = sequenceSummary(launch, s);
    if (launch.mode === "termo-geral") {
      try {
        return checked(
          affineIdentity(answer.replace(/\bn\b/gi, "x"), s.step, s.start - s.step),
          `${s.start} + (n-1)*${s.step}`,
          "A comparação usa os coeficientes da expressão, não apenas exemplos. Há n − 1 passos desde o primeiro termo.",
          summary,
        );
      } catch (error) {
        return {
          correct: false,
          message: error instanceof Error ? error.message : "Regra inválida.",
          summary,
        };
      }
    }
    if (s.rule === "cycle") {
      const expected = cycleNames[sequenceTerm(s, s.position)] ?? "";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        `Use o resto de ${s.position} − 1 por ${s.period} para localizar a figura dentro do bloco.`,
        summary,
      );
    }
    const sum = launch.mode === "pa-soma" || (launch.mode === "pg-termo-soma" && s.showSum);
    const value = sum
      ? sequenceSum(s, s.position)
      : sequenceTerm(s, s.position, s.rule === "competing");
    return numericChecked(
      answer,
      value,
      sum
        ? "Some as quantidades desde a primeira, incluindo a posição final. Se cada etapa multiplica por 1, todas as quantidades ficam iguais."
        : s.rule === "competing"
          ? "A regra B acrescenta um produto que zera nas posições 1, 2 e 3, mas não nas seguintes. Coincidência inicial não demonstra igualdade geral."
          : `${sequenceFormula(s, launch.grade)} Use a posição solicitada.`,
      summary,
      0.00001,
    );
  },
};

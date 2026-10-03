import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { divisors, gcd, lcm, modularPower, modulo, primeFactors } from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const numberModes = [
  "classes-de-resto",
  "pares-e-restos",
  "invariante",
  "paridade",
  "classes-e-multiplos",
  "ciclos-e-algarismos",
  "quociente-e-resto",
  "divisibilidade",
  "aritmetica-modular",
  "multiplas-condicoes",
  "restos",
  "processos-invariantes",
  "primos-divisores",
  "mdc-mmc",
  "modulo-potencias",
  "digitos-bases",
  "inteiros",
  "invariantes",
];
export const numberStateSchema = z
  .object({
    n: z.number().int().min(0).max(240),
    divisor: z.number().int().min(2).max(16),
    modulus: z.number().int().min(2).max(12),
    exponent: z.number().int().min(0).max(16),
    other: z.number().int().min(1).max(120),
    base: z.number().int().min(2).max(16),
    step: z.number().int().min(1).max(12),
    count: z.number().int().min(0).max(24),
    findLcm: z.boolean(),
    remainderA: z.number().int().min(0).max(15),
    remainderB: z.number().int().min(0).max(11),
  })
  .strict();
export type NumberState = z.infer<typeof numberStateSchema>;
export function factorTreeSteps(n: number) {
  const primes = primeFactors(n);
  let remaining = n;
  return primes.slice(0, -1).map((factor) => {
    const value = remaining;
    remaining /= factor;
    return { value, factor, remaining };
  });
}
export const invariantModes = ["invariante", "processos-invariantes", "invariantes", "inteiros"];
export function parseNumber(launch: ToolLaunch, raw: unknown): NumberState {
  assertMode(launch, "L10", numberModes);
  const state = numberStateSchema.parse(raw);
  if (state.remainderA >= state.divisor || state.remainderB >= state.modulus)
    throw new Error("O resto deve ser menor que o divisor e não negativo.");
  if (["primos-divisores", "mdc-mmc"].includes(launch.mode) && state.n < 1)
    throw new Error("Fatoração e lista de divisores usam inteiros positivos neste modo.");
  if (["ciclos-e-algarismos", "modulo-potencias"].includes(launch.mode) && state.n === 0)
    throw new Error(
      "Neste modo de ciclos de potências, use uma base positiva para comparar também o expoente zero.",
    );
  return state;
}
export function simultaneousRemainder(s: NumberState): number | null {
  const period = lcm(s.divisor, s.modulus);
  for (let n = 0; n < period; n++)
    if (n % s.divisor === s.remainderA && n % s.modulus === s.remainderB) return n;
  return null;
}
export function modularOrbit(s: NumberState) {
  const values: number[] = [];
  let value = modulo(s.n, s.modulus);
  do {
    values.push(value);
    value = modulo(value + s.step, s.modulus);
  } while (value !== values[0]);
  return values;
}
export function numberSummary(launch: ToolLaunch, s: NumberState) {
  if (["paridade", "pares-e-restos"].includes(launch.mode))
    return `${s.n} objetos: ${Math.floor(s.n / 2)} pares completos e ${s.n % 2} objeto sem par. A pergunta investiga ${s.n}, que é ${s.n % 2 ? "ímpar" : "par"}.`;
  if (launch.mode === "digitos-bases")
    return `Número decimal ${s.n}; base ${s.base}; algarismos A até F representam 10 até 15 quando necessários.`;
  if (launch.mode === "primos-divisores")
    return `${s.n}: fatores primos ${s.n === 1 ? "nenhum (1 não é primo)" : primeFactors(s.n).join(" × ")}; divisores positivos ${divisors(s.n).join(", ")}.`;
  if (launch.mode === "mdc-mmc")
    return `Números ${s.n} e ${s.other}; investigar ${s.findLcm ? "mínimo múltiplo comum" : "máximo divisor comum"}.`;
  if (launch.mode === "multiplas-condicoes")
    return `Restos exigidos: ${s.remainderA} por ${s.divisor} e ${s.remainderB} por ${s.modulus}. Número de teste ${s.n}: restos ${s.n % s.divisor} e ${s.n % s.modulus}, respectivamente.`;
  if (["ciclos-e-algarismos", "modulo-potencias"].includes(launch.mode))
    return `Potência ${s.n}^${s.exponent}; divisor ${s.modulus}. O relógio representa o resto da potência, não o resto da base nem uma soma de passos.`;
  if (invariantModes.includes(launch.mode))
    return `Partida ${s.n}; alvo ${s.other}; operações permitidas: somar ou subtrair ${s.step}. Restos pela quantidade preservada ${s.step}: partida ${s.n % s.step}, alvo ${s.other % s.step}.`;
  if (["classes-e-multiplos", "aritmetica-modular"].includes(launch.mode))
    return `Começo ${s.n}; relógio com ${s.modulus} posições; ${s.count} passos de ${s.step}. Valor após os passos ${s.n + s.count * s.step}, posição no relógio ${modulo(s.n + s.count * s.step, s.modulus)}.`;
  return `${s.n} = ${s.divisor} × ${Math.floor(s.n / s.divisor)} + ${s.n % s.divisor}. Há ${Math.floor(s.n / s.divisor)} grupos completos de ${s.divisor} e resto ${s.n % s.divisor}, menor que o divisor.`;
}
export const numbersTool: ToolModule = {
  family: "L10",
  modes: numberModes,
  activity(launch) {
    assertMode(launch, "L10", numberModes);
    const v = launch.variant;
    const state: NumberState = {
      n: 23 + 12 * v,
      divisor: 5 + v,
      modulus: 6 + 2 * v,
      exponent: 4 + v,
      other: 18 + 6 * v,
      base: 2 + v,
      step: 2 + v,
      count: 3 + v,
      findLcm: v === 1,
      remainderA: 3,
      remainderB: 1,
    };
    const m = launch.mode;
    let prompt =
      "Agrupe a quantidade em grupos do tamanho indicado. Qual é o resto da divisão de n pelo divisor? O resto deve ser não negativo e menor que o divisor.";
    if (m === "paridade" || m === "pares-e-restos")
      prompt =
        "Distribua os objetos em pares. A quantidade atual n é par ou ímpar? Veja se sobra um objeto sem par.";
    if (m === "divisibilidade")
      prompt =
        "A quantidade n pode ser repartida em grupos completos do divisor escolhido, sem sobrar nada? Responda “sim” ou “não”.";
    if (m === "classes-e-multiplos")
      prompt =
        "No relógio modular, avance pelo passo escolhido. Quantos passos positivos são necessários para voltar pela primeira vez à posição inicial? Investigue a relação com MDC e múltiplos.";
    if (m === "ciclos-e-algarismos" || m === "modulo-potencias")
      prompt =
        "Calcule o resto de n elevado ao expoente indicado, usando o módulo escolhido. Acompanhe os restos das potências; não é necessário calcular uma potência enorme. Módulo 10 revela o algarismo das unidades.";
    if (m === "aritmetica-modular")
      prompt =
        "Comece em n e avance o número de passos indicado no relógio. Qual é a posição final? Cada volta completa vale zero no relógio modular.";
    if (m === "multiplas-condicoes")
      prompt =
        "Encontre o menor inteiro não negativo que deixa os dois restos indicados. Se as condições forem incompatíveis, escreva “nenhum”. O padrão se repete a cada MMC dos divisores.";
    if (invariantModes.includes(m))
      prompt =
        "Um processo começa em n e permite somar ou subtrair exatamente o passo escolhido, qualquer número inteiro de vezes. É possível chegar ao alvo indicado em “outro número”? Responda “sim” ou “não” e explique o resto que se conserva. A sequência de exemplos ajuda a investigar, mas não substitui o argumento geral.";
    if (m === "primos-divisores")
      prompt =
        "Monte a fatoração prima de n e observe os divisores positivos. Quantos divisores positivos diferentes n tem? Lembre que 1 tem exatamente um divisor e não é primo.";
    if (m === "mdc-mmc")
      prompt =
        "Escolha investigar o MDC ou o MMC dos dois números. Qual é o valor solicitado? Compare fatores comuns e fatores necessários para um múltiplo comum.";
    if (m === "digitos-bases")
      prompt =
        "Reagrupe o número decimal n na base escolhida. Escreva sua representação nessa base, sem prefixo. Em bases maiores que 10, use A=10, B=11, ..., F=15.";
    return activity(
      m === "digitos-bases"
        ? "Agrupar em outras bases"
        : m === "primos-divisores" || m === "mdc-mmc"
          ? "Fatores, divisores e múltiplos"
          : invariantModes.includes(m)
            ? "O resto que o processo conserva"
            : "Grupos e relógio de restos",
      prompt,
      state,
      {
        choices: ["paridade", "pares-e-restos"].includes(m)
          ? ["par", "ímpar"]
          : m === "divisibilidade" || invariantModes.includes(m)
            ? ["sim", "não"]
            : undefined,
        explanation:
          "Que propriedade explica o resultado para qualquer quantidade permitida, além dos exemplos observados?",
      },
    );
  },
  parse: parseNumber,
  summarize(launch, raw) {
    return numberSummary(launch, parseNumber(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseNumber(launch, raw),
      m = launch.mode,
      summary = numberSummary(launch, s);
    if (["paridade", "pares-e-restos"].includes(m)) {
      const expected = s.n % 2 ? "ímpar" : "par";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        `Há ${Math.floor(s.n / 2)} pares completos e sobra ${s.n % 2}.`,
        summary,
      );
    }
    if (m === "divisibilidade") {
      const expected = s.n % s.divisor === 0 ? "sim" : "não";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        `${s.n} = ${s.divisor} × ${Math.floor(s.n / s.divisor)} + ${s.n % s.divisor}. A divisibilidade exige resto zero.`,
        summary,
      );
    }
    if (m === "classes-e-multiplos")
      return numericChecked(
        answer,
        s.modulus / gcd(s.step, s.modulus),
        "O primeiro retorno acontece quando passos × tamanho do passo é múltiplo do módulo. O menor número de passos é módulo/MDC(passo, módulo).",
        summary,
      );
    if (["ciclos-e-algarismos", "modulo-potencias"].includes(m))
      return numericChecked(
        answer,
        modularPower(s.n, s.exponent, s.modulus),
        "Reduza o resto a cada multiplicação. Não suponha que todo ciclo de potências começa no expoente zero.",
        summary,
      );
    if (m === "aritmetica-modular")
      return numericChecked(
        answer,
        modulo(s.n + s.count * s.step, s.modulus),
        "Some os passos e retire as voltas completas, mantendo um resto entre zero e módulo − 1.",
        summary,
      );
    if (m === "multiplas-condicoes") {
      const value = simultaneousRemainder(s);
      return value === null
        ? checked(
            normalized(answer) === "nenhum",
            "nenhum",
            "Restos em módulos não coprimos precisam concordar módulo o MDC. Aqui essa compatibilidade falha.",
            summary,
          )
        : numericChecked(
            answer,
            value,
            "Confira as duas divisões. Buscar um período completo de comprimento MMC assegura encontrar a menor solução não negativa, quando existe.",
            summary,
          );
    }
    if (invariantModes.includes(m)) {
      const expected = modulo(s.other - s.n, s.step) === 0 ? "sim" : "não";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        `Somar ou subtrair ${s.step} conserva o resto por ${s.step}. O alvo é alcançável exatamente quando alvo − início é múltiplo do passo.`,
        summary,
      );
    }
    if (m === "primos-divisores")
      return numericChecked(
        answer,
        divisors(s.n).length,
        "Cada divisor corresponde a uma escolha dos expoentes dos fatores primos. Para n = 1, o único divisor é 1.",
        summary,
      );
    if (m === "mdc-mmc")
      return numericChecked(
        answer,
        s.findLcm ? lcm(s.n, s.other) : gcd(s.n, s.other),
        s.findLcm
          ? "O MMC reúne os maiores expoentes de cada primo das duas fatorações."
          : "O MDC reúne apenas fatores comuns, com seus menores expoentes.",
        summary,
      );
    if (m === "digitos-bases") {
      const expected = s.n.toString(s.base).toUpperCase();
      return checked(
        answer.trim().toUpperCase() === expected,
        expected,
        "Cada posição vale uma potência da base; cada algarismo deve ser menor que a base. Leia da maior potência para a unidade.",
        summary,
      );
    }
    return numericChecked(
      answer,
      s.n % s.divisor,
      "A quantidade é divisor × quociente + resto; o resto precisa ser menor que o divisor.",
      summary,
    );
  },
};

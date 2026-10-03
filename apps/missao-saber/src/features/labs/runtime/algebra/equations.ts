import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import {
  exactAnswer,
  formatNumber,
  numberSetAnswer,
  numericAnswer,
  quadraticRoots,
  systemSolution,
} from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const equationModes = [
  "traduzir-e-resolver",
  "dois-lados-e-parenteses",
  "modelar-e-interpretar",
  "sistemas-substituir-eliminar",
  "modelar",
  "comparar-pratos",
  "trocas-equivalentes",
  "ordenar-pesos",
  "peso-desconhecido",
  "numero-escondido",
  "termos-grau-coeficientes",
  "fatoracao-raizes",
  "divisao-e-resto",
  "girard",
  "identidades",
  "quadraticas-e-substituicao",
  "sistemas",
  "modulo-radicais-e-dominio",
  "exponenciais-logaritmos",
  "inequacoes",
  "massas",
];
const coefficient = z.number().int().min(-30).max(30);
export const equationStateSchema = z
  .object({
    a: coefficient,
    b: coefficient,
    c: coefficient,
    d: coefficient,
    e: coefficient,
    f: coefficient,
    p: z.number().int().min(-8).max(8),
    q: z.number().int().min(-8).max(8),
    probe: z.number().min(-30).max(30),
    added: z.number().int().min(-20).max(20),
    scale: z.number().int().min(1).max(6),
    domainKind: z.enum(["raiz", "modulo"]),
  })
  .strict();
export type EquationState = z.infer<typeof equationStateSchema>;
export const balanceModes = [
  "comparar-pratos",
  "trocas-equivalentes",
  "ordenar-pesos",
  "peso-desconhecido",
  "numero-escondido",
  "massas",
];
export const polynomialModes = [
  "termos-grau-coeficientes",
  "fatoracao-raizes",
  "divisao-e-resto",
  "girard",
  "identidades",
  "quadraticas-e-substituicao",
];
export const systemModes = ["sistemas-substituir-eliminar", "sistemas"];
export function parseEquation(launch: ToolLaunch, raw: unknown): EquationState {
  assertMode(launch, "L08", equationModes);
  const state = equationStateSchema.parse(raw);
  if (
    balanceModes.includes(launch.mode) &&
    (state.a < 1 || state.b < 0 || state.c < 0 || state.d < 0 || state.p < 1 || state.q < 1)
  )
    throw new Error("Uma massa física e a quantidade de objetos não podem ser negativas.");
  if (balanceModes.includes(launch.mode) && state.probe < 0)
    throw new Error("O teste de uma massa física não pode usar valor negativo.");
  if (
    ["peso-desconhecido", "numero-escondido"].includes(launch.mode) &&
    state.a !== state.c &&
    (state.d - state.b) / (state.a - state.c) < 0
  )
    throw new Error(
      "Essa igualdade exigiria massa negativa. Troque as quantidades para criar uma balança possível.",
    );
  if (launch.mode === "exponenciais-logaritmos" && (state.a < 2 || state.b <= 0))
    throw new Error("A base deve ser pelo menos 2, e o argumento deve ser positivo.");
  if (launch.mode === "inequacoes" && state.a === 0)
    throw new Error("O coeficiente de x não pode ser zero neste modo.");
  return state;
}
export function initialEquation(launch: ToolLaunch): EquationState {
  const v = launch.variant;
  const state: EquationState = {
    a: 2 + v,
    b: 3 + v,
    c: 0,
    d: 11 + 8 * v,
    e: 2,
    f: 10 + v * 4,
    p: 4 + v,
    q: 6 + v,
    probe: 1 + v,
    added: 0,
    scale: 1,
    domainKind: v ? "modulo" : "raiz",
  };
  if (systemModes.includes(launch.mode))
    return { ...state, a: 1, b: 1, c: 7 + v * 2, d: 1, e: -1, f: 1 };
  if (polynomialModes.includes(launch.mode))
    return { ...state, a: 1, b: -5 - v * 2, c: 6 + v * 6, p: 2 + v, q: 3 + v };
  if (launch.mode === "dois-lados-e-parenteses")
    return { ...state, a: 3 + v, b: 6, c: 1, d: 14 + v * 5 };
  if (launch.mode === "exponenciais-logaritmos") return { ...state, a: 2 + v, b: v ? 27 : 16 };
  if (launch.mode === "modulo-radicais-e-dominio") return { ...state, a: 5 + v, b: 3 + v };
  if (launch.mode === "inequacoes") return { ...state, a: v ? -2 : 2, b: 3, c: 11 };
  return state;
}
export function equationTitle(mode: string): string {
  const titles: Record<string, string> = {
    "traduzir-e-resolver": "Objetos viram uma equação",
    "dois-lados-e-parenteses": "A mesma operação nos dois lados",
    "modelar-e-interpretar": "O preço de cada viagem",
    modelar: "Monte um modelo e confira",
    "sistemas-substituir-eliminar": "Duas condições ao mesmo tempo",
    "comparar-pratos": "Qual prato pesa mais?",
    "trocas-equivalentes": "Trocas que conservam a massa",
    "ordenar-pesos": "Do mais leve ao mais pesado",
    "peso-desconhecido": "Quanto pesa a caixa?",
    "numero-escondido": "O número dentro da caixa",
    "termos-grau-coeficientes": "As peças de um polinômio",
    "fatoracao-raizes": "Produto, fatores e raízes",
    "divisao-e-resto": "Dividir por x − r",
    girard: "Raízes e coeficientes",
    identidades: "Um quadrado de lado x + p",
    "quadraticas-e-substituicao": "Encontre todas as raízes reais",
    sistemas: "Interseção de duas condições",
    "modulo-radicais-e-dominio": "Elevar ao quadrado exige conferir",
    "exponenciais-logaritmos": "Potência e logaritmo se correspondem",
    inequacoes: "A desigualdade pode mudar de sentido",
    massas: "Compare massas na balança",
  };
  return titles[mode] ?? "Balanças e álgebra";
}
export function equationPrompt(mode: string): string {
  if (mode === "comparar-pratos" || mode === "massas")
    return "Cada caixa azul tem a massa indicada no controle. Monte os dois pratos. Qual prato tem maior massa na montagem atual?";
  if (mode === "trocas-equivalentes")
    return "Uma caixa A tem massa p e uma caixa B tem massa q. Quantas caixas A equivalem à massa de uma B? Uma fração de caixa representa uma fração da massa.";
  if (mode === "ordenar-pesos")
    return "Compare a caixa A (massa p), a caixa B (massa q) e a caixa C (massa d). Qual é a mais pesada? Se duas ou mais empatarem na maior massa, escolha “empate”.";
  if (mode === "termos-grau-coeficientes")
    return "Altere os coeficientes das peças a·x² + b·x + c. Qual é o grau do polinômio atual? O polinômio nulo tem grau indefinido.";
  if (mode === "fatoracao-raizes")
    return "Construa (x − p)(x − q). Quais são as raízes reais distintas? Separe duas raízes por ponto e vírgula; se forem iguais, escreva apenas uma.";
  if (mode === "divisao-e-resto")
    return "Divida a·x² + b·x + c por x − p. Qual é o resto? Compare a divisão com a substituição de x por p.";
  if (mode === "girard")
    return "No polinômio (x − p)(x − q), qual é a soma das raízes, contando a multiplicidade? Compare com o coeficiente de x.";
  if (mode === "identidades")
    return "Monte as quatro regiões de (x + p)²: x², dois retângulos e p². Qual é o coeficiente de x depois de juntar os termos? Se p for negativo, interprete como identidade algébrica, sem área física negativa.";
  if (mode === "quadraticas-e-substituicao")
    return "Resolva a·x² + b·x + c = 0 nos reais. Separe raízes distintas por ponto e vírgula; use “nenhuma”, “todos” ou uma única raiz quando necessário. Para raízes irracionais, use 3 casas decimais.";
  if (systemModes.includes(mode))
    return "As duas linhas impõem condições a x e y. Descubra o par que serve nas duas. Escreva x; y, nessa ordem. Se não houver solução única, responda “nenhuma” ou “infinitas”.";
  if (mode === "modulo-radicais-e-dominio")
    return "Escolha √(x + a) = b ou |x + a| = b. Resolva nos reais. Raiz e módulo nunca são negativos; se b for negativo, escreva “nenhuma”. No módulo podem existir duas soluções: separe valores distintos por ponto e vírgula. Confira candidatos na equação original, sem ignorar o domínio.";
  if (mode === "exponenciais-logaritmos")
    return "Resolva aˣ = b. Observe que x = logₐ(b). Experimente bases e alvos positivos. Dê o expoente com até 3 casas decimais quando necessário.";
  if (mode === "inequacoes")
    return "Resolva a·x + b < c. Use “x < valor” ou “x > valor”. Ao dividir por um número negativo, o sentido se inverte. O ponto da fronteira não pertence à solução.";
  if (mode === "modelar-e-interpretar" || mode === "modelar")
    return "Um serviço cobra a por viagem mais uma taxa b; o outro cobra c por viagem mais uma taxa d. Para que quantidade x os custos ficam iguais? Discuta se a resposta faz sentido no contexto (viagens inteiras e não negativas).";
  return "Descubra x para que os dois lados tenham o mesmo valor. Use a mesma adição ou divisão nos dois lados e confira por substituição. Se a igualdade valer sempre, escreva “todos”; se for impossível, escreva “nenhuma”.";
}
export function equationSummary(launch: ToolLaunch, s: EquationState) {
  const mode = launch.mode;
  if (systemModes.includes(mode))
    return `${s.a}x + ${s.b}y = ${s.c}; ${s.d}x + ${s.e}y = ${s.f}. Teste atual: x = ${s.probe}.`;
  if (["fatoracao-raizes", "girard"].includes(mode))
    return `(x − ${s.p})(x − ${s.q}) = x² + ${-(s.p + s.q)}x + ${s.p * s.q}.`;
  if (mode === "identidades") return `(x + ${s.p})² = x² + ${2 * s.p}x + ${s.p ** 2}.`;
  if (polynomialModes.includes(mode))
    return `${s.a}x² + ${s.b}x + ${s.c}; divisor de teste x − ${s.p}; x de teste ${s.probe}.`;
  if (mode === "modulo-radicais-e-dominio")
    return s.domainKind === "raiz"
      ? `√(x + ${s.a}) = ${s.b}. Domínio x ≥ ${-s.a}. Candidato por quadrado: ${s.b ** 2 - s.a}.`
      : `|x + ${s.a}| = ${s.b}. Domínio real; distância não negativa até ${-s.a}.`;
  if (mode === "exponenciais-logaritmos")
    return `${s.a} elevado a x = ${s.b}; base positiva diferente de 1.`;
  if (mode === "inequacoes")
    return `${s.a}x + ${s.b} < ${s.c}; em x = ${s.probe}, lado esquerdo = ${s.a * s.probe + s.b}.`;
  if (["trocas-equivalentes", "ordenar-pesos"].includes(mode))
    return `Massas: A = ${s.p}, B = ${s.q}, C = ${s.d}.`;
  const value =
    balanceModes.includes(mode) && ["comparar-pratos", "massas"].includes(mode) ? s.p : s.probe;
  return `${s.a} caixas e ${s.b} unidades à esquerda; ${s.c} caixas e ${s.d} unidades à direita. Para x = ${value}, totais ${formatNumber(s.a * value + s.b)} e ${formatNumber(s.c * value + s.d)}. Ambos os lados receberam ${s.added} e foram divididos por ${s.scale}.`;
}
export const equationsTool: ToolModule = {
  family: "L08",
  modes: equationModes,
  activity(launch) {
    assertMode(launch, "L08", equationModes);
    const mode = launch.mode;
    return activity(equationTitle(mode), equationPrompt(mode), initialEquation(launch), {
      choices: ["comparar-pratos", "massas"].includes(mode)
        ? ["esquerdo", "direito", "equilibrados"]
        : mode === "ordenar-pesos"
          ? ["A", "B", "C", "empate"]
          : undefined,
      answerHint:
        systemModes.includes(mode) ||
        ["fatoracao-raizes", "quadraticas-e-substituicao"].includes(mode)
          ? "Use ponto e vírgula entre valores; cada valor pode ser uma fração ou decimal com vírgula."
          : undefined,
    });
  },
  parse: parseEquation,
  summarize(launch, raw) {
    return equationSummary(launch, parseEquation(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseEquation(launch, raw);
    const mode = launch.mode;
    const summary = equationSummary(launch, s);
    if (["comparar-pratos", "massas"].includes(mode)) {
      const left = s.a * s.p + s.b,
        right = s.c * s.p + s.d;
      const expected = left === right ? "equilibrados" : left > right ? "esquerdo" : "direito";
      return checked(
        normalized(answer) === expected,
        expected,
        `Compare as massas totais ${left} e ${right}, e não apenas o número de peças.`,
        summary,
      );
    }
    if (mode === "trocas-equivalentes")
      return checked(
        exactAnswer(answer, s.q, s.p),
        `${s.q}/${s.p}`,
        "A razão massa de B / massa de A dá a quantidade equivalente de caixas A.",
        summary,
      );
    if (mode === "ordenar-pesos") {
      const weights = [s.p, s.q, s.d],
        max = Math.max(...weights);
      const expected =
        weights.filter((weight) => weight === max).length > 1
          ? "empate"
          : (["A", "B", "C"][weights.indexOf(max)] ?? "");
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        "Compare as massas indicadas; a aparência ou a letra da caixa não determina qual pesa mais.",
        summary,
      );
    }
    if (mode === "termos-grau-coeficientes") {
      const degree = s.a !== 0 ? 2 : s.b !== 0 ? 1 : s.c !== 0 ? 0 : null;
      return checked(
        degree === null ? normalized(answer) === "indefinido" : numericAnswer(answer, degree),
        degree === null ? "indefinido" : String(degree),
        "O grau é o maior expoente com coeficiente não nulo. O polinômio nulo não tem grau definido aqui.",
        summary,
      );
    }
    if (mode === "fatoracao-raizes") {
      const roots = [...new Set([s.p, s.q])];
      return checked(
        numberSetAnswer(answer, roots),
        roots.join("; "),
        "Um produto é zero quando pelo menos um fator é zero.",
        summary,
      );
    }
    if (mode === "divisao-e-resto")
      return numericChecked(
        answer,
        s.a * s.p ** 2 + s.b * s.p + s.c,
        "O resto ao dividir por x − p é P(p). O quociente é a·x + (b + a·p).",
        summary,
      );
    if (mode === "girard")
      return numericChecked(
        answer,
        s.p + s.q,
        "A soma das raízes, com multiplicidade, é −b/a; o produto é c/a.",
        summary,
      );
    if (mode === "identidades")
      return numericChecked(
        answer,
        2 * s.p,
        "Os dois termos x·p se somam. O termo constante é p².",
        summary,
      );
    if (mode === "quadraticas-e-substituicao") {
      const all = s.a === 0 && s.b === 0 && s.c === 0;
      const roots = quadraticRoots(s.a, s.b, s.c);
      return checked(
        all
          ? normalized(answer) === "todos"
          : roots.length
            ? numberSetAnswer(answer, roots, 0.001)
            : normalized(answer) === "nenhuma",
        all ? "todos" : roots.length ? roots.map(formatNumber).join("; ") : "nenhuma",
        "Confira cada solução na expressão original. Discriminante negativo não produz raízes reais; coeficiente quadrático zero muda o tipo da equação.",
        summary,
      );
    }
    if (systemModes.includes(mode)) {
      const solution = systemSolution(s.a, s.b, s.c, s.d, s.e, s.f);
      if (!solution) {
        const invalidZero =
          (s.a === 0 && s.b === 0 && s.c !== 0) || (s.d === 0 && s.e === 0 && s.f !== 0);
        const infinite = !invalidZero && s.a * s.f === s.c * s.d && s.b * s.f === s.c * s.e;
        const expected = infinite ? "infinitas" : "nenhuma";
        return checked(
          normalized(answer) === expected,
          expected,
          "Linhas proporcionais podem representar a mesma condição ou condições incompatíveis. Verifique também equações do tipo 0 = número.",
          summary,
        );
      }
      const parts = answer.split(";");
      return checked(
        parts.length === 2 &&
          numericAnswer(parts[0] ?? "", solution.x) &&
          numericAnswer(parts[1] ?? "", solution.y),
        `${formatNumber(solution.x)}; ${formatNumber(solution.y)}`,
        "O par precisa satisfazer as duas equações, na ordem x; y.",
        summary,
      );
    }
    if (mode === "modulo-radicais-e-dominio") {
      if (s.b < 0)
        return checked(
          normalized(answer) === "nenhuma",
          "nenhuma",
          "Raiz quadrada e módulo nunca são negativos. Elevar ao quadrado não preserva essa restrição de sinal automaticamente.",
          summary,
        );
      if (s.domainKind === "modulo") {
        const roots = [...new Set([-s.a - s.b, -s.a + s.b])];
        return checked(
          numberSetAnswer(answer, roots),
          roots.join("; "),
          "|x + a| = b representa distância b até −a: são dois pontos quando b > 0 e um único ponto quando b = 0.",
          summary,
        );
      }
      return numericChecked(
        answer,
        s.b ** 2 - s.a,
        "O candidato deve estar no domínio x + a ≥ 0 e produzir a raiz não negativa b na equação original.",
        summary,
      );
    }
    if (mode === "exponenciais-logaritmos")
      return numericChecked(
        answer,
        Math.log(s.b) / Math.log(s.a),
        "O logaritmo responde qual expoente produz b a partir da base a. Aceitamos erro absoluto de até 0,001.",
        summary,
        0.001,
      );
    if (mode === "inequacoes") {
      const sign = s.a > 0 ? "<" : ">";
      const boundary = (s.c - s.b) / s.a;
      const parts = /^x\s*([<>])\s*(.+)$/i.exec(answer.trim());
      return checked(
        parts?.[1] === sign && numericAnswer(parts[2] ?? "", boundary),
        `x ${sign} ${formatNumber(boundary)}`,
        "Subtraia b e divida por a. Divisão por a negativo inverte o sentido. A fronteira fica aberta.",
        summary,
      );
    }
    const coefficient = s.a - s.c,
      constant = s.d - s.b;
    if (coefficient === 0) {
      const expected = constant === 0 ? "todos" : "nenhuma";
      return checked(
        normalized(answer) === expected,
        expected,
        "Ao retirar os termos iguais dos dois lados, veja se sobra uma igualdade verdadeira ou impossível.",
        summary,
      );
    }
    return checked(
      exactAnswer(answer, constant, coefficient),
      `${constant}/${coefficient}`,
      `A equação fica ${coefficient}x = ${constant}. Faça a mesma operação nos dois lados e confira o resultado na igualdade original.`,
      summary,
    );
  },
};

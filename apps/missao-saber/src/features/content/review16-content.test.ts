import { expect, it } from "vitest";
import { gradeAnswer } from "../learning/engine";
import { packLessons } from "./skill-factory";
import { skillPacks } from "./skills";

function choice(id: string) {
  const found = skillPacks
    .flatMap(packLessons)
    .flatMap((lesson) => lesson.items)
    .find((question) => question.id === id);
  if (!found || found.type !== "choice") throw new Error(`Choice question not found: ${id}`);
  return found;
}

// These are mathematical interpretations of the offered statements, independent
// of the configured answer. Historical distractors remain here so reintroducing
// a valid proof as a wrong option fails the regression.
function expectUniqueValidAnswer(id: string, interpretations: Map<string, boolean>) {
  const question = choice(id);
  let validAnswers = 0;
  for (const option of question.options) {
    const isSoundAnswer = interpretations.get(option);
    if (isSoundAnswer === undefined) throw new Error(`Missing answer interpretation: ${option}`);
    const result = gradeAnswer(question, option);
    expect(result.valid).toBe(true);
    expect(result.correct, option).toBe(isSoundAnswer);
    if (isSoundAnswer) validAnswers += 1;
  }
  expect(validAnswers).toBe(1);
}

it("offers one sufficient way to refute a universal claim", () => {
  // For integers, failure at infinitely many or at every n both imply failure
  // at some n. Successful examples, however numerous, cannot refute a claim.
  expectUniqueValidAnswer(
    "argumentacao-em-1-8",
    new Map([
      ["Exibir um n em que ela falha", true],
      ["Mostrar que falha para infinitos n", true],
      ["Mostrar que falha para todo n", true],
      ["Exibir um n em que ela funciona", false],
      ["Testar vários n em que ela funciona", false],
    ]),
  );
});

it("does not reject exhaustive parity cases as an invalid proof", () => {
  const patterns = Array.from({ length: 2 ** 5 }, (_, code) =>
    Array.from({ length: 5 }, (_, position) => (code >> position) & 1),
  );
  expect(patterns).toHaveLength(32);
  expect(new Set(patterns.map((pattern) => pattern.join(""))).size).toBe(32);
  expect(
    patterns.every((pattern) => pattern.some((parity, index) => pattern.indexOf(parity) < index)),
  ).toBe(true);
  // Comparing only the extremes does not establish repetition when the minimum
  // is odd and the maximum even; the middle numbers supply the repeated parity.
  expect(Math.min(1, 2, 3, 4, 6) % 2).not.toBe(Math.max(1, 2, 3, 4, 6) % 2);
  expectUniqueValidAnswer(
    "argumentacao-em-5-4",
    new Map([
      ["Gavetas: só há 2 paridades para 5 números", true],
      ["Listagem de todos os casos", true],
      ["Testar cinco quintetos e generalizar para todos", false],
      ["Comparar apenas o maior e o menor dos cinco números", false],
    ]),
  );
});

it("distinguishes a polynomial with three roots from the zero polynomial", () => {
  const question = choice("polinomios-1-8");
  const polynomial = (x: number) => x ** 3 - 6 * x ** 2 + 11 * x - 6;
  expect([1, 2, 3].map(polynomial)).toEqual([0, 0, 0]);
  expect(polynomial(0)).toBe(-6);
  expect(gradeAnswer(question, "x = 1 é raiz").correct).toBe(true);
  const result = gradeAnswer(question, "O polinômio é nulo");
  expect(result.valid).toBe(true);
  expect(result.correct).toBe(false);
  expect(result.explanation).not.toContain("Só um valor é zero");
  expect(result.explanation).toContain("p(0) = −6");
});

it("preserves basic needs when prioritizing a constrained household budget", () => {
  const question = choice("orcamento-n2-3-4");
  expect(question.prompt).toMatch(/alimentação.*remédios.*moradia/);
  expectUniqueValidAnswer(
    question.id,
    new Map([
      ["Preservar essenciais e negociar dívidas, adiando lazer", true],
      ["Pagar primeiro a maior dívida e usar a sobra nos essenciais", false],
      ["Dividir o dinheiro igualmente entre todas as despesas", false],
      ["Contas com corte ou juros, depois essenciais, depois lazer", false],
    ]),
  );
  const result = gradeAnswer(question, "Preservar essenciais e negociar dívidas, adiando lazer");
  expect(result.explanation).toMatch(/alimentação.*saúde.*moradia/);
  expect(result.explanation).toContain("risco de corte");
  expect(result.explanation).toContain("negociando");
});

it("states the common principal needed to compare one month of simple and compound interest", () => {
  const question = choice("modelos-financeiros-1-8");
  const principalText = question.prompt.match(/mesmo capital inicial de R\$ ([\d.]+)/)?.[1];
  if (!principalText) throw new Error("The comparison must supply one shared principal");
  const principal = Number(principalText.replaceAll(".", ""));
  expect(Number.isFinite(principal)).toBe(true);
  expect(question.prompt).toContain("Sem novos aportes, retiradas, impostos ou taxas");
  const simple = principal + principal * 0.01;
  const compound = principal * 1.01;
  expect(simple).toBeCloseTo(compound, 8);
  expect(gradeAnswer(question, "Os dois valem o mesmo").correct).toBe(true);
  // Equality of rates alone is insufficient when initial amounts differ.
  expect(100 + 100 * 0.01).not.toBeCloseTo(200 * 1.01, 8);
});

it("supplies the horse argument whose first induction step lacks an intersection", () => {
  const question = choice("inducao-2-7");
  expect(question.prompt).toContain("primeiros k");
  expect(question.prompt).toContain("últimos k");
  expect(question.prompt).toContain("em comum");
  const intersectionSize = (k: number) => {
    const horses = Array.from({ length: k + 1 }, (_, index) => index);
    const first = horses.slice(0, k);
    const last = horses.slice(1);
    return first.filter((horse) => last.includes(horse)).length;
  };
  expect(intersectionSize(1)).toBe(0);
  expect(intersectionSize(2)).toBe(1);
  expect(intersectionSize(100)).toBe(99);
  expect(gradeAnswer(question, "Na passagem de k = 1 para k = 2").correct).toBe(true);
});

it("allows a ten-term comparison with no crossing", () => {
  const challenge = skillPacks.find((pack) => pack.id === "recorrencias")?.deepChallenge;
  if (!challenge) throw new Error("Recurrences challenge not found");
  const terms = Array.from({ length: 10 }, (_, index) => ({
    arithmetic: 100 + 100 * index,
    geometric: 100 * 1.01 ** index,
  }));
  expect(terms.every(({ arithmetic, geometric }) => geometric <= arithmetic)).toBe(true);
  expect(challenge.steps.some((step) => step.includes("se não houver"))).toBe(true);
  expect(challenge.rubric.some((criterion) => criterion.includes("ausência"))).toBe(true);
});

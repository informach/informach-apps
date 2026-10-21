import { expect, test } from "vitest";
import { identityTransform } from "../model";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  setBehaviorInput,
} from "./engine";
import { evaluateFormula, type FormulaExpression } from "./formulas";
import { formatFormula, parseFormulaText } from "./formulaText";
import { type Behavior, emptyBehavior, semanticValue } from "./model";

const objects = new Map([["node-a", { tag: "rect", transform: identityTransform() }]]);
function behavior(formulas: { inputId: string; text: string }[]): Behavior {
  return {
    ...emptyBehavior(),
    inputs: [
      { id: "input-points", name: "Pontos", kind: "number", min: 0, max: 100, initial: 10 },
      { id: "input-double", name: "Dobro", kind: "number", min: 0, max: 150, initial: 0 },
      { id: "input-done", name: "Fim", kind: "boolean", initial: false },
      { id: "input-label", name: "Rótulo", kind: "string", initial: "" },
      { id: "input-wave", name: "Onda", kind: "number", min: -1, max: 1, initial: 0 },
      { id: "input-go", name: "Ir", kind: "trigger" },
    ],
    formulas: formulas.map((formula, index) => ({
      id: `formula-${index}`,
      inputId: formula.inputId,
      expression: parseFormulaText(formula.text),
    })),
  };
}
const value = (expression: FormulaExpression, seconds = 0) =>
  evaluateFormula(expression, () => 0, seconds, semanticValue);

test("the authoring syntax compiles to a tree that formats back to the same tree", () => {
  for (const source of [
    "clamp($input-points * 2 + -3, 0, 100) >= 10 && !$input-done || falso",
    'se($input-done, texto("Fim: ", $input-points), "Jogando")',
    "max(1, piso(sen(tempo * 2) * 10), raiz(9)) % 4",
    "ruido(7, tempo) - -(2)",
  ]) {
    const tree = parseFormulaText(source);
    expect(parseFormulaText(formatFormula(tree))).toEqual(tree);
  }
  expect(() => parseFormulaText("eval(1)")).toThrow(/desconhecida: eval/);
  expect(() => parseFormulaText("1 +")).toThrow(/incompleta/);
  expect(() => parseFormulaText("clamp(1, 2)")).toThrow(/3 argumento/);
  expect(() => parseFormulaText("1 ; 2")).toThrow(/posição 3/);
  expect(() => parseFormulaText("ruido(1.5, tempo)")).toThrow(/semente inteira/);
});

test("evaluation is total: zero divisors and negative roots give 0, noise is bounded", () => {
  expect(value(parseFormulaText("5 / 0"))).toBe(0);
  expect(value(parseFormulaText("5 % 0"))).toBe(0);
  expect(value(parseFormulaText("raiz(-4)"))).toBe(0);
  expect(value(parseFormulaText('texto("Total: ", 1234.5, " ", verdadeiro)'))).toBe(
    "Total: 1.234,5 sim",
  );
  const samples = Array.from({ length: 200 }, (_, index) =>
    value(parseFormulaText("ruido(3, tempo)"), index * 0.137),
  );
  expect(samples.every((sample) => typeof sample === "number" && sample >= -1 && sample <= 1)).toBe(
    true,
  );
  expect(value(parseFormulaText("ruido(3, tempo)"), 4.2)).toBe(
    value(parseFormulaText("ruido(3, tempo)"), 4.2),
  );
  expect(value(parseFormulaText("ruido(3, tempo)"), 4.2)).not.toBe(
    value(parseFormulaText("ruido(4, tempo)"), 4.2),
  );
});

test("computed inputs follow writes and the clock, clamp to range and stay read-only", () => {
  const context = createBehaviorContext(
    behavior([
      { inputId: "input-label", text: 'se($input-double > 100, "Recorde", texto($input-double))' },
      { inputId: "input-double", text: "$input-points * 2" },
      { inputId: "input-wave", text: "sen(tempo)" },
    ]),
    [],
    objects,
  );
  let session = createBehaviorSession(context);
  // Dependency order: the label reads the double even though it is declared first.
  expect(session.inputs.get("input-double")).toBe(20);
  expect(session.inputs.get("input-label")).toBe("20");
  session = setBehaviorInput(context, session, "input-points", 90);
  expect(session.inputs.get("input-double")).toBe(150);
  expect(session.inputs.get("input-label")).toBe("Recorde");
  session = advanceBehavior(context, session, Math.PI / 2).session;
  expect(session.inputs.get("input-wave")).toBeCloseTo(1, 9);
  expect(() => setBehaviorInput(context, session, "input-double", 5)).toThrow(/somente leitura/);
});

test("formulas are type-checked, acyclic, bounded and the only writer of their input", () => {
  const refuse = (formulas: { inputId: string; text: string }[], message: RegExp, extra = {}) =>
    expect(() => createBehaviorContext({ ...behavior(formulas), ...extra }, [], objects)).toThrow(
      message,
    );
  refuse([{ inputId: "input-points", text: '"texto"' }], /produz text/);
  refuse([{ inputId: "input-done", text: "$input-points + verdadeiro" }], /espera number/);
  refuse([{ inputId: "input-points", text: "$input-go" }], /gatilhos/);
  refuse(
    [
      { inputId: "input-points", text: "$input-double" },
      { inputId: "input-double", text: "$input-points" },
    ],
    /ciclo/,
  );
  refuse(
    [
      { inputId: "input-points", text: "1" },
      { inputId: "input-points", text: "2" },
    ],
    /duas fórmulas/,
  );
  // Wide and shallow: 7×7×7 leaves (under the 1024-symbol text limit) stay far from the depth limit but exceed 256 nodes.
  const wide = (level: number): string =>
    level ? `min(${Array.from({ length: 7 }, () => wide(level - 1)).join(", ")})` : "1";
  refuse([{ inputId: "input-points", text: wide(3) }], /256 nós/);
  refuse([{ inputId: "input-double", text: "1" }], /somente leitura/, {
    listeners: [
      {
        id: "listener-x",
        targetId: "node-a",
        event: "activate",
        actions: [{ kind: "set-input", inputId: "input-double", value: 3 }],
      },
    ],
  });
});

test("a deeply nested document is refused before schema recursion", () => {
  let expression: unknown = { op: "number", value: 1 };
  for (let level = 0; level < 5000; level++) expression = { op: "negate", arg: expression };
  expect(() =>
    createBehaviorContext(
      { ...behavior([]), formulas: [{ id: "formula-deep", inputId: "input-points", expression }] },
      [],
      objects,
    ),
  ).toThrow(/profundidade estrutural/);
});

test("review fixes: list/colour targets refused, overflow saturates, text round-trips", () => {
  const listed: Behavior = {
    ...behavior([]),
    inputs: [
      ...behavior([]).inputs,
      {
        id: "input-mood",
        name: "Humor",
        kind: "enum",
        values: ["alegre", "triste"],
        initial: "alegre",
      },
    ],
    formulas: [
      { id: "formula-mood", inputId: "input-mood", expression: parseFormulaText('"zzz"') },
    ],
  };
  expect(() => createBehaviorContext(listed, [], objects)).toThrow(/listas e cores não/);
  // 255 nodes of products of 1e7: far beyond the double range, saturated then clamped.
  let product = "$input-points";
  for (let level = 0; level < 7; level++) product = `(${product}) * (${product})`;
  const context = createBehaviorContext(
    {
      ...behavior([]),
      inputs: behavior([]).inputs.map((input) =>
        input.id === "input-points" && input.kind === "number"
          ? { ...input, max: 1e7, initial: 1e7 }
          : input,
      ),
      formulas: [
        { id: "formula-big", inputId: "input-double", expression: parseFormulaText(product) },
      ],
    },
    [],
    objects,
  );
  expect(createBehaviorSession(context).inputs.get("input-double")).toBe(150);
  for (const source of ["0.0000001 + 1e-7", 'texto("a\nb", "\t", "aspas \\" e \\\\")']) {
    const tree = parseFormulaText(source);
    expect(parseFormulaText(formatFormula(tree))).toEqual(tree);
  }
  expect(value(parseFormulaText('texto("a\nb")'))).toBe("a\nb");
  expect(() => parseFormulaText('"\\q"')).toThrow(/escape inválido/);
});

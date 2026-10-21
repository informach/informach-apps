import { z } from "zod";
import { isXmlText } from "../xmlText";

/** Declarative, pure formulas: a typed expression tree evaluated by the
 * engine, never code. No I/O, no loops, no recursion beyond the bounded tree;
 * the only clock is the session time. Total semantics: division or modulo by
 * zero and square roots of negatives give 0, overflow saturates to the largest
 * finite number, and results outside a number input's range are clamped to it. */
export type FormulaExpression =
  | { op: "number"; value: number }
  | { op: "text"; value: string }
  | { op: "boolean"; value: boolean }
  | { op: "input"; inputId: string }
  | { op: "time" }
  | {
      op: "add" | "subtract" | "multiply" | "divide" | "modulo";
      left: FormulaExpression;
      right: FormulaExpression;
    }
  | { op: "min" | "max"; args: FormulaExpression[] }
  | {
      op: "abs" | "floor" | "ceil" | "round" | "sin" | "cos" | "sqrt" | "negate";
      arg: FormulaExpression;
    }
  | { op: "clamp"; value: FormulaExpression; min: FormulaExpression; max: FormulaExpression }
  | {
      op: "compare";
      operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
      left: FormulaExpression;
      right: FormulaExpression;
    }
  | { op: "and" | "or"; left: FormulaExpression; right: FormulaExpression }
  | { op: "not"; arg: FormulaExpression }
  | {
      op: "if";
      condition: FormulaExpression;
      ifTrue: FormulaExpression;
      ifFalse: FormulaExpression;
    }
  | { op: "concat"; args: FormulaExpression[] }
  | { op: "noise"; seed: number; arg: FormulaExpression };
const inputId = z.string().regex(/^[a-z]+-[\w-]{1,100}$/);
export const formulaExpressionSchema: z.ZodType<FormulaExpression> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.strictObject({ op: z.literal("number"), value: z.number().min(-1e7).max(1e7) }),
    z.strictObject({
      op: z.literal("text"),
      value: z.string().max(1000).refine(isXmlText, "Texto de fórmula inválido."),
    }),
    z.strictObject({ op: z.literal("boolean"), value: z.boolean() }),
    z.strictObject({ op: z.literal("input"), inputId }),
    z.strictObject({ op: z.literal("time") }),
    z.strictObject({
      op: z.enum(["add", "subtract", "multiply", "divide", "modulo"]),
      left: formulaExpressionSchema,
      right: formulaExpressionSchema,
    }),
    z.strictObject({
      op: z.enum(["min", "max"]),
      args: z.array(formulaExpressionSchema).min(2).max(8),
    }),
    z.strictObject({
      op: z.enum(["abs", "floor", "ceil", "round", "sin", "cos", "sqrt", "negate"]),
      arg: formulaExpressionSchema,
    }),
    z.strictObject({
      op: z.literal("clamp"),
      value: formulaExpressionSchema,
      min: formulaExpressionSchema,
      max: formulaExpressionSchema,
    }),
    z.strictObject({
      op: z.literal("compare"),
      operator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
      left: formulaExpressionSchema,
      right: formulaExpressionSchema,
    }),
    z.strictObject({
      op: z.enum(["and", "or"]),
      left: formulaExpressionSchema,
      right: formulaExpressionSchema,
    }),
    z.strictObject({ op: z.literal("not"), arg: formulaExpressionSchema }),
    z.strictObject({
      op: z.literal("if"),
      condition: formulaExpressionSchema,
      ifTrue: formulaExpressionSchema,
      ifFalse: formulaExpressionSchema,
    }),
    z.strictObject({
      op: z.literal("concat"),
      args: z.array(formulaExpressionSchema).min(1).max(8),
    }),
    z.strictObject({
      op: z.literal("noise"),
      seed: z.number().int().min(0).max(65535),
      arg: formulaExpressionSchema,
    }),
  ]),
);
export const formulaSchema = z.strictObject({
  id: z.string().regex(/^formula-[\w-]{1,100}$/),
  inputId,
  expression: formulaExpressionSchema,
});
export type Formula = z.infer<typeof formulaSchema>;
export type FormulaType = "number" | "text" | "boolean";
export const FORMULA_LIMITS = { formulas: 64, nodes: 256, depth: 16, totalNodes: 4096 } as const;

function children(expression: FormulaExpression): FormulaExpression[] {
  switch (expression.op) {
    case "number":
    case "text":
    case "boolean":
    case "input":
    case "time":
      return [];
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
    case "modulo":
    case "compare":
    case "and":
    case "or":
      return [expression.left, expression.right];
    case "min":
    case "max":
    case "concat":
      return expression.args;
    case "abs":
    case "floor":
    case "ceil":
    case "round":
    case "sin":
    case "cos":
    case "sqrt":
    case "negate":
    case "not":
    case "noise":
      return [expression.arg];
    case "clamp":
      return [expression.value, expression.min, expression.max];
    case "if":
      return [expression.condition, expression.ifTrue, expression.ifFalse];
  }
}
/** Nodes, depth and the inputs a formula reads. */
export function formulaShape(expression: FormulaExpression) {
  let nodes = 0,
    depth = 0;
  const reads = new Set<string>(),
    pending: [FormulaExpression, number][] = [[expression, 1]];
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    const [node, level] = entry;
    if (++nodes > FORMULA_LIMITS.nodes || level > FORMULA_LIMITS.depth)
      throw new Error(
        `Fórmula excede ${FORMULA_LIMITS.nodes} nós ou profundidade ${FORMULA_LIMITS.depth}.`,
      );
    depth = Math.max(depth, level);
    if (node.op === "input") reads.add(node.inputId);
    for (const child of children(node)) pending.push([child, level + 1]);
  }
  return { nodes, depth, reads };
}
/** Static types: a formula that type-checks cannot fail on a type at runtime. */
export function formulaType(
  expression: FormulaExpression,
  inputType: (id: string) => FormulaType,
): FormulaType {
  const expect = (node: FormulaExpression, type: FormulaType) => {
    const actual = formulaType(node, inputType);
    if (actual !== type) throw new Error(`Fórmula espera ${type} e recebeu ${actual}.`);
  };
  switch (expression.op) {
    case "number":
    case "time":
      return "number";
    case "text":
      return "text";
    case "boolean":
      return "boolean";
    case "input":
      return inputType(expression.inputId);
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
    case "modulo":
      expect(expression.left, "number");
      expect(expression.right, "number");
      return "number";
    case "min":
    case "max":
      for (const arg of expression.args) expect(arg, "number");
      return "number";
    case "abs":
    case "floor":
    case "ceil":
    case "round":
    case "sin":
    case "cos":
    case "sqrt":
    case "negate":
    case "noise":
      expect(expression.arg, "number");
      return "number";
    case "clamp":
      expect(expression.value, "number");
      expect(expression.min, "number");
      expect(expression.max, "number");
      return "number";
    case "compare": {
      const left = formulaType(expression.left, inputType);
      if (expression.operator !== "eq" && expression.operator !== "neq" && left !== "number")
        throw new Error("Comparação de ordem requer números.");
      expect(expression.right, left);
      return "boolean";
    }
    case "and":
    case "or":
      expect(expression.left, "boolean");
      expect(expression.right, "boolean");
      return "boolean";
    case "not":
      expect(expression.arg, "boolean");
      return "boolean";
    case "if": {
      expect(expression.condition, "boolean");
      const branch = formulaType(expression.ifTrue, inputType);
      expect(expression.ifFalse, branch);
      return branch;
    }
    case "concat":
      for (const arg of expression.args) formulaType(arg, inputType);
      return "text";
  }
}
/** Deterministic smooth 1D value noise in [-1, 1]. */
function noise(seed: number, x: number) {
  const hash = (cell: number) => {
    let value = Math.imul(cell ^ Math.imul(seed + 1, 0x9e3779b1), 0x85ebca6b);
    value ^= value >>> 13;
    value = Math.imul(value, 0xc2b2ae35);
    value ^= value >>> 16;
    return ((value >>> 0) / 0xffffffff) * 2 - 1;
  };
  const cell = Math.floor(x),
    fraction = x - cell,
    eased = fraction * fraction * (3 - 2 * fraction),
    a = hash(cell | 0),
    b = hash((cell + 1) | 0);
  return a + (b - a) * eased;
}
export type FormulaValue = number | string | boolean;
export function evaluateFormula(
  expression: FormulaExpression,
  read: (id: string) => FormulaValue,
  seconds: number,
  format: (value: FormulaValue) => string,
): FormulaValue {
  const number = (node: FormulaExpression) => {
      const value = evaluateFormula(node, read, seconds, format);
      if (typeof value !== "number") throw new Error("Fórmula com tipo incompatível.");
      return value;
    },
    // Saturating, never failing: overflow pins to the largest finite number and an
    // undefined result (∞ − ∞) is 0, so a type-checked formula always evaluates.
    finite = (value: number) =>
      Number.isNaN(value) ? 0 : Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, value));
  switch (expression.op) {
    case "number":
    case "text":
    case "boolean":
      return expression.value;
    case "input":
      return read(expression.inputId);
    case "time":
      return seconds;
    case "add":
      return finite(number(expression.left) + number(expression.right));
    case "subtract":
      return finite(number(expression.left) - number(expression.right));
    case "multiply":
      return finite(number(expression.left) * number(expression.right));
    case "divide": {
      const right = number(expression.right);
      return right === 0 ? 0 : finite(number(expression.left) / right);
    }
    case "modulo": {
      const right = number(expression.right);
      return right === 0 ? 0 : finite(number(expression.left) % right);
    }
    case "min":
      return Math.min(...expression.args.map(number));
    case "max":
      return Math.max(...expression.args.map(number));
    case "abs":
      return Math.abs(number(expression.arg));
    case "floor":
      return Math.floor(number(expression.arg));
    case "ceil":
      return Math.ceil(number(expression.arg));
    case "round":
      return Math.round(number(expression.arg));
    case "sin":
      return Math.sin(number(expression.arg));
    case "cos":
      return Math.cos(number(expression.arg));
    case "sqrt": {
      const value = number(expression.arg);
      return value < 0 ? 0 : Math.sqrt(value);
    }
    case "negate":
      return -number(expression.arg);
    case "clamp": {
      const low = number(expression.min),
        high = number(expression.max);
      return Math.min(Math.max(number(expression.value), Math.min(low, high)), Math.max(low, high));
    }
    case "compare": {
      const left = evaluateFormula(expression.left, read, seconds, format),
        right = evaluateFormula(expression.right, read, seconds, format);
      if (expression.operator === "eq") return left === right;
      if (expression.operator === "neq") return left !== right;
      if (typeof left !== "number" || typeof right !== "number")
        throw new Error("Fórmula com tipo incompatível.");
      return expression.operator === "lt"
        ? left < right
        : expression.operator === "lte"
          ? left <= right
          : expression.operator === "gt"
            ? left > right
            : left >= right;
    }
    case "and":
      return (
        evaluateFormula(expression.left, read, seconds, format) === true &&
        evaluateFormula(expression.right, read, seconds, format) === true
      );
    case "or":
      return (
        evaluateFormula(expression.left, read, seconds, format) === true ||
        evaluateFormula(expression.right, read, seconds, format) === true
      );
    case "not":
      return evaluateFormula(expression.arg, read, seconds, format) !== true;
    case "if":
      return evaluateFormula(
        evaluateFormula(expression.condition, read, seconds, format) === true
          ? expression.ifTrue
          : expression.ifFalse,
        read,
        seconds,
        format,
      );
    case "concat":
      return expression.args
        .map((arg) => format(evaluateFormula(arg, read, seconds, format)))
        .join("")
        .slice(0, 10000);
    case "noise":
      return noise(expression.seed, number(expression.arg));
  }
}
/** Formulas in dependency order; a formula reading another computed input runs after it. */
export function orderFormulas(formulas: readonly Formula[]) {
  const byInput = new Map(formulas.map((formula) => [formula.inputId, formula])),
    ordered: Formula[] = [],
    state = new Map<string, "visiting" | "done">();
  const visit = (formula: Formula) => {
    const mark = state.get(formula.inputId);
    if (mark === "done") return;
    if (mark === "visiting") throw new Error("Fórmulas formam um ciclo entre inputs.");
    state.set(formula.inputId, "visiting");
    for (const id of formulaShape(formula.expression).reads) {
      const dependency = byInput.get(id);
      if (dependency) visit(dependency);
    }
    state.set(formula.inputId, "done");
    ordered.push(formula);
  };
  for (const formula of formulas) visit(formula);
  return ordered;
}

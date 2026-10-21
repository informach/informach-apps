import type { FormulaExpression } from "./formulas";

/** Authoring syntax for formulas, compiled to the stored expression tree:
 *   clamp($input-pontos * 2, 0, 100)    se($input-fim, "Acabou", "Jogando")
 * Numbers use a dot; texts use double quotes; inputs are $id; `tempo` is the
 * session time in seconds. Operators: + - * / % == != < <= > >= && || !.
 * Functions: min, max, clamp, abs, piso, teto, arredondar, sen, cos, raiz,
 * se, texto, ruido. Text is never evaluated as code. */
const FUNCTIONS: Record<string, string> = {
  min: "min",
  max: "max",
  clamp: "clamp",
  abs: "abs",
  piso: "floor",
  teto: "ceil",
  arredondar: "round",
  sen: "sin",
  cos: "cos",
  raiz: "sqrt",
  se: "if",
  texto: "concat",
  ruido: "noise",
};
const COMPARISONS: ReadonlyMap<string, "eq" | "neq" | "lt" | "lte" | "gt" | "gte"> = new Map([
  ["==", "eq"],
  ["!=", "neq"],
  ["<", "lt"],
  ["<=", "lte"],
  [">", "gt"],
  [">=", "gte"],
]);
const UNARY = ["abs", "floor", "ceil", "round", "sin", "cos", "sqrt"] as const;
type Token =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "input"; value: string }
  | { kind: "name"; value: string }
  | { kind: "symbol"; value: string };
function tokenize(source: string): Token[] {
  if (source.length > 4000) throw new Error("Fórmula excede 4000 caracteres.");
  const tokens: Token[] = [],
    pattern =
      /\s+|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|"((?:[^"\\]|\\.)*)"|\$([a-z]+-[\w-]{1,100})|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>!(),])/uy;
  while (pattern.lastIndex < source.length) {
    const at = pattern.lastIndex,
      match = pattern.exec(source);
    if (!match || match.index !== at)
      throw new Error(`Fórmula com símbolo inesperado na posição ${at + 1}.`);
    if (match[1] !== undefined) tokens.push({ kind: "number", value: Number(match[1]) });
    else if (match[2] !== undefined) {
      // JSON string semantics, as formatFormula writes them; raw line breaks are allowed.
      let value: unknown;
      try {
        value = JSON.parse(
          `"${match[2].replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`,
        );
      } catch {
        throw new Error(`Texto de fórmula com escape inválido na posição ${at + 1}.`);
      }
      if (typeof value !== "string") throw new Error("Texto de fórmula inválido.");
      tokens.push({ kind: "text", value });
    } else if (match[3] !== undefined) tokens.push({ kind: "input", value: match[3] });
    else if (match[4] !== undefined) tokens.push({ kind: "name", value: match[4] });
    else if (match[5] !== undefined) tokens.push({ kind: "symbol", value: match[5] });
    if (tokens.length > 1024) throw new Error("Fórmula excede 1024 símbolos.");
  }
  return tokens;
}
export function parseFormulaText(source: string): FormulaExpression {
  const tokens = tokenize(source);
  let index = 0;
  const peek = () => tokens[index],
    symbol = (value: string) => {
      const token = peek();
      if (token?.kind === "symbol" && token.value === value) {
        index++;
        return true;
      }
      return false;
    },
    expectSymbol = (value: string) => {
      if (!symbol(value)) throw new Error(`Fórmula espera "${value}".`);
    };
  const binary = (
    next: () => FormulaExpression,
    operators: Record<
      string,
      (left: FormulaExpression, right: FormulaExpression) => FormulaExpression
    >,
  ) => {
    let left = next();
    for (;;) {
      const token = peek(),
        build = token?.kind === "symbol" ? operators[token.value] : undefined;
      if (!build) return left;
      index++;
      left = build(left, next());
    }
  };
  const or = (): FormulaExpression =>
      binary(and, { "||": (left, right) => ({ op: "or", left, right }) }),
    and = (): FormulaExpression =>
      binary(comparison, { "&&": (left, right) => ({ op: "and", left, right }) }),
    comparison = (): FormulaExpression => {
      const left = sum(),
        token = peek(),
        operator = token?.kind === "symbol" ? COMPARISONS.get(token.value) : undefined;
      if (!operator) return left;
      index++;
      return { op: "compare", operator, left, right: sum() };
    },
    sum = (): FormulaExpression =>
      binary(product, {
        "+": (left, right) => ({ op: "add", left, right }),
        "-": (left, right) => ({ op: "subtract", left, right }),
      }),
    product = (): FormulaExpression =>
      binary(unary, {
        "*": (left, right) => ({ op: "multiply", left, right }),
        "/": (left, right) => ({ op: "divide", left, right }),
        "%": (left, right) => ({ op: "modulo", left, right }),
      }),
    unary = (): FormulaExpression => {
      if (symbol("-")) {
        const arg = unary();
        // A negative literal stays a number, so formatted text parses back to the same tree.
        return arg.op === "number" ? { op: "number", value: -arg.value } : { op: "negate", arg };
      }
      if (symbol("!")) return { op: "not", arg: unary() };
      return primary();
    },
    primary = (): FormulaExpression => {
      const token = peek();
      if (!token) throw new Error("Fórmula incompleta.");
      index++;
      if (token.kind === "number") return { op: "number", value: token.value };
      if (token.kind === "text") return { op: "text", value: token.value };
      if (token.kind === "input") return { op: "input", inputId: token.value };
      if (token.kind === "symbol") {
        if (token.value !== "(") throw new Error(`Fórmula com "${token.value}" fora de lugar.`);
        const inner = or();
        expectSymbol(")");
        return inner;
      }
      if (token.value === "verdadeiro") return { op: "boolean", value: true };
      if (token.value === "falso") return { op: "boolean", value: false };
      if (token.value === "tempo") return { op: "time" };
      const op = FUNCTIONS[token.value];
      if (!op) throw new Error(`Função de fórmula desconhecida: ${token.value}.`);
      expectSymbol("(");
      const args: FormulaExpression[] = [];
      if (!symbol(")")) {
        do args.push(or());
        while (symbol(","));
        expectSymbol(")");
      }
      const arity = (count: number) => {
        if (args.length !== count) throw new Error(`${token.value} espera ${count} argumento(s).`);
      };
      const [a, b, c] = args;
      if (op === "min" || op === "max") return { op, args };
      if (op === "concat") return { op, args };
      if (op === "clamp") {
        arity(3);
        if (!a || !b || !c) throw new Error("clamp incompleto.");
        return { op, value: a, min: b, max: c };
      }
      if (op === "if") {
        arity(3);
        if (!a || !b || !c) throw new Error("se incompleto.");
        return { op, condition: a, ifTrue: b, ifFalse: c };
      }
      if (op === "noise") {
        arity(2);
        if (a?.op !== "number" || !Number.isInteger(a.value) || !b)
          throw new Error("ruido espera uma semente inteira e um valor.");
        return { op, seed: a.value, arg: b };
      }
      arity(1);
      const single = UNARY.find((value) => value === op);
      if (!a || !single) throw new Error(`${token.value} incompleto.`);
      return { op: single, arg: a };
    };
  const expression = or();
  if (index !== tokens.length) throw new Error("Fórmula com símbolos sobrando no fim.");
  return expression;
}
const NAMES = Object.fromEntries(Object.entries(FUNCTIONS).map(([name, op]) => [op, name]));
const BINARY = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
  modulo: "%",
  and: "&&",
  or: "||",
} as const;
const COMPARE = { eq: "==", neq: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
/** Fully parenthesized text that parses back to the same tree. */
export function formatFormula(expression: FormulaExpression): string {
  switch (expression.op) {
    case "number":
      return String(expression.value);
    case "text":
      return JSON.stringify(expression.value);
    case "boolean":
      return expression.value ? "verdadeiro" : "falso";
    case "input":
      return `$${expression.inputId}`;
    case "time":
      return "tempo";
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
    case "modulo":
    case "and":
    case "or":
      return `(${formatFormula(expression.left)} ${BINARY[expression.op]} ${formatFormula(expression.right)})`;
    case "compare":
      return `(${formatFormula(expression.left)} ${COMPARE[expression.operator]} ${formatFormula(expression.right)})`;
    case "negate":
      return `-(${formatFormula(expression.arg)})`;
    case "not":
      return `!(${formatFormula(expression.arg)})`;
    case "min":
    case "max":
    case "concat":
      return `${NAMES[expression.op]}(${expression.args.map(formatFormula).join(", ")})`;
    case "abs":
    case "floor":
    case "ceil":
    case "round":
    case "sin":
    case "cos":
    case "sqrt":
      return `${NAMES[expression.op]}(${formatFormula(expression.arg)})`;
    case "clamp":
      return `clamp(${formatFormula(expression.value)}, ${formatFormula(expression.min)}, ${formatFormula(expression.max)})`;
    case "if":
      return `se(${formatFormula(expression.condition)}, ${formatFormula(expression.ifTrue)}, ${formatFormula(expression.ifFalse)})`;
    case "noise":
      return `ruido(${expression.seed}, ${formatFormula(expression.arg)})`;
  }
}

/** Small, bounded mathematical engine. No expression is evaluated as JavaScript. */
export type Fraction = { n: bigint; d: bigint };
const abs = (n: bigint) => (n < 0n ? -n : n);
const gcdBig = (a: bigint, b: bigint): bigint => (b === 0n ? abs(a) : gcdBig(b, a % b));
export function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("O denominador não pode ser zero.");
  const divisor = gcdBig(n, d);
  return { n: (d < 0n ? -n : n) / divisor, d: abs(d) / divisor };
}
export const addFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const multiplyFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
export const divideFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
export function readFraction(input: string): Fraction | null {
  const value = input.trim().replace(/−/g, "-").replace(/,/g, ".");
  if (value.length > 64) return null;
  const ratio = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value);
  if (ratio?.[1] && ratio[2])
    return BigInt(ratio[2]) === 0n ? null : fraction(BigInt(ratio[1]), BigInt(ratio[2]));
  const decimal = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value.replace(/^([+-]?)\./, "$10."));
  if (!decimal?.[2]) return null;
  const digits = decimal[3] ?? "";
  return fraction(
    BigInt(`${decimal[1] === "-" ? "-" : ""}${decimal[2]}${digits}`),
    10n ** BigInt(digits.length),
  );
}
export const fractionNumber = (value: Fraction) => Number(value.n) / Number(value.d);
export function numericAnswer(input: string, expected: number, tolerance = 1e-8) {
  const value = readFraction(input);
  return (
    value !== null &&
    Number.isFinite(expected) &&
    Math.abs(fractionNumber(value) - expected) <= tolerance
  );
}
export function exactAnswer(input: string, numerator: number, denominator = 1) {
  const value = readFraction(input);
  return value !== null && value.n * BigInt(denominator) === BigInt(numerator) * value.d;
}
export function numberSetAnswer(input: string, expected: number[], tolerance = 1e-8) {
  const tokens = input.split(/\s*[;]\s*/);
  const actual = tokens.map(readFraction);
  return (
    actual.length === expected.length &&
    actual.every((value) => value !== null) &&
    [...expected]
      .sort((a, b) => a - b)
      .every((value, index) => {
        const sorted = actual
          .filter((entry) => entry !== null)
          .map(fractionNumber)
          .sort((a, b) => a - b);
        return Math.abs(value - (sorted[index] ?? Number.NaN)) <= tolerance;
      })
  );
}
export const formatNumber = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export const modulo = (n: number, m: number) => ((n % m) + m) % m;
export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}
export const lcm = (a: number, b: number) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b));
export function primeFactors(n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || n > 1000000)
    throw new Error("Fatore um inteiro entre 1 e 1.000.000.");
  const factors: number[] = [];
  let remaining = n;
  for (let d = 2; d * d <= remaining; d++)
    while (remaining % d === 0) {
      factors.push(d);
      remaining /= d;
    }
  if (remaining > 1) factors.push(remaining);
  return factors;
}
export function divisors(n: number) {
  return Array.from({ length: n }, (_, index) => index + 1).filter((d) => n % d === 0);
}
export function modularPower(base: number, exponent: number, modulus: number) {
  if (!Number.isInteger(exponent) || exponent < 0 || !Number.isInteger(modulus) || modulus < 1)
    throw new Error("Expoente inteiro não negativo e módulo positivo são necessários.");
  let result = 1 % modulus;
  let factor = modulo(base, modulus);
  let power = exponent;
  while (power > 0) {
    if (power % 2) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    power = Math.floor(power / 2);
  }
  return result;
}
export function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  // This form avoids subtracting two nearly equal positive quantities.
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  return [q / a, c / q].sort((x, y) => x - y);
}
export function systemSolution(a: number, b: number, c: number, d: number, e: number, f: number) {
  const determinant = a * e - b * d;
  if (determinant === 0) return null;
  return { x: (c * e - b * f) / determinant, y: (a * f - c * d) / determinant };
}
export function triangleFromSides(a: number, b: number, c: number) {
  if (
    ![a, b, c].every((side) => Number.isFinite(side) && side > 0) ||
    a + b <= c ||
    a + c <= b ||
    b + c <= a
  )
    throw new Error(
      "Essas medidas não formam um triângulo: cada lado deve ser menor que a soma dos outros dois.",
    );
  const x = (b * b + c * c - a * a) / (2 * c);
  const height = Math.sqrt(Math.max(0, b * b - x * x));
  return {
    x,
    height,
    area: (c * height) / 2,
    angle:
      (Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b)))) * 180) / Math.PI,
  };
}

type Token =
  | { type: "number"; value: number; exact: Fraction }
  | { type: "name"; value: string }
  | { type: "symbol"; value: string };
function tokens(expression: string): Token[] {
  if (expression.length > 120) throw new Error("Use uma expressão de até 120 caracteres.");
  expression = expression.replace(/−/g, "-");
  const result: Token[] = [];
  let offset = 0;
  while (offset < expression.length) {
    const rest = expression.slice(offset);
    const spaces = /^\s+/.exec(rest);
    if (spaces) {
      offset += spaces[0].length;
      continue;
    }
    const number = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)/.exec(rest);
    if (number) {
      const exact = readFraction(number[0]);
      if (!exact) throw new Error("Use números de até 64 caracteres.");
      result.push({ type: "number", value: fractionNumber(exact), exact });
      offset += number[0].length;
      continue;
    }
    const name = /^[a-z]+/i.exec(rest);
    if (name) {
      result.push({ type: "name", value: name[0].toLowerCase() });
      offset += name[0].length;
      continue;
    }
    const symbol = rest[0];
    if (symbol && "+-*/^()".includes(symbol)) {
      result.push({ type: "symbol", value: symbol });
      offset++;
      continue;
    }
    throw new Error("Use números, x, +, −, *, /, ^, parênteses, sqrt, abs ou log.");
  }
  if (result.length > 80) throw new Error("A expressão tem operações demais.");
  return result;
}
type ExpressionNode =
  | { kind: "constant"; value: number; exact: Fraction }
  | { kind: "variable" }
  | { kind: "negative"; child: ExpressionNode }
  | { kind: "call"; name: "sqrt" | "abs" | "log"; child: ExpressionNode }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/" | "^";
      left: ExpressionNode;
      right: ExpressionNode;
    };
/** Parse the entire grammar before checking the domain at any particular point. */
export function parseExpression(expression: string): ExpressionNode {
  const input = tokens(expression);
  let index = 0;
  const is = (value: string) => input[index]?.value === value;
  const requireClose = () => {
    if (!is(")")) throw new Error("Falta fechar um parêntese.");
    index++;
  };
  function primary(): ExpressionNode {
    const token = input[index++];
    if (!token) throw new Error("A expressão está incompleta.");
    if (token.type === "number")
      return { kind: "constant", value: token.value, exact: token.exact };
    if (token.value === "(") {
      const value = sum();
      requireClose();
      return value;
    }
    if (token.type === "name") {
      if (token.value === "x") return { kind: "variable" };
      if ((token.value !== "sqrt" && token.value !== "abs" && token.value !== "log") || !is("("))
        throw new Error("Função desconhecida. Use sqrt, abs ou log, seguidos de parênteses.");
      index++;
      const child = sum();
      requireClose();
      return { kind: "call", name: token.value, child };
    }
    throw new Error("Esperava um número, x ou uma função.");
  }
  function power(): ExpressionNode {
    const base = primary();
    if (!is("^")) return base;
    index++;
    return { kind: "binary", operator: "^", left: base, right: unary() };
  }
  function unary(): ExpressionNode {
    if (is("+")) {
      index++;
      return unary();
    }
    if (is("-")) {
      index++;
      return { kind: "negative", child: unary() };
    }
    return power();
  }
  function product(): ExpressionNode {
    let value = unary();
    while (is("*") || is("/")) {
      const divide = is("/");
      index++;
      value = { kind: "binary", operator: divide ? "/" : "*", left: value, right: unary() };
    }
    return value;
  }
  function sum(): ExpressionNode {
    let value = product();
    while (is("+") || is("-")) {
      const subtract = is("-");
      index++;
      value = { kind: "binary", operator: subtract ? "-" : "+", left: value, right: product() };
    }
    return value;
  }
  const result = sum();
  if (index !== input.length) throw new Error("Separe as multiplicações por *. Exemplo: 2*x.");
  return result;
}
/** log means base 10; every subexpression must be in its real domain. */
export class ExpressionLimitError extends Error {}
export function evaluateExpression(expression: string, x: number): number {
  function evaluate(node: ExpressionNode): number {
    let result: number;
    if (node.kind === "constant") result = node.value;
    else if (node.kind === "variable") result = x;
    else if (node.kind === "negative") result = -evaluate(node.child);
    else if (node.kind === "call") {
      const value = evaluate(node.child);
      if (node.name === "sqrt" && value < 0)
        throw new Error("A raiz quadrada exige argumento não negativo.");
      if (node.name === "log" && value <= 0)
        throw new Error("O logaritmo exige argumento positivo.");
      result =
        node.name === "sqrt"
          ? Math.sqrt(value)
          : node.name === "log"
            ? Math.log10(value)
            : Math.abs(value);
    } else {
      const left = evaluate(node.left),
        right = evaluate(node.right);
      if (node.operator === "/" && right === 0)
        throw new Error("O denominador é zero nessa entrada.");
      if (node.operator === "^" && (!Number.isInteger(right) || Math.abs(right) > 12))
        throw new Error("Use expoentes inteiros entre −12 e 12.");
      if (node.operator === "^" && left === 0 && right <= 0)
        throw new Error("Zero não pode ter expoente nulo ou negativo neste laboratório.");
      result =
        node.operator === "+"
          ? left + right
          : node.operator === "-"
            ? left - right
            : node.operator === "*"
              ? left * right
              : node.operator === "/"
                ? left / right
                : left ** right;
    }
    if (!Number.isFinite(result) || Math.abs(result) > 1e12)
      throw new ExpressionLimitError("O resultado ultrapassa os limites desta ferramenta.");
    return result;
  }
  return evaluate(parseExpression(expression));
}
/** Structural affine equivalence: unlike a finite sample, coefficients prove identity within this grammar. */
function rationalAffineNode(node: ExpressionNode): { slope: Fraction; intercept: Fraction } {
  function visit(node: ExpressionNode): { slope: Fraction; intercept: Fraction } {
    if (node.kind === "constant") return { slope: fraction(0n), intercept: node.exact };
    if (node.kind === "variable") return { slope: fraction(1n), intercept: fraction(0n) };
    if (node.kind === "negative") {
      const value = visit(node.child);
      return {
        slope: fraction(-value.slope.n, value.slope.d),
        intercept: fraction(-value.intercept.n, value.intercept.d),
      };
    }
    if (node.kind !== "binary")
      throw new Error(
        "A regra geral desta atividade deve ser uma expressão afim, usando +, −, *, / e parênteses.",
      );
    const left = visit(node.left),
      right = visit(node.right);
    if (node.operator === "+" || node.operator === "-") {
      const sign = fraction(node.operator === "+" ? 1n : -1n);
      return {
        slope: addFraction(left.slope, multiplyFraction(sign, right.slope)),
        intercept: addFraction(left.intercept, multiplyFraction(sign, right.intercept)),
      };
    }
    if (node.operator === "*" && (left.slope.n === 0n || right.slope.n === 0n))
      return {
        slope: addFraction(
          multiplyFraction(left.slope, right.intercept),
          multiplyFraction(right.slope, left.intercept),
        ),
        intercept: multiplyFraction(left.intercept, right.intercept),
      };
    if (node.operator === "/" && right.slope.n === 0n && right.intercept.n !== 0n)
      return {
        slope: divideFraction(left.slope, right.intercept),
        intercept: divideFraction(left.intercept, right.intercept),
      };
    throw new Error(
      "Use somente operações que conservem uma expressão afim; não divida por zero nem por uma expressão com variável.",
    );
  }
  return visit(node);
}
function affineNode(node: ExpressionNode): { slope: number; intercept: number } {
  const exact = rationalAffineNode(node);
  const value = { slope: fractionNumber(exact.slope), intercept: fractionNumber(exact.intercept) };
  if (![value.slope, value.intercept].every(Number.isFinite))
    throw new Error("Coeficientes fora dos limites.");
  return value;
}
export function affineCoefficients(expression: string) {
  return affineNode(parseExpression(expression));
}
export function affineIdentity(expression: string, slope: number, intercept: number) {
  const actual = rationalAffineNode(parseExpression(expression));
  const expectedSlope = readFraction(String(slope)),
    expectedIntercept = readFraction(String(intercept));
  if (!expectedSlope || !expectedIntercept)
    throw new Error("Coeficientes de referência inválidos.");
  return (
    actual.slope.n * expectedSlope.d === expectedSlope.n * actual.slope.d &&
    actual.intercept.n * expectedIntercept.d === expectedIntercept.n * actual.intercept.d
  );
}
/** Custom graphs only accept affine arguments at domain boundaries, so every cut is known exactly. */
export function expressionDomainCuts(expression: string): number[] {
  const cuts: number[] = [];
  function boundary(node: ExpressionNode) {
    const { slope, intercept } = affineNode(node);
    if (slope !== 0) cuts.push(-intercept / slope);
  }
  function visit(node: ExpressionNode) {
    if (node.kind === "negative") visit(node.child);
    else if (node.kind === "call") {
      if (node.name !== "abs") boundary(node.child);
      visit(node.child);
    } else if (node.kind === "binary") {
      if (node.operator === "/") boundary(node.right);
      if (node.operator === "^") {
        const exponent = affineNode(node.right);
        if (
          exponent.slope !== 0 ||
          !Number.isInteger(exponent.intercept) ||
          Math.abs(exponent.intercept) > 12
        )
          throw new Error("No gráfico, o expoente deve ser um inteiro fixo entre −12 e 12.");
        if (exponent.intercept <= 0) boundary(node.left);
      }
      visit(node.left);
      visit(node.right);
    }
  }
  visit(parseExpression(expression));
  return [...new Set(cuts)].sort((a, b) => a - b);
}
export function expressionPoint(
  expression: string,
  x: number,
):
  | { value: number; error?: never; limit?: never }
  | { value?: never; error: string; limit: boolean } {
  try {
    return { value: evaluateExpression(expression, x) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Expressão inválida.",
      limit: error instanceof ExpressionLimitError,
    };
  }
}

import {
  addFraction,
  divideFraction,
  type Fraction,
  fraction,
  fractionNumber,
  multiplyFraction,
  readFraction,
} from "./math";
export const fractionText = (value: Fraction) =>
  value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
export function polynomialDegree(coefficients: number[]): number | null {
  for (let degree = coefficients.length - 1; degree >= 0; degree--) {
    if (coefficients[degree] !== 0) return degree;
  }
  return null;
}
export function polynomialValue(coefficients: number[], x: number): number {
  return coefficients.reduceRight((result, coefficient) => result * x + coefficient, 0);
}
export function polynomialText(coefficients: number[]): string {
  return (
    coefficients
      .map((coefficient, degree) => ({ coefficient, degree }))
      .reverse()
      .filter(({ coefficient }) => coefficient !== 0)
      .map(
        ({ coefficient, degree }, index) =>
          `${index ? (coefficient < 0 ? " − " : " + ") : coefficient < 0 ? "−" : ""}${Math.abs(coefficient)}${degree === 0 ? "" : degree === 1 ? "x" : `x^${degree}`}`,
      )
      .join("") || "0"
  );
}
function trim(coefficients: Fraction[]) {
  while (coefficients.length > 1 && coefficients.at(-1)?.n === 0n) coefficients.pop();
  return coefficients;
}
/** Coefficients are in ascending order. All long-division arithmetic is rational. */
export function polynomialDivision(
  dividend: number[],
  divisor: number[],
): { quotient: Fraction[]; remainder: Fraction[] } {
  const numerator = trim(dividend.map((value) => fraction(BigInt(value))));
  const denominator = trim(divisor.map((value) => fraction(BigInt(value))));
  const leading = denominator.at(-1);
  if (!leading || leading.n === 0n) throw new Error("O divisor polinomial não pode ser zero.");
  const quotient = Array.from(
    { length: Math.max(1, numerator.length - denominator.length + 1) },
    () => fraction(0n),
  );
  while (numerator.length >= denominator.length && numerator.some((value) => value.n !== 0n)) {
    const top = numerator.at(-1);
    if (!top) break;
    const power = numerator.length - denominator.length,
      factor = divideFraction(top, leading);
    quotient[power] = factor;
    denominator.forEach((coefficient, index) => {
      const old = numerator[power + index] ?? fraction(0n);
      const product = multiplyFraction(factor, coefficient);
      numerator[power + index] = addFraction(old, fraction(-product.n, product.d));
    });
    trim(numerator);
  }
  return { quotient: trim(quotient), remainder: trim(numerator) };
}
export function rationalPolynomialValue(coefficients: Fraction[], x: number): Fraction {
  const input = readFraction(String(x));
  if (!input) throw new Error("Entrada racional inválida.");
  return coefficients.reduceRight(
    (result, coefficient) => addFraction(multiplyFraction(result, input), coefficient),
    fraction(0n),
  );
}
export function rationalAnswer(answer: string, expected: Fraction) {
  const actual = readFraction(answer);
  return actual !== null && actual.n * expected.d === expected.n * actual.d;
}
export function factoredCoefficients(roots: number[], leading = 1): number[] {
  let coefficients = [leading];
  for (const root of roots) {
    const next = Array.from({ length: coefficients.length + 1 }, () => 0);
    coefficients.forEach((coefficient, power) => {
      next[power] = (next[power] ?? 0) - root * coefficient;
      next[power + 1] = (next[power + 1] ?? 0) + coefficient;
    });
    coefficients = next;
  }
  return coefficients;
}
export function rationalRootCandidates(coefficients: number[]): number[] {
  const degree = polynomialDegree(coefficients);
  if (degree === null || degree === 0) return [];
  const first = coefficients.findIndex((value) => value !== 0),
    constant = Math.abs(coefficients[first] ?? 0),
    leading = Math.abs(coefficients[degree] ?? 0);
  const divisors = (n: number) =>
    Array.from({ length: n }, (_, index) => index + 1).filter((d) => n % d === 0);
  const values = new Set<number>(first > 0 ? [0] : []);
  for (const numerator of divisors(constant))
    for (const denominator of divisors(leading)) {
      values.add(fractionNumber(fraction(BigInt(numerator), BigInt(denominator))));
      values.add(-fractionNumber(fraction(BigInt(numerator), BigInt(denominator))));
    }
  return [...values].sort((a, b) => a - b);
}

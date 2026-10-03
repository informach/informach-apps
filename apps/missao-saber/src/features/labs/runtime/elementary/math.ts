import type { ToolActivity, ToolAssessment, ToolLaunch, ToolState } from "../types";

export type Rational = { numerator: bigint; denominator: bigint };
type AnswerUnit = string | readonly string[];
function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
}
export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("O denominador não pode ser zero.");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (sign * numerator) / divisor, denominator: (sign * denominator) / divisor };
}
function decimal(value: string): Rational | null {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) return null;
  const normalized = value.replace(",", ".");
  const pieces = normalized.split(".");
  const places = pieces[1]?.length ?? 0;
  const digits = normalized.replace(".", "");
  return rational(BigInt(digits), 10n ** BigInt(places));
}
/** Small bounded decimal/fraction grammar; never evaluates student text as code. */
export function readRational(raw: string, unit?: AnswerUnit): Rational | null {
  let value = raw.trim();
  if (value.length === 0 || value.length > 80) return null;
  const units = typeof unit === "string" ? [unit] : (unit ?? []);
  const suffix = units.find((candidate) => value.endsWith(candidate));
  if (suffix) value = value.slice(0, -suffix.length).trim();
  const parts = value.split("/").map((part) => part.trim());
  if (parts.length === 1) return decimal(parts[0] ?? "");
  if (parts.length !== 2) return null;
  const numerator = decimal(parts[0] ?? "");
  const denominator = decimal(parts[1] ?? "");
  if (!numerator || !denominator || denominator.numerator === 0n) return null;
  return rational(
    numerator.numerator * denominator.denominator,
    numerator.denominator * denominator.numerator,
  );
}
export function equalRational(a: Rational, b: Rational): boolean {
  return a.numerator * b.denominator === b.numerator * a.denominator;
}
export function plusRational(a: Rational, b: Rational): Rational {
  return rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}
export function fractionText(value: Rational): string {
  return value.denominator === 1n
    ? `${value.numerator}`
    : `${value.numerator}/${value.denominator}`;
}
export function format(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
}
export function assessNumber(
  answer: string,
  expected: number,
  explanation: string,
  summary: string,
  unit?: AnswerUnit,
): ToolAssessment {
  const parsed = readRational(answer, unit);
  const value = parsed ? Number(parsed.numerator) / Number(parsed.denominator) : Number.NaN;
  const rounded = readRational(format(expected));
  const correct =
    parsed !== null &&
    (Number.isSafeInteger(expected)
      ? equalRational(parsed, rational(BigInt(expected)))
      : (rounded !== null && equalRational(parsed, rounded)) ||
        (Number.isFinite(value) && Math.abs(value - expected) <= 1e-10));
  const unitLabel = typeof unit === "string" ? unit : unit?.[0];
  return {
    correct,
    message: correct
      ? `Conferiu! ${explanation}`
      : `Revise a montagem. ${explanation} O valor é ${format(expected)}${unitLabel ? ` ${unitLabel}` : ""}.`,
    summary,
  };
}
export function assessFraction(
  answer: string,
  expected: Rational,
  explanation: string,
  summary: string,
  unit?: AnswerUnit,
): ToolAssessment {
  const parsed = readRational(answer, unit);
  const correct = parsed !== null && equalRational(parsed, expected);
  const unitLabel = typeof unit === "string" ? unit : unit?.[0];
  return {
    correct,
    message: correct
      ? `Conferiu! ${explanation}`
      : `Compare as partes com o inteiro. ${explanation} O valor é ${fractionText(expected)}${unitLabel ? ` ${unitLabel}` : ""}.`,
    summary,
  };
}
export function requireMode<T>(
  launch: ToolLaunch,
  family: ToolLaunch["family"],
  cases: Record<string, T>,
): T {
  const definition = cases[launch.mode];
  if (launch.family !== family || !definition)
    throw new Error("Este modo não pertence à ferramenta.");
  return definition;
}
export function activity(
  title: string,
  prompt: string,
  initialState: ToolState,
  answerLabel: string,
  details: Partial<ToolActivity> = {},
): ToolActivity {
  return {
    title,
    prompt,
    initialState,
    answerLabel,
    prediction:
      "Antes de mexer, o que você acha que vai acontecer? Pode escolher uma ideia ou fazer uma montagem.",
    observation: "Mude uma coisa de cada vez. O que mudou e o que ficou igual?",
    explanation: "Use sua montagem para explicar como você chegou à resposta.",
    rubric: [
      "A montagem representa os dados.",
      "A resposta combina com o que a montagem mostra.",
      "A explicação liga a ação ao resultado.",
    ],
    ...details,
  };
}

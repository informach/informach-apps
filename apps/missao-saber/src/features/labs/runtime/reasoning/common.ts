import type { ToolActivity, ToolAssessment, ToolLaunch } from "../types";

export function ensureMode(launch: ToolLaunch, family: string, modes: readonly string[]) {
  if (
    launch.family !== family ||
    !modes.includes(launch.mode) ||
    !Number.isInteger(launch.grade) ||
    launch.grade < 2 ||
    launch.grade > 12 ||
    (launch.variant !== 0 && launch.variant !== 1)
  ) {
    throw new Error("Experiência ou faixa escolar inválida.");
  }
}

export type NumberUnit = "number" | "money" | "percent" | "ratio";

/** Explicit units are interpreted only in the quantity requested by the activity. */
export function readNumber(answer: string, unit: NumberUnit = "number"): number | null {
  let text = answer.trim();
  if (unit === "money") {
    const currency = /^([+-]?)\s*R\$\s*/i.exec(text);
    if (currency) {
      text = text.slice(currency[0].length);
      if (currency[1] && /^[+-]/.test(text)) return null;
      text = `${currency[1]}${text}`;
    }
  }
  const percent = /%$/.test(text);
  if (percent && (unit === "percent" || unit === "ratio")) text = text.slice(0, -1).trim();
  const pieces = text.split("/").map((piece) => {
    const number = piece.trim();
    // A decimal comma makes Brazilian grouping unambiguous; a lone dot stays decimal.
    return unit === "money" && /^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(number)
      ? number.replaceAll(".", "")
      : number;
  });
  if (
    pieces.length > 2 ||
    pieces.some((piece) => !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(piece))
  )
    return null;
  const first = Number(pieces[0]?.replace(",", "."));
  const second = pieces.length === 2 ? Number(pieces[1]?.replace(",", ".")) : 1;
  const value = first / second / (percent && unit === "ratio" ? 100 : 1);
  return second !== 0 && Number.isFinite(value) ? value : null;
}

export function numberAssessment(
  answer: string,
  expected: number,
  summary: string,
  explanation: string,
  tolerance = 1e-8,
  unit: NumberUnit = "number",
): ToolAssessment {
  const value = readNumber(answer, unit);
  return {
    correct: value !== null && Math.abs(value - expected) <= tolerance,
    message:
      value === null
        ? "Use um número decimal ou uma fração, como 0,5 ou 1/2. A unidade já está indicada no campo."
        : Math.abs(value - expected) <= tolerance
          ? `Isso confere. ${explanation}`
          : `Vamos conferir a representação. ${explanation}`,
    summary,
  };
}

export function choiceAssessment(
  answer: string,
  expected: string,
  summary: string,
  explanation: string,
): ToolAssessment {
  const correct = answer.trim().toLocaleLowerCase("pt-BR") === expected.toLocaleLowerCase("pt-BR");
  return {
    correct,
    message: `${correct ? "Isso confere." : "Confira as condições."} ${explanation}`,
    summary,
  };
}

/** Accept the exact value or the stated final rounding, never an adjacent cent at a tie. */
export function roundedAssessment(
  answer: string,
  expected: number,
  summary: string,
  explanation: string,
  places = 2,
  unit: NumberUnit = "number",
): ToolAssessment {
  const rounded = Number(
    expected.toLocaleString("en-US", {
      useGrouping: false,
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }),
  );
  const value = readNumber(answer, unit);
  const target = value !== null && Math.abs(value - expected) <= 1e-8 ? expected : rounded;
  return numberAssessment(answer, target, summary, explanation, 1e-8, unit);
}

export function openAssessment(summary: string, criteria: readonly string[]): ToolAssessment {
  return {
    correct: null,
    message: `Esta resposta usa uma rubrica; não recebe um selo automático de prova correta. Revise: ${criteria.join("; ")}.`,
    summary,
  };
}

export function activity(
  details: Pick<ToolActivity, "title" | "prompt" | "initialState" | "answerLabel"> &
    Partial<ToolActivity>,
): ToolActivity {
  return {
    prediction: "Antes de mudar a montagem, o que você acha que vai acontecer?",
    observation: "Mude uma condição de cada vez. O que se manteve e o que mudou?",
    explanation: "Explique sua resposta usando a montagem e as condições da tarefa.",
    rubric: [
      "Identificar as condições",
      "Relacionar a representação com a resposta",
      "Conferir em outro caso",
    ],
    ...details,
  };
}

export function decimal(value: number, places = 2) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: places });
}

export function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fraction(numerator: number, denominator: number) {
  if (denominator === 0) return "não definida";
  let a = Math.abs(numerator);
  let b = Math.abs(denominator);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return `${numerator / (a || 1)}/${denominator / (a || 1)}`;
}

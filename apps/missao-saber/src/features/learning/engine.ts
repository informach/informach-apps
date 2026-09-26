import type { Item, SessionMode } from "../content/types";

export type Evidence = {
  itemId: string;
  skillId: string;
  familyId: string;
  correct: boolean;
  helpCount: number;
  createdAt: Date;
  mode: SessionMode;
  sessionId: string;
  result?: string | null;
};
export type SkillState = {
  skillId: string;
  level: "starting" | "building" | "independent";
  independentFamilies: number;
  attempts: number;
  dueAt: Date;
  lastCorrect: boolean;
};
const dayMs = 86_400_000;
const intervals = [1, 3, 7, 14, 30];

function spacedDue(rows: Evidence[]): Date {
  const days = new Map<string, Evidence[]>();
  for (const row of rows) {
    const key = localDay(row.createdAt);
    days.set(key, [...(days.get(key) ?? []), row]);
  }
  let stage = -1;
  let due = new Date(0);
  for (const day of days.values()) {
    const last = day[day.length - 1];
    if (!last) continue;
    const success = day.every((attempt) => attempt.correct && attempt.helpCount === 0);
    if (!success) {
      stage = 0;
      due = new Date(last.createdAt.getTime() + dayMs);
    } else if (last.createdAt >= due) {
      stage = Math.min(stage + 1, intervals.length - 1);
      due = new Date(last.createdAt.getTime() + (intervals[stage] ?? 1) * dayMs);
    }
  }
  return due;
}

export type AnswerResult = "correct" | "incorrect" | "skipped" | "reflection";
export type AnswerEvaluation = {
  valid: boolean;
  message?: string;
  result: AnswerResult;
  correct: boolean | null;
  explanation: string;
  solution?: string;
  rubric?: string[];
};

function rejected(message: string): AnswerEvaluation {
  return { valid: false, message, result: "incorrect", correct: false, explanation: "" };
}

type NumericReading = { form: "integer" | "decimal" | "fraction"; value: number };

/**
 * Leituras possíveis do que o estudante digitou, na ordem de preferência. No
 * Brasil o ponto separa milhares e a vírgula, decimais: "3.000", "1.757.600" e
 * "3.000,50" são lidos assim. Com um único grupo depois do ponto, "1.125"
 * também pode ser um decimal escrito com ponto, e as duas leituras valem.
 */
function parseNumeric(raw: string): NumericReading[] {
  const text = raw.replace(/−/g, "-").replace(/(\d)\s+(?=\d{3}(?!\d))/g, "$1");
  if (/^[+-]?\d+$/.test(text)) return [{ form: "integer", value: Number(text) }];
  const grouped = /^([+-]?[1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d+))?$/.exec(text);
  if (grouped?.[1]) {
    const integerPart = grouped[1].replaceAll(".", "");
    if (grouped[2] !== undefined)
      return [{ form: "decimal", value: Number(`${integerPart}.${grouped[2]}`) }];
    const readings: NumericReading[] = [{ form: "integer", value: Number(integerPart) }];
    if (grouped[1].split(".").length === 2)
      readings.push({ form: "decimal", value: Number(grouped[1]) });
    return readings;
  }
  if (/^[+-]?(?:\d+[.,]\d+|[.,]\d+)$/.test(text))
    return [{ form: "decimal", value: Number(text.replace(",", ".")) }];
  const fraction = /^([+-]?\d+)\/([+-]?\d+)$/.exec(text);
  if (!fraction) return [];
  const numerator = Number(fraction[1]);
  const denominator = Number(fraction[2]);
  if (!denominator) return [];
  return [{ form: "fraction", value: numerator / denominator }];
}

/** Valor esperado escrito como o estudante escreveria: "5.050", "1.310,4". */
function formatNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function numericAnswer(item: Extract<Item, { type: "numeric" }>, raw: string): AnswerEvaluation {
  let valueText = raw.trim().toLowerCase();
  const unit = item.grading.unit;
  let providedUnit = false;
  if (unit) {
    const aliases = [unit.symbol, ...unit.aliases].sort((a, b) => b.length - a.length);
    const matched = aliases.find((candidate) => {
      const normalized = candidate.trim().toLowerCase();
      return (
        valueText.endsWith(` ${normalized}`) ||
        (normalized.length === 1 && valueText.endsWith(normalized))
      );
    });
    if (matched) {
      valueText = valueText.slice(0, -matched.trim().length).trim();
      providedUnit = true;
    }
    if (unit.required && !providedUnit)
      return rejected(`Inclua a unidade ${unit.symbol} junto do valor.`);
  }
  const readings = parseNumeric(valueText).filter((reading) => Number.isFinite(reading.value));
  if (readings.length === 0)
    return rejected("Digite um inteiro, decimal ou fração simples, sem expressões.");
  const accepted = readings.filter((reading) => item.grading.acceptedForms.includes(reading.form));
  if (accepted.length === 0) return rejected("Use um dos formatos pedidos nesta atividade.");
  const matches = (reading: NumericReading) =>
    Math.abs(reading.value - item.grading.value) <= item.grading.tolerance;
  const parsed = accepted.find(matches) ?? accepted[0];
  if (!parsed) return rejected("Use um dos formatos pedidos nesta atividade.");
  const correct = matches(parsed);
  const solution = `${formatNumber(item.grading.value)}${unit ? ` ${unit.symbol}` : ""}`;
  if (correct)
    return { valid: true, result: "correct", correct, explanation: item.explanation, solution };
  /* Uma leitura equivocada autoral nomeia a etapa trocada. Sem ela, a direção
     do desvio ainda é uma informação verdadeira e específica, e não entrega o
     valor esperado. */
  const misread = item.misreads.find(
    (candidate) => Math.abs(parsed.value - candidate.value) <= item.grading.tolerance,
  );
  const direction = parsed.value > item.grading.value ? "acima" : "abaixo";
  return {
    valid: true,
    result: "incorrect",
    correct,
    explanation: misread
      ? misread.feedback
      : `Seu valor ficou ${direction} do esperado. ${item.explanation}`,
    solution,
  };
}

/**
 * Par de passos que o estudante trocou de lugar: `before` precisa vir antes de
 * `after`. Em `exact`, procura a primeira inversão em relação à ordem oficial;
 * em `precedence`, a primeira dependência desrespeitada. Nomear um par ensina a
 * relação sem revelar a sequência inteira.
 */
function orderingConflict(
  item: Extract<Item, { type: "ordering" }>,
  order: string[],
): { before: string; after: string } | null {
  if (item.grading.mode === "precedence") {
    const positions = new Map(order.map((id, index) => [id, index]));
    const violated = item.grading.constraints.find(
      ([before, after]) =>
        (positions.get(before) ?? Number.POSITIVE_INFINITY) >=
        (positions.get(after) ?? Number.NEGATIVE_INFINITY),
    );
    return violated ? { before: violated[0], after: violated[1] } : null;
  }
  const expected = new Map(item.grading.order.map((id, index) => [id, index]));
  for (let first = 0; first < order.length; first += 1)
    for (let second = first + 1; second < order.length; second += 1) {
      const left = order[first];
      const right = order[second];
      if (left === undefined || right === undefined) continue;
      if ((expected.get(left) ?? 0) > (expected.get(right) ?? 0))
        return { before: right, after: left };
    }
  return null;
}

function orderingAnswer(item: Extract<Item, { type: "ordering" }>, raw: string): AnswerEvaluation {
  let order: unknown;
  try {
    order = JSON.parse(raw);
  } catch {
    return rejected("A ordem enviada não pôde ser lida. Organize os passos novamente.");
  }
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string"))
    return rejected("A ordem precisa conter todos os passos da atividade.");
  const expectedIds = new Set(item.steps.map((step) => step.id));
  if (
    order.length !== expectedIds.size ||
    new Set(order).size !== order.length ||
    order.some((id) => !expectedIds.has(id))
  )
    return rejected("Use cada passo exatamente uma vez.");
  const positions = new Map(order.map((id, index) => [id, index]));
  const correct =
    item.grading.mode === "exact"
      ? item.grading.order.every((id, index) => order[index] === id)
      : item.grading.constraints.every(
          ([before, after]) =>
            (positions.get(before) ?? Number.POSITIVE_INFINITY) <
            (positions.get(after) ?? Number.NEGATIVE_INFINITY),
        );
  const conflict = correct ? null : orderingConflict(item, order);
  const label = (id: string) => item.steps.find((step) => step.id === id)?.label ?? id;
  return {
    valid: true,
    result: correct ? "correct" : "incorrect",
    correct,
    explanation: conflict
      ? `“${label(conflict.before)}” precisa vir antes de “${label(conflict.after)}”. ${item.explanation}`
      : item.explanation,
    solution:
      item.grading.mode === "exact"
        ? item.grading.order
            .map((id) => item.steps.find((step) => step.id === id)?.label ?? id)
            .join(" → ")
        : "Uma ordem que respeite todas as dependências descritas.",
  };
}

export function gradeAnswer(item: Item, answer: string): AnswerEvaluation {
  if (answer === "__skip__")
    return {
      valid: true,
      result: "skipped",
      correct: item.type === "justification" ? null : false,
      explanation: `Tudo bem ainda não saber. ${item.explanation}`,
    };
  switch (item.type) {
    case "choice": {
      if (!item.options.includes(answer)) return rejected("Escolha uma das respostas disponíveis.");
      const correct = answer === item.answer;
      return {
        valid: true,
        result: correct ? "correct" : "incorrect",
        correct,
        explanation: correct ? item.explanation : (item.misconceptions[answer] ?? item.explanation),
        solution: item.answer,
      };
    }
    case "numeric":
      return numericAnswer(item, answer);
    case "ordering":
      return orderingAnswer(item, answer);
    case "justification": {
      const response = answer.trim();
      if (response.length < item.response.minLength || response.length > item.response.maxLength)
        return rejected(
          `Escreva entre ${item.response.minLength} e ${item.response.maxLength} caracteres.`,
        );
      return {
        valid: true,
        result: "reflection",
        correct: null,
        explanation: item.explanation,
        solution: item.sampleResponse,
        rubric: item.rubric,
      };
    }
  }
}
export function skillStates(evidence: Evidence[]): SkillState[] {
  const firstSeen = new Map<string, Evidence>();
  for (const row of [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!firstSeen.has(row.itemId)) firstSeen.set(row.itemId, row);
  }
  const groups = new Map<string, Evidence[]>();
  for (const row of evidence) {
    if (row.mode === "diagnostic") continue;
    const group = groups.get(row.skillId) ?? [];
    group.push(row);
    groups.set(row.skillId, group);
  }
  return [...groups].map(([skillId, rows]) => {
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const families = new Set<string>();
    const seenItems = new Set<string>();
    const dates = new Set<string>();
    for (const row of rows) {
      if (
        row.correct &&
        row.helpCount === 0 &&
        !seenItems.has(row.itemId) &&
        firstSeen.get(row.itemId) === row
      ) {
        families.add(row.familyId);
        dates.add(localDay(row.createdAt));
      }
      seenItems.add(row.itemId);
    }
    const last = rows[rows.length - 1];
    if (!last) throw new Error("Empty evidence group");
    const independent = last.correct && last.helpCount === 0;
    return {
      skillId,
      independentFamilies: families.size,
      attempts: rows.length,
      level:
        independent && families.size >= 3 && dates.size >= 2
          ? "independent"
          : families.size > 0
            ? "building"
            : "starting",
      dueAt: spacedDue(rows),
      lastCorrect: last.correct,
    };
  });
}
export function localDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
/**
 * Distância em dias de calendário local, sem depender da hora do dia nem de
 * transições históricas de horário de verão — a mesma aritmética já usada em
 * `weeklyEvidence`.
 */
export function localDaysApart(from: Date, to: Date) {
  const start = Date.parse(`${localDay(from)}T00:00:00Z`);
  const end = Date.parse(`${localDay(to)}T00:00:00Z`);
  return Math.round((end - start) / dayMs);
}
export function weeklyEvidence(evidence: Evidence[], now: Date) {
  const today = localDay(now);
  // Arithmetic on date-only UTC values advances calendar dates, independent of
  // the instant's time of day and historical daylight-saving transitions.
  const firstDay = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * dayMs)
    .toISOString()
    .slice(0, 10);
  const rows = evidence.filter((row) => {
    const day = localDay(row.createdAt);
    return row.createdAt <= now && day >= firstDay && day <= today;
  });
  return {
    total: rows.length,
    correct: rows.filter((row) => row.correct).length,
    withHelp: rows.filter((row) => row.helpCount > 0).length,
    practiceDays: new Set(rows.map((row) => localDay(row.createdAt))).size,
    sessions: new Set(rows.map((row) => row.sessionId)).size,
  };
}

/**
 * Observed, current difficulties for the family report. A skill appears only
 * after objective errors in at least two study sessions during the last 28
 * calendar days. Skips are absence of evidence, and a later correct response
 * removes the active warning while the historical attempts remain stored.
 */
export function repeatedDifficulties(evidence: Evidence[], now: Date, windowDays = 28) {
  const today = localDay(now);
  const firstDay = new Date(Date.parse(`${today}T00:00:00Z`) - (windowDays - 1) * dayMs)
    .toISOString()
    .slice(0, 10);
  const groups = new Map<string, Evidence[]>();
  for (const row of evidence) {
    const day = localDay(row.createdAt);
    if (row.createdAt > now || day < firstDay || day > today) continue;
    const current = groups.get(row.skillId) ?? [];
    current.push(row);
    groups.set(row.skillId, current);
  }
  return [...groups.entries()].flatMap(([skillId, rows]) => {
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latest = rows.at(-1);
    if (!latest || latest.correct) return [];
    const errors = rows.filter((row) => !row.correct && row.result !== "skipped");
    const sessions = new Set(errors.map((row) => row.sessionId));
    return sessions.size >= 2 ? [{ skillId, errors: errors.length, sessions: sessions.size }] : [];
  });
}

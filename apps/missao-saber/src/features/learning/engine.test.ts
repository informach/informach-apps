import { describe, expect, it } from "vitest";
import {
  assessment,
  assessmentBanks,
  assessmentSources,
  contentUnits,
  courses,
  findLesson,
  lessons,
} from "../content/catalog";
import { type Item, itemSchema, publicLesson } from "../content/types";
import { itemHash } from "../content/version";
import {
  type Evidence,
  gradeAnswer,
  localDaysApart,
  repeatedDifficulties,
  skillStates,
  weeklyEvidence,
} from "./engine";
import { availableLessons, recommend, reviewLesson } from "./recommendation";

function row(overrides: Partial<Evidence> = {}): Evidence {
  return {
    itemId: "q1",
    skillId: "fracoes",
    familyId: "partilha",
    correct: true,
    helpCount: 0,
    createdAt: new Date("2026-09-10T12:00:00Z"),
    mode: "mission",
    sessionId: "s1",
    ...overrides,
  };
}
function isChoice(item: Item): item is Extract<Item, { type: "choice" }> {
  return item.type === "choice";
}
describe("learning evidence", () => {
  it("reports only repeated, recent errors from separate sessions and clears after recovery", () => {
    const now = new Date("2026-09-13T15:00:00Z");
    const oneError = [
      row({ createdAt: new Date("2026-09-10T12:00:00Z"), correct: true, sessionId: "s1" }),
      row({ createdAt: new Date("2026-09-11T12:00:00Z"), correct: false, sessionId: "s2" }),
    ];
    expect(repeatedDifficulties(oneError, now)).toEqual([]);
    const repeated = [
      ...oneError,
      row({ createdAt: new Date("2026-09-12T12:00:00Z"), correct: false, sessionId: "s3" }),
    ];
    expect(repeatedDifficulties(repeated, now)).toEqual([
      { skillId: "fracoes", errors: 2, sessions: 2 },
    ]);
    expect(
      repeatedDifficulties(
        [
          ...repeated,
          row({ createdAt: new Date("2026-09-13T12:00:00Z"), correct: true, sessionId: "s4" }),
        ],
        now,
      ),
    ).toEqual([]);
    expect(
      repeatedDifficulties(
        repeated.map((attempt) => ({
          ...attempt,
          createdAt: new Date("2026-07-01T12:00:00Z"),
        })),
        now,
      ),
    ).toEqual([]);
    expect(
      repeatedDifficulties(
        [
          row({ correct: false, result: "skipped", sessionId: "skip-1" }),
          row({ correct: false, result: "skipped", sessionId: "skip-2" }),
        ],
        now,
      ),
    ).toEqual([]);
  });
  it("counts exactly seven Sao Paulo calendar days and excludes future attempts", () => {
    const now = new Date("2026-09-13T15:00:00Z");
    const evidence = Array.from({ length: 8 }, (_, i) =>
      row({
        createdAt: new Date(Date.UTC(2026, 8, 6 + i, 16 - i)),
        sessionId: `s${i}`,
        helpCount: 1,
      }),
    );
    expect(weeklyEvidence(evidence, now)).toEqual({
      total: 7,
      correct: 7,
      withHelp: 7,
      practiceDays: 7,
      sessions: 7,
    });
    const boundary = [
      "2026-09-07T02:59:59.999Z",
      "2026-09-07T03:00:00Z",
      now.toISOString(),
      "2026-09-13T15:00:00.001Z",
    ].map((date, i) => row({ createdAt: new Date(date), sessionId: `b${i}` }));
    expect(weeklyEvidence(boundary, now)).toEqual({
      total: 2,
      correct: 2,
      withHelp: 0,
      practiceDays: 2,
      sessions: 2,
    });
    expect(weeklyEvidence([], now)).toEqual({
      total: 0,
      correct: 0,
      withHelp: 0,
      practiceDays: 0,
      sessions: 0,
    });
    expect(
      weeklyEvidence(
        [row({ createdAt: new Date("2026-08-26T03:00Z") })],
        new Date("2026-09-01T03:00Z"),
      ).total,
    ).toBe(1);
  });
  it("advances review intervals only on due dates, independently of family diversity", () => {
    const days = [1, 2, 5, 12, 26];
    const dueDays = [2, 5, 12, 26, 56];
    const evidence: Evidence[] = [];
    days.forEach((day, i) => {
      evidence.push(row({ createdAt: new Date(Date.UTC(2026, 8, day, 12)) }));
      expect(skillStates(evidence)[0]?.dueAt).toEqual(new Date(Date.UTC(2026, 8, dueDays[i], 12)));
    });
    expect(skillStates(evidence)[0]?.independentFamilies).toBe(1);
  });
  it("does not jump to thirty days after six same-day successes or early practice", () => {
    const evidence = Array.from({ length: 6 }, (_, i) =>
      row({ itemId: `fresh-${i}`, familyId: `family-${i}` }),
    );
    expect(skillStates(evidence)[0]?.dueAt).toEqual(new Date("2026-09-11T12:00:00Z"));
    evidence.push(row({ createdAt: new Date("2026-09-11T12:00:00Z") }));
    evidence.push(row({ createdAt: new Date("2026-09-12T12:00:00Z") }));
    expect(skillStates(evidence)[0]?.dueAt).toEqual(new Date("2026-09-14T12:00:00Z"));
  });
  it("never turns repeated answers into independent mastery", () => {
    const repeated = Array.from({ length: 20 }, (_, i) =>
      row({ sessionId: `s${i}`, createdAt: new Date(Date.UTC(2026, 8, i + 1)) }),
    );
    expect(skillStates(repeated)[0]).toMatchObject({ independentFamilies: 1, level: "building" });
  });
  it("requires varied families on different days, with no help", () => {
    const varied = [
      row(),
      row({ itemId: "q2", familyId: "comparacao" }),
      row({ itemId: "q3", familyId: "inverso" }),
    ];
    expect(skillStates(varied)[0]?.level).toBe("building");
    varied[2] = row({
      itemId: "q3",
      familyId: "inverso",
      createdAt: new Date("2026-09-11T12:00:00Z"),
    });
    expect(skillStates(varied)[0]?.level).toBe("independent");
    expect(skillStates(varied.map((r) => ({ ...r, helpCount: 1 })))[0]?.level).toBe("starting");
  });
  it("a failed item repeated later is not new independent evidence", () => {
    const evidence = [
      row({ correct: false }),
      row({ createdAt: new Date("2026-09-11T12:00:00Z") }),
    ];
    expect(skillStates(evidence)[0]?.independentFamilies).toBe(0);
  });
  it("diagnostics do not certify mastery", () => {
    expect(skillStates([row({ mode: "diagnostic" })])).toEqual([]);
  });
  it("returns a failed skill to a one-day review", () => {
    const last = row({ correct: false, createdAt: new Date("2026-09-12T12:00:00Z") });
    expect(skillStates([row(), last])[0]?.dueAt.toISOString()).toBe("2026-09-13T12:00:00.000Z");
  });
  it("measures absence in Sao Paulo calendar days, not in elapsed hours", () => {
    // Conta viradas de calendário, não horas: o par abaixo tem menos de dois
    // dias e meio de intervalo e vale 3, porque a última tentativa caiu às
    // 23:30 de Brasília. É a mesma unidade dos dias com prática e das datas de
    // revisão, e é como uma família percebe "não estuda desde quarta".
    expect(localDaysApart(new Date("2026-09-12T02:30:00Z"), new Date("2026-09-14T14:00:00Z"))).toBe(
      3,
    );
    expect(localDaysApart(new Date("2026-09-14T12:00:00Z"), new Date("2026-09-14T23:00:00Z"))).toBe(
      0,
    );
    // 02:00 UTC ainda é o dia anterior em Brasília, então o par abaixo cruza
    // uma virada de calendário mesmo separado por menos de 24 horas.
    expect(localDaysApart(new Date("2026-09-14T02:00:00Z"), new Date("2026-09-14T23:00:00Z"))).toBe(
      1,
    );
  });
  it("uses the Brazilian day boundary in weekly reports", () => {
    const results = weeklyEvidence(
      [
        row({ createdAt: new Date("2026-09-11T23:00:00Z") }),
        row({ createdAt: new Date("2026-09-12T01:00:00Z") }),
      ],
      new Date("2026-09-13T12:00:00Z"),
    );
    expect(results.practiceDays).toBe(1);
  });
});
describe("original pilot content", () => {
  it("varies answer positions and authors every distractor rationale and guiding clue", () => {
    const originalLessons = lessons.filter(
      (lesson) => !/^.+-[345]$/.test(lesson.id) && lesson.id !== "fracoes-formatos",
    );
    const all = originalLessons.flatMap((lesson) => lesson.items);
    const choices = all.filter(isChoice).filter((item) => !item.id.startsWith("fracoes-formatos"));
    expect(new Set(choices.flatMap((item) => Object.values(item.misconceptions))).size).toBe(288);
    expect(new Set(choices.map((item) => item.hints[1])).size).toBe(144);
    const positions = choices.map((item) => item.options.indexOf(item.answer));
    for (const position of [0, 1, 2])
      expect(positions.filter((value) => value === position).length).toBeGreaterThan(25);
    expect(positions.some((position, index) => position !== index % 3)).toBe(true);
  });
  it("carries semantic assessment exposure across equivalent course families", () => {
    const source = courses.find((course) => course.id === "canguru-e");
    const target = courses.find((course) => course.id === "obmep-n1");
    if (!source || !target) throw new Error("Missing commercial courses");
    const sourceDiagnostic = assessment(source, "diagnostic");
    const seenFamilies = new Set(sourceDiagnostic.items.map((item) => item.familyId));
    const targetDiagnostic = assessment(target, "diagnostic", new Set(), seenFamilies);

    expect(targetDiagnostic.items.filter((item) => seenFamilies.has(item.familyId))).toHaveLength(
      8,
    );
    expect(targetDiagnostic.assessmentNovelty).toBe("mixed");
  });
  it("recovers the real mission sources of legacy assessment snapshots", () => {
    const course = courses.find((candidate) => candidate.id === "olitef-n1");
    if (!course) throw new Error("Missing commercial course");
    const current = assessment(course, "exam");
    const sourceMission = findLesson("fracoes-1");
    if (!sourceMission) throw new Error("Missing legacy source mission");
    const legacy = {
      ...current,
      version: 1,
      items: sourceMission.items.slice(0, 2),
    };
    expect(assessmentSources(legacy)).toEqual([
      { id: sourceMission.id, version: sourceMission.version },
    ]);
    expect(current.version).toBe(3);
  });
  it("keeps exam choices as mathematical answers without answer-marker templates", () => {
    const examItems = assessmentBanks
      .filter((bank) => bank.id.startsWith("bank:exam:"))
      .flatMap((bank) => bank.items)
      .filter(isChoice);
    expect(examItems).toHaveLength(
      assessmentBanks.filter((bank) => bank.id.startsWith("bank:exam:")).length * 12,
    );
    expect(
      examItems.every(
        (item) =>
          !item.prompt.includes("Um estudante escolheu") &&
          item.options.every(
            (option) =>
              !option.startsWith("A escolha se confirma porque") &&
              !option.startsWith("A análise deve trocar o resultado"),
          ),
      ),
    ).toBe(true);
    expect(new Set(examItems.flatMap((item) => item.options)).size).toBeGreaterThan(80);
  });
  it("treats a simulado as practice after the same diagnostic families were exposed", () => {
    const course = courses.find((candidate) => candidate.id === "olitef-n1");
    if (!course) throw new Error("Missing commercial course");
    const diagnostic = assessment(course, "diagnostic");
    const exam = assessment(
      course,
      "exam",
      new Set(),
      new Set(diagnostic.items.map((item) => item.familyId)),
    );
    expect(exam.assessmentNovelty).toBe("practice");
  });
  it("checks the correction contract for every answer and distractor", () => {
    for (const item of contentUnits.flatMap((lesson) => lesson.items)) {
      if (item.type === "choice") {
        expect(gradeAnswer(item, item.answer)).toMatchObject({ valid: true, correct: true });
        for (const wrong of item.options.filter((option) => option !== item.answer))
          expect(gradeAnswer(item, wrong)).toMatchObject({ valid: true, correct: false });
      } else if (item.type === "numeric") {
        const unit = item.grading.unit?.required ? ` ${item.grading.unit.symbol}` : "";
        expect(gradeAnswer(item, `${item.grading.value}${unit}`)).toMatchObject({
          valid: true,
          correct: true,
        });
      } else if (item.type === "ordering" && item.grading.mode === "exact") {
        expect(gradeAnswer(item, JSON.stringify(item.grading.order))).toMatchObject({
          valid: true,
          correct: true,
        });
      } else if (item.type === "justification") {
        expect(gradeAnswer(item, item.sampleResponse)).toMatchObject({
          valid: true,
          correct: null,
          result: "reflection",
        });
      }
    }
  });
  it.each([
    ["paridade-3-4", 2, 4],
    ["paridade-4-4", 3, 6],
    ["paridade-5-4", 5, 8],
  ])("derives cycle parity independently for %s", (itemId, start, increment) => {
    const item = contentUnits
      .flatMap((lesson) => lesson.items)
      .find((entry) => entry.id === itemId);
    if (item?.type !== "choice") throw new Error("Missing parity fixture");
    const terms = Array.from({ length: 5 }, (_, index) => start + index * increment);
    const expectedRemainder = start % 2;
    expect(terms.every((term) => term % 2 === expectedRemainder)).toBe(true);
    expect(Number(item.answer)).toBe(expectedRemainder);
  });
  it("requires every justification model to demonstrate a case and state a conclusion", () => {
    const models = contentUnits
      .flatMap((lesson) => lesson.items)
      .filter((item) => item.type === "justification");
    const responses = new Set<string>();
    for (const item of models) {
      expect(item.sampleResponse.split(/\s+/).length).toBeGreaterThanOrEqual(20);
      expect(
        item.sampleResponse.split(/[.!?]/).filter((part) => part.trim()).length,
      ).toBeGreaterThan(1);
      expect(item.sampleResponse).not.toContain("exemplo compatível");
      responses.add(item.sampleResponse);
    }
    expect(responses.size).toBe(models.length);
  });
  it.each([
    ["porcentagem-2", 0, 200 * 0.9 * 0.9],
    ["porcentagem-2", 1, 50 * 1.2 * 0.8],
    ["porcentagem-2", 4, 96 / 0.8],
    ["porcentagem-2", 5, 80 * 1.25 * 0.9],
    ["orcamento-2", 0, 18 * 12 - 190],
    ["orcamento-2", 2, 200 * 0.02 * 3],
    ["medidas-2", 0, 4 * 4 - 1],
    ["medidas-2", 1, 4 * 4],
    ["medidas-2", 2, 4 * 4 - 1 + 3],
    ["medidas-2", 5, 5 * 5 - 3 * 3],
    ["contagem-2", 1, (5 * 4) / 2],
    ["contagem-2", 3, 10 + 4 - 2],
    ["gavetas-2", 0, 4 + 1],
    ["gavetas-2", 4, 5 * 2 + 1],
    ["padroes-2", 3, 3 + 19 * 4],
    ["padroes-2", 4, (10 * 11) / 2],
  ])("checks quantitative editorial edge case %s / %i independently", (lessonId, index, expected) => {
    const item = findLesson(lessonId)?.items[index];
    if (item?.type !== "choice") throw new Error("Missing choice fixture");
    expect(Number(item.answer)).toBeCloseTo(expected);
  });
});

describe("diagnosis and available recommendations", () => {
  const selected = lessons.filter((lesson) => ["fracoes", "porcentagem"].includes(lesson.skillId));
  it("recommends support for a missed skill and progression after success without granting mastery", () => {
    const miss = row({ mode: "diagnostic", skillId: "porcentagem", correct: false });
    expect(recommend(selected, [miss], [], new Date())?.lesson.skillId).toBe("porcentagem");
    const pass = row({ mode: "diagnostic" });
    expect(recommend(selected, [pass], [], new Date())?.lesson.skillId).toBe("porcentagem");
    expect(skillStates([pass])).toEqual([]);
  });
  it("does not recommend suspended or unpaid lessons", () => {
    const controls = new Map<string, { status: string; contentHash: string }>();
    const first = selected[0];
    if (!first) throw new Error("No fixture");
    controls.set(first.id, {
      status: "suspended",
      contentHash: "recorded-for-a-prior-version",
    });
    const paid = lessons.find((lesson) => !lesson.free);
    if (!paid) throw new Error("No paid fixture");
    const course = courses[0];
    if (!course) throw new Error("No course fixture");
    const availability = (paidAccess: boolean) => ({
      course,
      grade: 6,
      paid: paidAccess,
      profileAllowed: true,
      states: controls,
    });
    expect(availableLessons(lessons, availability(true))).toContain(paid);
    expect(availableLessons(lessons, availability(true))).not.toContain(first);
    const free = availableLessons(lessons, availability(false));
    expect(free.every((lesson) => lesson.free)).toBe(true);
    expect(reviewLesson(free, first.skillId, [])?.id).not.toBe(first.id);
  });
  it("advances after a mission whose justification was recorded as reflection", () => {
    const current = findLesson("fracoes-formatos");
    const next = findLesson("fracoes-2");
    if (!current || !next) throw new Error("Missing progression fixtures");
    const attempted = new Set(current.items.map((item) => item.id));
    const evidence = current.items
      .filter((item) => item.type !== "justification")
      .map((item, index) =>
        row({
          itemId: item.id,
          skillId: item.skillId,
          familyId: item.familyId,
          sessionId: `s${index}`,
        }),
      );
    expect(recommend([current, next], evidence, [], new Date(), attempted)?.lesson.id).toBe(
      next.id,
    );
  });
});

describe("activity contract v2", () => {
  const sample = findLesson("fracoes-formatos");
  if (!sample) throw new Error("Missing format sample");
  it("accepts equivalent numeric forms and rejects units or expressions outside the contract", () => {
    const item = sample.items.find((candidate) => candidate.type === "numeric");
    if (item?.type !== "numeric") throw new Error("Missing numeric item");
    expect(gradeAnswer(item, "1/2 m")).toMatchObject({ valid: true, correct: true });
    expect(gradeAnswer(item, "0,5 metro")).toMatchObject({ valid: true, correct: true });
    expect(gradeAnswer(item, "0.6 m")).toMatchObject({ valid: true, correct: false });
    expect(gradeAnswer(item, "0,5")).toMatchObject({ valid: false });
    expect(gradeAnswer(item, "1/2 cm")).toMatchObject({ valid: false });
    expect(gradeAnswer(item, "1/(1+1) m")).toMatchObject({ valid: false });
  });
  it("names the trocada step of a numeric answer and otherwise reports only the direction", () => {
    const item = sample.items.find((candidate) => candidate.type === "numeric");
    if (item?.type !== "numeric") throw new Error("Missing numeric item");
    expect(gradeAnswer(item, "0,25 m")).toMatchObject({
      correct: false,
      explanation: "0,25 m é um quarto da unidade. A metade é o dobro disso.",
    });
    // Sem leitura autoral, a direção do desvio precede a explicação da questão.
    expect(gradeAnswer(item, "0,6 m").explanation).toBe(
      `Seu valor ficou acima do esperado. ${item.explanation}`,
    );
    expect(gradeAnswer(item, "0,1 m").explanation).toBe(
      `Seu valor ficou abaixo do esperado. ${item.explanation}`,
    );
    // Com leitura autoral, ela substitui a explicação genérica em vez de somar.
    expect(gradeAnswer(item, "0,2 m").explanation).not.toContain(item.explanation);
  });
  it("refuses a misread that the grading would accept as correct", () => {
    const item = sample.items.find((candidate) => candidate.type === "numeric");
    if (item?.type !== "numeric") throw new Error("Missing numeric item");
    expect(() =>
      itemSchema.parse({
        ...item,
        id: "misread-conflict",
        misreads: [{ value: 0.5, feedback: "Não pode valer como erro." }],
      }),
    ).toThrow();
    expect(() =>
      itemSchema.parse({
        ...item,
        id: "misread-duplicate",
        misreads: [
          { value: 0.25, feedback: "Um quarto." },
          { value: 0.25, feedback: "Repetido." },
        ],
      }),
    ).toThrow();
  });
  it("refuses two misreads whose tolerance windows overlap", () => {
    const item = sample.items.find((candidate) => candidate.type === "numeric");
    if (item?.type !== "numeric") throw new Error("Missing numeric item");
    // Com tolerância 0,05 as janelas de 0,25 e 0,3 se tocam: uma resposta de
    // 0,275 casaria com a primeira da lista e nomearia a etapa errada.
    const comTolerancia = { ...item, grading: { ...item.grading, tolerance: 0.05 } };
    expect(() =>
      itemSchema.parse({
        ...comTolerancia,
        id: "misread-overlap",
        misreads: [
          { value: 0.25, feedback: "Um quarto." },
          { value: 0.3, feedback: "Perto demais do anterior." },
        ],
      }),
    ).toThrow();
    // Separadas por mais de duas tolerâncias, cada leitura tem janela própria.
    expect(() =>
      itemSchema.parse({
        ...comTolerancia,
        id: "misread-separado",
        misreads: [
          { value: 0.25, feedback: "Um quarto." },
          { value: 0.4, feedback: "Outra etapa trocada." },
        ],
      }),
    ).not.toThrow();
  });
  it("points at a single inverted pair of steps instead of revealing the whole order", () => {
    const exact = sample.items.find((candidate) => candidate.type === "ordering");
    if (exact?.type !== "ordering") throw new Error("Missing ordering item");
    const inverted = gradeAnswer(
      exact,
      JSON.stringify(["part", "divide", "multiply", "result"]),
    ).explanation;
    expect(inverted).toMatch(
      /^“Dividir 20 em 4 partes iguais” precisa vir antes de “Reconhecer que uma parte vale 5”\./,
    );
    expect(inverted).not.toContain("Concluir que três quartos de 20 são 15");
    const precedence = itemSchema.parse({
      ...exact,
      id: "precedence-feedback",
      grading: { mode: "precedence", constraints: [["divide", "multiply"]] },
    });
    expect(
      gradeAnswer(precedence, JSON.stringify(["multiply", "part", "divide", "result"])).explanation,
    ).toMatch(
      /^“Dividir 20 em 4 partes iguais” precisa vir antes de “Multiplicar o valor de uma parte por 3”\./,
    );
  });
  it("validates exact and precedence orders without accepting repeated or foreign steps", () => {
    const exact = sample.items.find((candidate) => candidate.type === "ordering");
    if (exact?.type !== "ordering") throw new Error("Missing ordering item");
    expect(
      gradeAnswer(exact, JSON.stringify(["divide", "part", "multiply", "result"])),
    ).toMatchObject({ valid: true, correct: true });
    expect(
      gradeAnswer(exact, JSON.stringify(["divide", "divide", "multiply", "result"])),
    ).toMatchObject({ valid: false });
    const precedence = itemSchema.parse({
      ...exact,
      id: "precedence-sample",
      grading: { mode: "precedence", constraints: [["divide", "multiply"]] },
    });
    expect(
      gradeAnswer(precedence, JSON.stringify(["part", "divide", "result", "multiply"])),
    ).toMatchObject({ valid: true, correct: true });
    expect(
      gradeAnswer(precedence, JSON.stringify(["multiply", "part", "divide", "result"])),
    ).toMatchObject({ valid: true, correct: false });
  });
  it("records a justification as reflection and keeps rubric and sample out of public content", () => {
    const item = sample.items.find((candidate) => candidate.type === "justification");
    if (item?.type !== "justification") throw new Error("Missing justification item");
    expect(gradeAnswer(item, "Usei o mesmo denominador e comparei os numeradores.")).toMatchObject({
      valid: true,
      result: "reflection",
      correct: null,
    });
    expect(gradeAnswer(item, "curta")).toMatchObject({ valid: false });
    const projected = publicLesson(sample).items.find((candidate) => candidate.id === item.id);
    expect(projected).not.toHaveProperty("rubric");
    expect(projected).not.toHaveProperty("sampleResponse");
    expect(projected).not.toHaveProperty("explanation");
  });
  it("reads a legacy choice snapshot without changing its original answer", () => {
    const legacy = itemSchema.parse({
      id: "legacy",
      skillId: "fracoes",
      familyId: "fracoes:legacy",
      prompt: "Quanto é metade de 10?",
      options: ["2", "5"],
      answer: "5",
      explanation: "10 dividido por 2 é 5.",
      hints: ["Pense em dois grupos.", "Divida igualmente.", "10 / 2 = 5."],
      misconceptions: { "2": "Dois é a quantidade de grupos." },
    });
    expect(legacy.type).toBe("choice");
    expect(gradeAnswer(legacy, "5")).toMatchObject({ correct: true });
  });
  it("keeps a frozen snapshot's identity when an optional authored field is added", () => {
    // O hash de invalidação é calculado sobre a versão congelada na sessão.
    // Reparsear um snapshot antigo com o schema atual injeta `misreads: []`, e
    // se isso mudasse o hash toda atividade numérica retirada por um mantenedor
    // voltaria a contar como evidência no primeiro deploy.
    const antigo = sample.items.find((candidate) => candidate.type === "numeric");
    if (antigo?.type !== "numeric") throw new Error("Missing numeric item");
    const { misreads: _misreads, ...semCampo } = antigo;
    expect(itemHash(itemSchema.parse(semCampo))).toBe(itemHash(semCampo as Item));
    // Ganhar leitura equivocada autoral é conteúdo novo, e aí o hash muda.
    expect(itemHash(antigo)).not.toBe(itemHash(semCampo as Item));
  });
  it("keeps content identity stable when PostgreSQL JSONB reorders object keys", () => {
    const item = sample.items[0];
    if (!item) throw new Error("Missing item");
    const reordered = Object.fromEntries(Object.entries(item).reverse()) as Item;
    expect(itemHash(reordered)).toBe(itemHash(item));
  });
});

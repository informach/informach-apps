import { describe, expect, it } from "vitest";
import type { ParsedActivityInput, TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  applyTomorrowFallback,
  buildUserMessage,
  enrichWithResolvedTurma,
  inferGuessedTurma,
  type ProfileLite,
  propagateUniqueDueDate,
} from "./enrich";

const fixedNow = new Date("2026-05-13T12:00:00-03:00"); // quarta-feira, São Paulo

describe("buildUserMessage", () => {
  it("inclui hoje + dia da semana + estudantes + transcript", () => {
    const msg = buildUserMessage({
      transcript: "Pedro tem prova amanhã",
      studentNames: ["Pedro", "Ana"],
      now: fixedNow,
    });
    expect(msg).toContain("Hoje é 2026-05-13");
    expect(msg).toContain("quarta-feira");
    expect(msg).toContain("America/Sao_Paulo");
    expect(msg).toContain("Estudantes disponíveis: Pedro, Ana");
    expect(msg).toContain("Conteúdo:\nPedro tem prova amanhã");
  });

  it("usa '(nenhum)' quando lista de estudantes é vazia", () => {
    const msg = buildUserMessage({
      transcript: "Tem prova quarta",
      studentNames: [],
      now: fixedNow,
    });
    expect(msg).toContain("Estudantes disponíveis: (nenhum)");
  });

  it("inclui bloco 'Matérias disponíveis' quando turmasWithSubjects fornecido", () => {
    const msg = buildUserMessage({
      transcript: "Prova de matemática quarta",
      studentNames: ["Pedro", "Ana"],
      turmasWithSubjects: [
        {
          turmaId: "t1",
          schoolName: "Escola X",
          grade: "5ano",
          classLetter: "A",
          year: 2026,
          subjects: [
            { id: "s1", name: "Matemática", colorIndex: 1 },
            { id: "s2", name: "Português", colorIndex: 2 },
          ],
        },
        {
          turmaId: "t2",
          schoolName: "Escola Y",
          grade: "7ano",
          classLetter: "B",
          year: 2026,
          subjects: [
            { id: "s3", name: "História", colorIndex: 3 },
            { id: "s4", name: "Inglês", colorIndex: 4 },
          ],
        },
      ],
      profiles: [
        { id: "p1", name: "Pedro", activeTurmaId: "t1" },
        { id: "p2", name: "Ana", activeTurmaId: "t2" },
      ],
      now: fixedNow,
    });
    expect(msg).toContain("Matérias disponíveis nas turmas dos estudantes:");
    expect(msg).toContain("Pedro (5º ano A · Escola X): Matemática, Português");
    expect(msg).toContain("Ana (7º ano B · Escola Y): História, Inglês");
  });

  it("omite bloco 'Matérias' quando turmasWithSubjects ausente", () => {
    const msg = buildUserMessage({
      transcript: "Foto da agenda",
      studentNames: ["Pedro"],
      now: fixedNow,
    });
    expect(msg).not.toContain("Matérias disponíveis");
  });

  it("omite bloco 'Matérias' quando turmasWithSubjects é array vazio", () => {
    const msg = buildUserMessage({
      transcript: "Foto da agenda",
      studentNames: ["Pedro"],
      turmasWithSubjects: [],
      now: fixedNow,
    });
    expect(msg).not.toContain("Matérias disponíveis");
  });

  it("usa apenas escola/série quando turma não casa nenhum perfil", () => {
    const msg = buildUserMessage({
      transcript: "x",
      studentNames: ["Pedro"],
      turmasWithSubjects: [
        {
          turmaId: "t-órfã",
          schoolName: "Escola Z",
          grade: "6ano",
          classLetter: "C",
          year: 2026,
          subjects: [{ id: "s1", name: "Matemática", colorIndex: 1 }],
        },
      ],
      profiles: [{ id: "p1", name: "Pedro", activeTurmaId: "t1" }],
      now: fixedNow,
    });
    expect(msg).toContain("6º ano C · Escola Z: Matemática");
    expect(msg).not.toContain("Pedro (6º ano");
  });
});

const profiles: ProfileLite[] = [
  { id: "p1", name: "Pedro Silva", activeTurmaId: "t1" },
  { id: "p2", name: "Ana Souza", activeTurmaId: "t2" },
  { id: "p3", name: "Júlia Costa", activeTurmaId: null },
];

const turmasWithSubjects: TurmaWithSubjectsForForm[] = [
  {
    turmaId: "t1",
    schoolName: "Escola X",
    grade: "5ano",
    classLetter: "A",
    year: 2026,
    subjects: [
      { id: "s1-mat", name: "Matemática", colorIndex: 1 },
      { id: "s1-por", name: "Português", colorIndex: 2 },
      { id: "s1-cie", name: "Ciências", colorIndex: 3 },
    ],
  },
  {
    turmaId: "t2",
    schoolName: "Escola Y",
    grade: "7ano",
    classLetter: "B",
    year: 2026,
    subjects: [
      { id: "s2-mat", name: "Matemática", colorIndex: 1 },
      { id: "s2-his", name: "História", colorIndex: 4 },
      { id: "s2-geo", name: "Geografia", colorIndex: 5 },
    ],
  },
];

describe("enrichWithResolvedTurma", () => {
  it("retorna isValidInput=false direto quando IA não detectou", () => {
    const result = enrichWithResolvedTurma(
      { isValidInput: false, reason: "Não identifiquei.", activities: [] },
      profiles,
    );
    expect(result.isValidInput).toBe(false);
    if (!result.isValidInput) {
      expect(result.reason).toBe("Não identifiquei.");
    }
  });

  it("resolve studentNameHint pro turmaId ativo do perfil casado", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova de matemática",
            description: null,
            type: "exam" as const,
            dueAt: "2026-05-14",
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBe("t1");
    expect(result.activities[0]?.resolvedSubjectId).toBe("s1-mat");
    expect(result.guessedTurmaId).toBe("t1");
  });

  it("resolve subjectHint via match único cross-turma quando estudante não casa", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Trabalho de história",
            description: null,
            type: "project" as const,
            dueAt: null,
            subjectHint: "História",
            studentNameHint: null,
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    // História só existe em t2.
    expect(result.activities[0]?.resolvedTurmaId).toBe("t2");
    expect(result.activities[0]?.resolvedSubjectId).toBe("s2-his");
  });

  it("não resolve quando subjectHint é ambíguo entre 2+ turmas", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova",
            description: null,
            type: "exam" as const,
            dueAt: null,
            subjectHint: "Matemática", // existe em t1 E t2
            studentNameHint: null,
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBeNull();
    expect(result.activities[0]?.resolvedSubjectId).toBeNull();
  });

  it("retorna resolvedTurmaId=null quando nem estudante nem matéria casam", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "X",
            description: null,
            type: "task" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: "Mariana",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBeNull();
    expect(result.activities[0]?.resolvedSubjectId).toBeNull();
  });

  it("retorna resolvedTurmaId=null quando perfil casado não tem turma ativa", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Algo",
            description: null,
            type: "task" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: "Júlia",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBeNull();
  });

  it("mapeia vários itens preservando ordem e resolvendo por linha", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova",
            description: null,
            type: "exam" as const,
            dueAt: "2026-05-14",
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
          {
            title: "Trabalho",
            description: null,
            type: "project" as const,
            dueAt: "2026-05-16",
            subjectHint: "História",
            studentNameHint: "Ana",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBe("t1");
    expect(result.activities[1]?.resolvedTurmaId).toBe("t2");
    // Discrepância → guessedTurmaId null (conservador).
    expect(result.guessedTurmaId).toBeNull();
  });

  it("fallback: resolve matéria via título quando subjectHint vem null e turma está resolvida", () => {
    // Cenário do bug: usuário diz "Débora tem prova de redação". A IA acerta
    // turma e título mas deixa subjectHint=null (interpreta "redação" como
    // complemento de "prova"). O fallback acha "Redação" no título.
    const turmasComRedacao: TurmaWithSubjectsForForm[] = [
      {
        turmaId: "t-debora",
        schoolName: "Escola D",
        grade: "6ano",
        classLetter: "A",
        year: 2026,
        subjects: [
          { id: "s-redacao", name: "Redação", colorIndex: 2 },
          { id: "s-port", name: "Português", colorIndex: 2 },
          { id: "s-mat", name: "Matemática", colorIndex: 1 },
        ],
      },
    ];
    const profilesComDebora: ProfileLite[] = [
      { id: "p-debora", name: "Débora", activeTurmaId: "t-debora" },
    ];
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova de redação",
            description: null,
            type: "exam" as const,
            dueAt: "2026-08-31",
            subjectHint: null,
            studentNameHint: "Débora",
          },
        ],
      },
      profilesComDebora,
      turmasComRedacao,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBe("t-debora");
    expect(result.activities[0]?.resolvedSubjectId).toBe("s-redacao");
  });

  it("fallback prioriza nome de matéria mais longo (Educação Física antes de Física)", () => {
    const turmas: TurmaWithSubjectsForForm[] = [
      {
        turmaId: "t1",
        schoolName: "X",
        grade: "8ano",
        classLetter: "A",
        year: 2026,
        subjects: [
          { id: "s-fis", name: "Física", colorIndex: 1 },
          { id: "s-edf", name: "Educação Física", colorIndex: 3 },
        ],
      },
    ];
    const profs: ProfileLite[] = [{ id: "p1", name: "Léo", activeTurmaId: "t1" }];
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Trabalho de Educação Física",
            description: null,
            type: "project" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: "Léo",
          },
        ],
      },
      profs,
      turmas,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedSubjectId).toBe("s-edf");
  });

  it("fallback não faz match parcial em palavra (Arte não casa com tartaruga)", () => {
    const turmas: TurmaWithSubjectsForForm[] = [
      {
        turmaId: "t1",
        schoolName: "X",
        grade: "3ano",
        classLetter: "A",
        year: 2026,
        subjects: [{ id: "s-arte", name: "Arte", colorIndex: 5 }],
      },
    ];
    const profs: ProfileLite[] = [{ id: "p1", name: "João", activeTurmaId: "t1" }];
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Estudar sobre tartarugas",
            description: null,
            type: "task" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: "João",
          },
        ],
      },
      profs,
      turmas,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedSubjectId).toBeNull();
  });

  it("fallback não roda quando turma não está resolvida", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova de matemática",
            description: null,
            type: "exam" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: null, // sem estudante → cross-turma ambíguo
          },
        ],
      },
      profiles,
      turmasWithSubjects,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    // Matemática existe em t1 e t2 → ambíguo no cascade do subjectHint, então
    // turma não resolve. Fallback do título nem roda (turmaId=null).
    expect(result.activities[0]?.resolvedTurmaId).toBeNull();
    expect(result.activities[0]?.resolvedSubjectId).toBeNull();
  });

  it("modo legacy (sem turmasWithSubjects): ainda resolve por estudante e consenso vence", () => {
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Prova",
            description: null,
            type: "exam" as const,
            dueAt: "2026-05-14",
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
        ],
      },
      profiles,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBe("t1");
    // Sem subjects da turma no contexto, matéria não casa.
    expect(result.activities[0]?.resolvedSubjectId).toBeNull();
    // Consenso entre resolvidos (1 atividade → t1) vence — guess t1 ainda
    // que turmasWithSubjects esteja vazio. Útil pra rotas legacy.
    expect(result.guessedTurmaId).toBe("t1");
  });
});

describe("inferGuessedTurma", () => {
  const parsedActivity = (resolvedTurmaId: string | null) => ({
    title: "x",
    description: null,
    type: "task" as const,
    dueAt: null,
    subjectHint: null,
    studentNameHint: null,
    resolvedTurmaId,
    resolvedSubjectId: null,
  });

  it("retorna a turma única quando turmasWithSubjects.length === 1", () => {
    const onlyTurma = turmasWithSubjects[0];
    if (!onlyTurma) throw new Error("fixture missing");
    const guess = inferGuessedTurma([parsedActivity(null), parsedActivity(null)], [onlyTurma]);
    expect(guess).toBe("t1");
  });

  it("retorna turmaId quando todas resolvidas são iguais", () => {
    const guess = inferGuessedTurma(
      [parsedActivity("t1"), parsedActivity("t1"), parsedActivity(null)],
      turmasWithSubjects,
    );
    expect(guess).toBe("t1");
  });

  it("retorna null quando há discrepância", () => {
    const guess = inferGuessedTurma(
      [parsedActivity("t1"), parsedActivity("t2")],
      turmasWithSubjects,
    );
    expect(guess).toBeNull();
  });

  it("retorna null quando nenhuma atividade foi resolvida", () => {
    const guess = inferGuessedTurma(
      [parsedActivity(null), parsedActivity(null)],
      turmasWithSubjects,
    );
    expect(guess).toBeNull();
  });
});

describe("propagateUniqueDueDate", () => {
  const makeActivity = (dueAt: string | null, title = "x"): ParsedActivityInput => ({
    title,
    description: null,
    type: "task",
    dueAt,
    subjectHint: null,
    studentNameHint: null,
    resolvedTurmaId: null,
    resolvedSubjectId: null,
  });

  it("propaga data única para atividades com dueAt=null", () => {
    // Cenário típico: folha escolar com data "26/05" no topo. IA acertou a
    // data só em 2 de 3 atividades. Fallback preenche a terceira.
    const result = propagateUniqueDueDate([
      makeActivity("2026-05-26", "Tarefa 1"),
      makeActivity(null, "Tarefa 2"),
      makeActivity("2026-05-26", "Tarefa 3"),
    ]);
    expect(result[0]?.dueAt).toBe("2026-05-26");
    expect(result[1]?.dueAt).toBe("2026-05-26");
    expect(result[2]?.dueAt).toBe("2026-05-26");
  });

  it("não propaga quando há mais de uma data distinta no batch", () => {
    // Discrepância → conservador, mantém os nulls. Provavelmente cada bloco
    // tem sua data própria e a null pode ser ambígua.
    const result = propagateUniqueDueDate([
      makeActivity("2026-05-20", "A"),
      makeActivity("2026-05-23", "B"),
      makeActivity(null, "C"),
    ]);
    expect(result[2]?.dueAt).toBeNull();
  });

  it("não muda nada quando todas têm data ou todas estão null", () => {
    const allFilled = propagateUniqueDueDate([
      makeActivity("2026-05-20", "A"),
      makeActivity("2026-05-20", "B"),
    ]);
    expect(allFilled.map((a) => a.dueAt)).toEqual(["2026-05-20", "2026-05-20"]);

    const allNull = propagateUniqueDueDate([makeActivity(null, "A"), makeActivity(null, "B")]);
    expect(allNull.map((a) => a.dueAt)).toEqual([null, null]);
  });

  it("propagação roda dentro de enrichWithResolvedTurma (antes do fallback)", () => {
    // Smoke test do caminho completo: folha com data uniforme + alguma
    // atividade null → enrichWithResolvedTurma já entrega tudo propagado.
    // Ordem importa: propagação roda ANTES do applyTomorrowFallback, então
    // a null herda a data do batch (não vira "amanhã").
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Estudar microscopia",
            description: "O que é e como funciona",
            type: "task" as const,
            dueAt: null, // IA esqueceu de associar com a data do topo
            subjectHint: "Ciências",
            studentNameHint: "Pedro",
          },
          {
            title: "Lição de geografia",
            description: null,
            type: "task" as const,
            dueAt: "2026-05-26", // outra atividade da mesma folha pegou
            subjectHint: null,
            studentNameHint: "Pedro",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
      fixedNow,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    // A primeira atividade herda a data da segunda (única data no batch).
    expect(result.activities[0]?.dueAt).toBe("2026-05-26");
    expect(result.activities[1]?.dueAt).toBe("2026-05-26");
  });
});

describe("applyTomorrowFallback", () => {
  const makeActivity = (dueAt: string | null, title = "x"): ParsedActivityInput => ({
    title,
    description: null,
    type: "task",
    dueAt,
    subjectHint: null,
    studentNameHint: null,
    resolvedTurmaId: null,
    resolvedSubjectId: null,
  });

  it("preenche dueAt=null com amanhã (hoje + 1 em SP)", () => {
    // fixedNow = 2026-05-13 (quarta) → amanhã = 2026-05-14 (quinta).
    const result = applyTomorrowFallback(
      [makeActivity(null, "Sem data"), makeActivity(null, "Outra sem data")],
      fixedNow,
    );
    expect(result[0]?.dueAt).toBe("2026-05-14");
    expect(result[1]?.dueAt).toBe("2026-05-14");
  });

  it("não altera atividades com data já definida", () => {
    const result = applyTomorrowFallback(
      [makeActivity("2026-05-20", "Com data"), makeActivity(null, "Sem data")],
      fixedNow,
    );
    expect(result[0]?.dueAt).toBe("2026-05-20");
    expect(result[1]?.dueAt).toBe("2026-05-14");
  });

  it("integração: batch totalmente sem data via enrichWithResolvedTurma vira amanhã", () => {
    // Cenário do bug original: imagem da microscopia em que a IA não detectou
    // NENHUMA data. Sem nada pra propagar, o fallback assume e preenche amanhã
    // em todas as atividades. User ainda pode editar antes de salvar.
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Estudar sobre microscopia",
            description: "O que é e como funciona",
            type: "task" as const,
            dueAt: null,
            subjectHint: "Ciências",
            studentNameHint: "Pedro",
          },
          {
            title: "Levar material de arte",
            description: null,
            type: "reminder" as const,
            dueAt: null,
            subjectHint: null,
            studentNameHint: "Pedro",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
      fixedNow,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    // Hoje fixedNow = 2026-05-13 → amanhã = 2026-05-14.
    expect(result.activities[0]?.dueAt).toBe("2026-05-14");
    expect(result.activities[1]?.dueAt).toBe("2026-05-14");
  });

  it("integração: null isolado com 2 datas distintas no batch (propagação falha) vira amanhã", () => {
    // Caso menos óbvio: batch tem 2 datas distintas, então propagateUniqueDueDate
    // não tem como decidir e mantém o null. O fallback assume e preenche amanhã.
    const result = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "A",
            description: null,
            type: "task" as const,
            dueAt: "2026-05-20",
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
          {
            title: "B",
            description: null,
            type: "task" as const,
            dueAt: "2026-05-23",
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
          {
            title: "C sem data",
            description: null,
            type: "task" as const,
            dueAt: null,
            subjectHint: "Matemática",
            studentNameHint: "Pedro",
          },
        ],
      },
      profiles,
      turmasWithSubjects,
      fixedNow,
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.dueAt).toBe("2026-05-20");
    expect(result.activities[1]?.dueAt).toBe("2026-05-23");
    expect(result.activities[2]?.dueAt).toBe("2026-05-14"); // amanhã
  });
});

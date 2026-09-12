import { describe, expect, it } from "vitest";
import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  buildUserMessage,
  enrichWithResolvedTurma,
  inferGuessedTurma,
  type ProfileLite,
} from "./enrich";

const fixedNow = new Date("2026-05-13T12:00:00-03:00"); // quarta-feira, São Paulo

describe("buildUserMessage", () => {
  it("does not supply today's date as the publication date of an uploaded document", () => {
    const msg = buildUserMessage({
      transcript: "Entregar amanhã",
      studentNames: [],
      sourceKind: "document",
      now: fixedNow,
    });
    expect(msg).not.toContain("2026-05-13");
    expect(msg).toContain("publicação inequívoco no original");
    expect(msg).toContain("dueAt=null");
  });
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
            { id: "s1", name: "Matemática", colorIndex: 1, classDays: [] },
            { id: "s2", name: "Português", colorIndex: 2, classDays: [] },
          ],
        },
        {
          turmaId: "t2",
          schoolName: "Escola Y",
          grade: "7ano",
          classLetter: "B",
          year: 2026,
          subjects: [
            { id: "s3", name: "História", colorIndex: 3, classDays: [] },
            { id: "s4", name: "Inglês", colorIndex: 4, classDays: [] },
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
          subjects: [{ id: "s1", name: "Matemática", colorIndex: 1, classDays: [] }],
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
      { id: "s1-mat", name: "Matemática", colorIndex: 1, classDays: [] },
      { id: "s1-por", name: "Português", colorIndex: 2, classDays: [] },
      { id: "s1-cie", name: "Ciências", colorIndex: 3, classDays: [] },
    ],
  },
  {
    turmaId: "t2",
    schoolName: "Escola Y",
    grade: "7ano",
    classLetter: "B",
    year: 2026,
    subjects: [
      { id: "s2-mat", name: "Matemática", colorIndex: 1, classDays: [] },
      { id: "s2-his", name: "História", colorIndex: 4, classDays: [] },
      { id: "s2-geo", name: "Geografia", colorIndex: 5, classDays: [] },
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
          { id: "s-redacao", name: "Redação", colorIndex: 2, classDays: [] },
          { id: "s-port", name: "Português", colorIndex: 2, classDays: [] },
          { id: "s-mat", name: "Matemática", colorIndex: 1, classDays: [] },
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
          { id: "s-fis", name: "Física", colorIndex: 1, classDays: [] },
          { id: "s-edf", name: "Educação Física", colorIndex: 3, classDays: [] },
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
        subjects: [{ id: "s-arte", name: "Arte", colorIndex: 5, classDays: [] }],
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

describe("prazos ausentes", () => {
  it("preserva ausência de prazo mesmo quando outro item tem data", () => {
    const out = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: ["2026-09-14", null].map((dueAt) => ({
          title: "Levar material",
          description: null,
          type: "reminder" as const,
          dueAt,
          subjectHint: null,
          studentNameHint: null,
        })),
      },
      [],
    );
    expect(out.isValidInput && out.activities.map((a) => a.dueAt)).toEqual(["2026-09-14", null]);
  });

  it("não transforma horário da matéria em prazo de entrega", () => {
    const out = enrichWithResolvedTurma(
      {
        isValidInput: true,
        reason: null,
        activities: [
          {
            title: "Ler",
            description: null,
            type: "task",
            dueAt: null,
            subjectHint: "Português",
            studentNameHint: "Ana",
          },
        ],
      },
      [{ id: "p", name: "Ana", activeTurmaId: "t" }],
      [
        {
          turmaId: "t",
          schoolName: "Escola",
          grade: "4ano",
          classLetter: "A",
          year: 2026,
          subjects: [{ id: "s", name: "Português", colorIndex: 0, classDays: ["mon", "fri"] }],
        },
      ],
    );
    expect(out.isValidInput && out.activities[0]?.dueAt).toBeNull();
    expect(out.isValidInput && out.activities[0]?.resolvedSubjectId).toBe("s");
  });
});

import { describe, expect, it } from "vitest";
import { buildUserMessage, enrichWithResolvedTurma, type ProfileLite } from "./enrich";

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
});

const profiles: ProfileLite[] = [
  { id: "p1", name: "Pedro Silva", activeTurmaId: "t1" },
  { id: "p2", name: "Ana Souza", activeTurmaId: "t2" },
  { id: "p3", name: "Júlia Costa", activeTurmaId: null },
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
    );
    expect(result.isValidInput).toBe(true);
    if (!result.isValidInput) return;
    expect(result.activities[0]?.resolvedTurmaId).toBe("t1");
    expect(result.activities[0]?.studentNameHint).toBe("Pedro");
  });

  it("retorna resolvedTurmaId=null quando hint não casa", () => {
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
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBeNull();
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
    );
    if (!result.isValidInput) throw new Error("expected isValidInput=true");
    expect(result.activities[0]?.resolvedTurmaId).toBe("t1");
    expect(result.activities[1]?.resolvedTurmaId).toBe("t2");
  });
});

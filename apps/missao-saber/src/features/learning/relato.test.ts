import { describe, expect, it } from "vitest";
import type { Evidence, SkillState } from "./engine";
import { weeklyEvidence } from "./engine";
import { weeklyNarrative } from "./relato";

const now = new Date("2026-09-15T18:00:00Z");
const skillNames = {
  fracoes: "Frações e referência",
  precos: "Comparação de preços",
  porcentagem: "Porcentagem",
};

function row(overrides: Partial<Evidence> = {}): Evidence {
  return {
    itemId: "q1",
    skillId: "precos",
    familyId: "precos:unidade",
    correct: true,
    helpCount: 0,
    createdAt: new Date("2026-09-14T12:00:00Z"),
    mode: "mission",
    sessionId: "s1",
    ...overrides,
  };
}
function state(overrides: Partial<SkillState> = {}): SkillState {
  return {
    skillId: "precos",
    level: "building",
    independentFamilies: 1,
    attempts: 2,
    dueOn: "2026-09-20",
    lastCorrect: true,
    ...overrides,
  };
}
function narrate(input: {
  evidence: Evidence[];
  states?: SkillState[];
  repeatedDifficulties?: { skillId: string }[];
  nextSkillId?: string;
  reflections?: number;
}) {
  return weeklyNarrative({
    nickname: "Lia",
    evidence: input.evidence,
    weekly: weeklyEvidence(input.evidence, now),
    states: input.states ?? [],
    repeatedDifficulties: input.repeatedDifficulties ?? [],
    nextSkillId: input.nextSkillId,
    reflections: input.reflections ?? 0,
    now,
    skillNames,
  }).linhas;
}

describe("weekly family narrative", () => {
  it("waits for the first mission instead of reporting an empty week", () => {
    expect(narrate({ evidence: [] })).toEqual([
      "O relato de Lia começa depois das primeiras missões.",
    ]);
  });

  it("counts distinct families answered without hints, naming the skill and the study days", () => {
    const linhas = narrate({
      evidence: [
        row({ itemId: "q1", familyId: "precos:unidade" }),
        row({
          itemId: "q2",
          familyId: "precos:promocao",
          createdAt: new Date("2026-09-15T12:00:00Z"),
          sessionId: "s2",
        }),
      ],
      nextSkillId: "porcentagem",
    });
    expect(linhas[0]).toBe(
      "Nesta semana, Lia resolveu 2 problemas novos de Comparação de preços sem pistas, em 2 dias diferentes.",
    );
    expect(linhas).toContain("O próximo passo é Porcentagem.");
  });

  it("counts the days the new problems happened, not every day with practice", () => {
    const linhas = narrate({
      evidence: [
        row({ itemId: "q1", familyId: "precos:unidade" }),
        row({ itemId: "q2", familyId: "precos:promocao" }),
        // Outro dia com prática, mas sem nenhuma atividade inédita sem pistas.
        row({
          itemId: "q1",
          createdAt: new Date("2026-09-15T12:00:00Z"),
          sessionId: "s2",
          helpCount: 2,
        }),
      ],
    });
    expect(linhas[0]).toBe(
      "Nesta semana, Lia resolveu 2 problemas novos de Comparação de preços sem pistas, em 1 dia de estudo.",
    );
  });
  it("counts activities, not families, and always says how many other skills there were", () => {
    // Duas atividades inéditas da mesma família continuam sendo dois problemas.
    expect(
      narrate({
        evidence: [
          row({ itemId: "q1", familyId: "precos:unidade" }),
          row({ itemId: "q2", familyId: "precos:unidade" }),
        ],
      })[0],
    ).toContain("resolveu 2 problemas novos de Comparação de preços");
    // Empate em quantidade: nomeia a habilidade trabalhada por último.
    expect(
      narrate({
        evidence: [
          row({ itemId: "q1", createdAt: new Date("2026-09-15T12:00:00Z") }),
          row({
            itemId: "q2",
            skillId: "fracoes",
            familyId: "fracoes:partilha",
            createdAt: new Date("2026-09-13T12:00:00Z"),
          }),
        ],
      })[0],
    ).toContain("de Comparação de preços e outra habilidade sem pistas");
    expect(
      narrate({
        evidence: [
          row({ itemId: "q1", createdAt: new Date("2026-09-15T12:00:00Z") }),
          row({
            itemId: "q2",
            skillId: "fracoes",
            familyId: "fracoes:partilha",
            createdAt: new Date("2026-09-13T12:00:00Z"),
          }),
          row({
            itemId: "q3",
            skillId: "porcentagem",
            familyId: "porcentagem:base",
            createdAt: new Date("2026-09-12T12:00:00Z"),
          }),
        ],
      })[0],
    ).toContain("de Comparação de preços e outras 2 habilidades sem pistas");
  });

  it("uses the singular for one problem on one day", () => {
    expect(narrate({ evidence: [row()] })[0]).toBe(
      "Nesta semana, Lia resolveu 1 problema novo de Comparação de preços sem pistas, em 1 dia de estudo.",
    );
  });

  it("does not turn hinted or repeated answers into independent evidence", () => {
    const linhas = narrate({
      evidence: [
        row({ itemId: "q1", helpCount: 2 }),
        row({ itemId: "q1", createdAt: new Date("2026-09-15T12:00:00Z"), sessionId: "s2" }),
        row({ itemId: "q9", mode: "diagnostic", familyId: "precos:reservada" }),
      ],
    });
    expect(linhas[0]).toBe(
      "Nesta semana, Lia registrou 3 tentativas em 2 dias, 1 com pistas. Nenhuma foi um primeiro acerto sem pistas em uma atividade inédita.",
    );
  });

  it("reports a week without attempts without counting missed days", () => {
    const linhas = narrate({
      evidence: [row({ createdAt: new Date("2026-08-20T12:00:00Z") })],
      states: [state({ dueOn: "2026-09-10" })],
    });
    expect(linhas[0]).toBe("Nesta semana Lia não registrou tentativas.");
    expect(linhas.join(" ")).not.toMatch(/dias sem|perdeu|faltou/);
    expect(linhas).toContain("1 habilidade está na data de reencontro.");
  });

  it("names repeated difficulties and keeps reflections out of the score", () => {
    const linhas = narrate({
      evidence: [row()],
      repeatedDifficulties: [{ skillId: "fracoes" }, { skillId: "porcentagem" }],
      reflections: 2,
    });
    expect(linhas).toContain("Ainda precisa de apoio em Frações e referência, Porcentagem.");
    expect(linhas).toContain("2 reflexões escritas ficaram registradas, sem nota automática.");
  });

  it("states that no difficulty repeated when the four-week window is clean", () => {
    expect(narrate({ evidence: [row()] })).toContain(
      "Nenhuma dificuldade repetida apareceu nas últimas quatro semanas.",
    );
  });

  it("never adjectives the student or claims mastery", () => {
    const linhas = narrate({
      evidence: [row(), row({ itemId: "q2", familyId: "precos:promocao" })],
      repeatedDifficulties: [{ skillId: "fracoes" }],
      nextSkillId: "porcentagem",
      reflections: 1,
      states: [state()],
    });
    const texto = linhas.join(" ");
    expect(texto).not.toMatch(/domin|excelente|ótim|fraco|inteligen|talento|capacidade|nível/i);
    // "Nota" só pode aparecer negando a nota automática das reflexões.
    expect(texto.match(/nota\w*/gi)).toEqual(["nota"]);
    expect(texto).toContain("sem nota automática");
  });
});

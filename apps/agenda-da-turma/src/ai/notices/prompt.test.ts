import { describe, expect, it } from "vitest";
import { buildNoticeUserMessage } from "./prompt";

const input = { text: "Prova de matemática 30/09.", source: "teams", publishedAt: null };

describe("buildNoticeUserMessage", () => {
  it("lists the child's subjects, deduplicated and on one line", () => {
    const message = buildNoticeUserMessage(input, undefined, {
      subjectNames: ["Matemática", " Língua\nPortuguesa ", "Matemática", ""],
      currentYear: "2026",
    });
    expect(message).toContain("Matérias cadastradas da criança: Matemática; Língua Portuguesa.");
    expect(message).toContain("Ano corrente: 2026");
    expect(message).toContain("Páginas originais selecionadas: não se aplica.");
    expect(message.endsWith("RECADO:\nProva de matemática 30/09.")).toBe(true);
  });
  it("says so when the child has no subjects, and keeps the publication and pages", () => {
    const message = buildNoticeUserMessage({ ...input, publishedAt: "2026-09-24" }, [2, 3], {
      subjectNames: [],
      currentYear: "2026",
    });
    expect(message).toContain("Matérias cadastradas da criança: nenhuma.");
    expect(message).toContain("fornecida pela família: 2026-09-24.");
    expect(message).toContain("Páginas originais selecionadas: 2, 3.");
  });
  it("names the chosen child's turma and the other turmas of the house, without names", () => {
    const message = buildNoticeUserMessage(input, undefined, {
      subjectNames: [],
      currentYear: "2026",
      turmaLabel: "6º ano A",
      otherTurmaLabels: ["3º ano B", "6º ano A", " 3º ano B "],
    });
    expect(message).toContain("Turma da criança escolhida: 6º ano A.");
    // A própria turma não se repete entre as "outras", e duplicatas somem.
    expect(message).toContain("Outras crianças da casa estão em: 3º ano B.");
    expect(message).not.toContain("3º ano B; 3º ano B");
  });
  it("says the turma is unknown when there is none, and stays quiet about others", () => {
    const message = buildNoticeUserMessage(input, undefined, {
      subjectNames: [],
      currentYear: "2026",
    });
    expect(message).toContain("Turma da criança escolhida: não informada.");
    expect(message).not.toContain("Outras crianças");
  });
});

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
});

import { describe, expect, it } from "vitest";
import {
  actionFieldsSchema,
  NOTICE_EXTRACTION_TYPES,
  noticeExtractionSchema,
  noticeGenerationSchema,
} from "./schemas";

const base = {
  profileId: "11111111-1111-4111-8111-111111111111",
  type: "task" as const,
  title: "Ler o capítulo 3",
  description: null,
  dueAt: null,
  dateOrigin: "unspecified" as const,
  time: null,
  location: null,
  sourceExcerpt: null,
};

const SUBJECT = "22222222-2222-4222-8222-222222222222";
const EXTRA = "33333333-3333-4333-8333-333333333333";

describe("actionFieldsSchema: matéria", () => {
  it("aceita a providência sem matéria", () => {
    const parsed = actionFieldsSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subjectId).toBeNull();
      expect(parsed.data.profileSubjectId).toBeNull();
    }
  });

  it("aceita matéria da turma", () => {
    const parsed = actionFieldsSchema.safeParse({ ...base, subjectId: SUBJECT });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.subjectId).toBe(SUBJECT);
  });

  it("aceita matéria extracurricular", () => {
    const parsed = actionFieldsSchema.safeParse({ ...base, profileSubjectId: EXTRA });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.profileSubjectId).toBe(EXTRA);
  });

  // O banco também impede, via CHECK `agenda_action_subject_exclusive_check`.
  it("recusa as duas ao mesmo tempo", () => {
    const parsed = actionFieldsSchema.safeParse({
      ...base,
      subjectId: SUBJECT,
      profileSubjectId: EXTRA,
    });
    expect(parsed.success).toBe(false);
  });

  it("mantém a regra de prazo e origem", () => {
    expect(actionFieldsSchema.safeParse({ ...base, dueAt: "2026-09-20" }).success).toBe(false);
    expect(
      actionFieldsSchema.safeParse({ ...base, dueAt: "2026-09-20", dateOrigin: "family" }).success,
    ).toBe(true);
  });
});

describe("actionFieldsSchema: compartilhar com a turma", () => {
  const dated = { ...base, dueAt: "2026-09-20", dateOrigin: "school" as const };

  it("não compartilha por omissão", () => {
    const parsed = actionFieldsSchema.safeParse(base);
    expect(parsed.success && parsed.data.shareWithTurma).toBe(false);
  });

  it("aceita compartilhar quando há matéria da turma e prazo", () => {
    const parsed = actionFieldsSchema.safeParse({
      ...dated,
      subjectId: SUBJECT,
      shareWithTurma: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("recusa compartilhar sem prazo: a turma precisa saber até quando", () => {
    const parsed = actionFieldsSchema.safeParse({
      ...base,
      subjectId: SUBJECT,
      shareWithTurma: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("recusa compartilhar uma extracurricular: não há turma do outro lado", () => {
    const parsed = actionFieldsSchema.safeParse({
      ...dated,
      profileSubjectId: EXTRA,
      shareWithTurma: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("recusa compartilhar sem matéria nenhuma", () => {
    const parsed = actionFieldsSchema.safeParse({ ...dated, shareWithTurma: true });
    expect(parsed.success).toBe(false);
  });
});

describe("subjectHint: pista da leitura, nunca vínculo gravado", () => {
  const extracted = {
    type: "task" as const,
    title: "Ciências: capítulos 10, 11 e 12",
    description: null,
    dueAt: "2026-10-27",
    dateOrigin: "school" as const,
    time: null,
    location: null,
    sourceExcerpt: "Ciências capítulos 10, 11 e 12 · 27/10",
  };

  it("a geração exige a chave presente, aceitando null", () => {
    const generation = { actions: [extracted], warnings: [], publicationReference: null };
    expect(noticeGenerationSchema.safeParse(generation).success).toBe(false);
    expect(
      noticeGenerationSchema.safeParse({
        ...generation,
        actions: [{ ...extracted, subjectHint: null }],
      }).success,
    ).toBe(true);
    expect(
      noticeGenerationSchema.safeParse({
        ...generation,
        actions: [{ ...extracted, subjectHint: "Ciências" }],
      }).success,
    ).toBe(true);
  });

  it("a leitura de rascunhos antigos aceita a chave ausente", () => {
    const parsed = noticeExtractionSchema.safeParse({ actions: [extracted], warnings: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.actions[0]?.subjectHint).toBeUndefined();
  });

  it("o formulário descarta a pista: só subjectId/profileSubjectId chegam ao servidor", () => {
    const parsed = actionFieldsSchema.safeParse({ ...base, subjectHint: "Ciências" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("subjectHint" in parsed.data).toBe(false);
  });
});

describe("tipos que a leitura pode produzir", () => {
  it("nunca inclui sessão de estudo", () => {
    // Sessão de estudo é planejamento da família e nasce ligada a uma prova.
    // `study` entrou no vocabulário compartilhado num lote posterior e a
    // leitura o herdou de graça, contra a regra documentada.
    expect(NOTICE_EXTRACTION_TYPES).not.toContain("study");
    expect(NOTICE_EXTRACTION_TYPES).toContain("exam");
    expect(NOTICE_EXTRACTION_TYPES).toHaveLength(7);
  });

  it("recusa uma sessão de estudo vinda do modelo", () => {
    const action = {
      type: "study",
      title: "Estudar para a prova",
      description: null,
      dueAt: null,
      dateOrigin: "unspecified",
      time: null,
      location: null,
      sourceExcerpt: null,
      subjectHint: null,
    };
    expect(
      noticeGenerationSchema.safeParse({
        actions: [action],
        warnings: [],
        publicationReference: null,
      }).success,
    ).toBe(false);
  });

  it("continua lendo um rascunho guardado que tenha uma", () => {
    // O estreitamento vale na geração; a leitura precisa continuar abrindo o
    // que já está no banco.
    expect(
      noticeExtractionSchema.safeParse({
        actions: [
          {
            type: "study",
            title: "Estudar para a prova",
            description: null,
            dueAt: null,
            dateOrigin: "unspecified",
            time: null,
            location: null,
            sourceExcerpt: null,
          },
        ],
        warnings: [],
      }).success,
    ).toBe(true);
  });
});

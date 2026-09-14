import { describe, expect, it } from "vitest";
import { actionFieldsSchema } from "./schemas";

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

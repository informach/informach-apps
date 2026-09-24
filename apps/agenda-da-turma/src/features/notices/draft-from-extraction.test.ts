import { describe, expect, it } from "vitest";
import type { SubjectOption } from "@/features/subjects/options-service";
import { draftFromExtractedAction } from "./draft-from-extraction";
import { actionFieldsSchema, type ExtractedAction } from "./schemas";

const profileId = "11111111-1111-4111-8111-111111111111";
const turmaSubject = (
  name: string,
  id: string,
  classDays: SubjectOption["classDays"] = [],
): SubjectOption => ({ id, name, colorIndex: 1, source: "turma", classDays, alternatingSlots: [] });
const options: SubjectOption[] = [
  turmaSubject("Língua Portuguesa", "22222222-2222-4222-8222-222222222222", ["mon", "wed"]),
  turmaSubject("Ciências", "33333333-3333-4333-8333-333333333333"),
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Natação",
    colorIndex: 2,
    source: "extra",
    classDays: ["fri"],
    alternatingSlots: [],
  },
];
const base: ExtractedAction = {
  type: "task",
  title: "Ciências: capítulos 10, 11 e 12",
  description: "Grupo 1 · Eureka",
  dueAt: "2026-10-27",
  dateOrigin: "school",
  time: null,
  location: null,
  sourceExcerpt: "Ciências capítulos 10, 11 e 12 · Prazo final 27/10",
  subjectHint: "Ciências",
};
// Segunda de 14/09/2026: a próxima aula de segunda/quarta é quarta, 16/09.
const todayIso = "2026-09-14";

describe("draftFromExtractedAction", () => {
  it("links the turma subject from the hint and keeps the school deadline", () => {
    const draft = draftFromExtractedAction(base, profileId, options, { todayIso });
    expect(draft.subjectHint).toBe("Ciências");
    expect(draft.value.subjectId).toBe("33333333-3333-4333-8333-333333333333");
    expect(draft.value.profileSubjectId).toBeNull();
    expect(draft.value.dueAt).toBe("2026-10-27");
    expect(draft.value.dateOrigin).toBe("school");
    expect(draft.value.shareWithTurma).toBe(false);
    expect(actionFieldsSchema.safeParse(draft.value).success).toBe(true);
    expect("subjectHint" in draft.value).toBe(false);
  });
  it("matches aliases and typos against the registered names", () => {
    expect(
      draftFromExtractedAction({ ...base, subjectHint: "Português" }, profileId, options).value
        .subjectId,
    ).toBe("22222222-2222-4222-8222-222222222222");
    expect(
      draftFromExtractedAction({ ...base, subjectHint: "ciencas" }, profileId, options).value
        .subjectId,
    ).toBe("33333333-3333-4333-8333-333333333333");
  });
  it("links an extracurricular subject through profileSubjectId", () => {
    const draft = draftFromExtractedAction({ ...base, subjectHint: "natação" }, profileId, options);
    expect(draft.value.subjectId).toBeNull();
    expect(draft.value.profileSubjectId).toBe("44444444-4444-4444-8444-444444444444");
  });
  it("keeps the hint but no link when nothing registered matches", () => {
    const draft = draftFromExtractedAction(
      { ...base, subjectHint: "Espanhol" },
      profileId,
      options,
    );
    expect(draft.subjectHint).toBe("Espanhol");
    expect(draft.value.subjectId).toBeNull();
    expect(draft.value.profileSubjectId).toBeNull();
  });
  it("treats drafts saved before the hint existed as hint-less", () => {
    const { subjectHint: _hint, ...legacy } = base;
    const draft = draftFromExtractedAction(legacy, profileId, options);
    expect(draft.subjectHint).toBeNull();
    expect(draft.value.subjectId).toBeNull();
  });
  it("suggests the next class only when the subject matched and there is no deadline", () => {
    const draft = draftFromExtractedAction(
      { ...base, subjectHint: "Língua Portuguesa", dueAt: null, dateOrigin: "unspecified" },
      profileId,
      options,
      { todayIso },
    );
    expect(draft.value.dueAt).toBe("2026-09-16");
    expect(draft.value.dateOrigin).toBe("schedule");
    expect(actionFieldsSchema.safeParse(draft.value).success).toBe(true);
  });
  it("shares with the turma by default only with subject, deadline and permission", () => {
    expect(
      draftFromExtractedAction(base, profileId, options, { defaultShare: true }).value
        .shareWithTurma,
    ).toBe(true);
    // Sem a permissão da casa, nada é publicado.
    expect(draftFromExtractedAction(base, profileId, options).value.shareWithTurma).toBe(false);
    // Extracurricular não tem turma do outro lado.
    expect(
      draftFromExtractedAction({ ...base, subjectHint: "natação" }, profileId, options, {
        defaultShare: true,
      }).value.shareWithTurma,
    ).toBe(false);
    // Sem matéria cadastrada, não há o que a turma receba.
    expect(
      draftFromExtractedAction({ ...base, subjectHint: "Espanhol" }, profileId, options, {
        defaultShare: true,
      }).value.shareWithTurma,
    ).toBe(false);
    // Sem prazo, a turma não saberia até quando.
    expect(
      draftFromExtractedAction(
        { ...base, subjectHint: "Ciências", dueAt: null, dateOrigin: "unspecified" },
        profileId,
        options,
        { defaultShare: true, todayIso },
      ).value.shareWithTurma,
    ).toBe(false);
  });

  it("keeps a schedule-suggested deadline out of the turma", () => {
    // A próxima aula é planejamento desta casa, não o prazo que a escola deu.
    const draft = draftFromExtractedAction(
      { ...base, subjectHint: "Língua Portuguesa", dueAt: null, dateOrigin: "unspecified" },
      profileId,
      options,
      { defaultShare: true, todayIso },
    );
    expect(draft.value.dateOrigin).toBe("schedule");
    expect(draft.value.shareWithTurma).toBe(false);
  });

  it("never invents a date without a schedule or without a match", () => {
    const noSchedule = draftFromExtractedAction(
      { ...base, subjectHint: "Ciências", dueAt: null, dateOrigin: "unspecified" },
      profileId,
      options,
      { todayIso },
    );
    expect(noSchedule.value.dueAt).toBeNull();
    expect(noSchedule.value.dateOrigin).toBe("unspecified");
    const noMatch = draftFromExtractedAction(
      { ...base, subjectHint: "Espanhol", dueAt: null, dateOrigin: "unspecified" },
      profileId,
      options,
      { todayIso },
    );
    expect(noMatch.value.dueAt).toBeNull();
  });
});

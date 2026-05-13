import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVITY_DESCRIPTION_LENGTH,
  MAX_ACTIVITY_TITLE_LENGTH,
} from "@/features/activities/limits";
import {
  activitiesParserSchema,
  MAX_ACTIVITIES_PER_BATCH,
  MAX_STUDENT_HINT_LENGTH,
  MAX_SUBJECT_HINT_LENGTH,
} from "./schema";

const baseActivity = {
  title: "Fazer páginas 32 e 33",
  description: "Capítulo 4 inteiro",
  type: "task" as const,
  dueAt: "2026-05-15",
  subjectHint: "Matemática",
  studentNameHint: "Pedro",
};

describe("activitiesParserSchema", () => {
  it("aceita um payload válido com uma atividade", () => {
    const result = activitiesParserSchema.parse({
      isValidInput: true,
      reason: null,
      activities: [baseActivity],
    });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.title).toBe("Fazer páginas 32 e 33");
    expect(result.activities[0]?.dueAt).toBe("2026-05-15");
  });

  it("aceita dueAt nulo (sem data inferida)", () => {
    const result = activitiesParserSchema.parse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, dueAt: null }],
    });
    expect(result.activities[0]?.dueAt).toBeNull();
  });

  it("aceita description nula", () => {
    const result = activitiesParserSchema.parse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, description: null }],
    });
    expect(result.activities[0]?.description).toBeNull();
  });

  it("aceita subjectHint e studentNameHint nulos", () => {
    const result = activitiesParserSchema.parse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, subjectHint: null, studentNameHint: null }],
    });
    expect(result.activities[0]?.subjectHint).toBeNull();
    expect(result.activities[0]?.studentNameHint).toBeNull();
  });

  it("aceita isValidInput=false com array vazio + reason", () => {
    const result = activitiesParserSchema.parse({
      isValidInput: false,
      reason: "Não identifiquei atividades no áudio.",
      activities: [],
    });
    expect(result.isValidInput).toBe(false);
    expect(result.reason).toBe("Não identifiquei atividades no áudio.");
  });

  it("rejeita dueAt com formato inválido", () => {
    for (const dueAt of ["amanhã", "2026/05/15", "15-05-2026", "2026-5-15"]) {
      const result = activitiesParserSchema.safeParse({
        isValidInput: true,
        reason: null,
        activities: [{ ...baseActivity, dueAt }],
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejeita type inválido", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, type: "homework" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita title vazio", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita title acima do limite", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, title: "x".repeat(MAX_ACTIVITY_TITLE_LENGTH + 1) }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita description acima do limite", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [
        { ...baseActivity, description: "x".repeat(MAX_ACTIVITY_DESCRIPTION_LENGTH + 1) },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita subjectHint acima do limite", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, subjectHint: "x".repeat(MAX_SUBJECT_HINT_LENGTH + 1) }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita studentNameHint acima do limite", () => {
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities: [{ ...baseActivity, studentNameHint: "x".repeat(MAX_STUDENT_HINT_LENGTH + 1) }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita array acima de MAX_ACTIVITIES_PER_BATCH", () => {
    const activities = Array.from({ length: MAX_ACTIVITIES_PER_BATCH + 1 }, () => baseActivity);
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities,
    });
    expect(result.success).toBe(false);
  });

  it("aceita array no limite exato", () => {
    const activities = Array.from({ length: MAX_ACTIVITIES_PER_BATCH }, () => baseActivity);
    const result = activitiesParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      activities,
    });
    expect(result.success).toBe(true);
  });
});

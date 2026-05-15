import { describe, expect, it } from "vitest";
import { MAX_ACTIVITY_DESCRIPTION_LENGTH, MAX_ACTIVITY_TITLE_LENGTH } from "./limits";
import {
  createActivityInputSchema,
  respondSharedActivityInputSchema,
  setActivityStatusInputSchema,
  updateActivityInputSchema,
} from "./schemas";

const validUuid = "11111111-1111-1111-1111-111111111111";

const baseCreate = {
  turmaId: validUuid,
  subjectId: validUuid,
  type: "task" as const,
  title: "Fazer páginas 32 e 33",
  description: "Pode pular o exercício 5",
  dueAt: "2026-06-01",
  visibility: "individual" as const,
};

describe("createActivityInputSchema", () => {
  it("aceita payload válido e preserva dueAt como string YYYY-MM-DD", () => {
    const result = createActivityInputSchema.parse(baseCreate);
    expect(result.dueAt).toBe("2026-06-01");
    expect(result.title).toBe("Fazer páginas 32 e 33");
    expect(result.visibility).toBe("individual");
  });

  it("default visibility=individual quando não informado", () => {
    const { visibility, ...rest } = baseCreate;
    const result = createActivityInputSchema.parse(rest);
    expect(result.visibility).toBe("individual");
  });

  it("converte description vazia em undefined", () => {
    const result = createActivityInputSchema.parse({ ...baseCreate, description: "   " });
    expect(result.description).toBeUndefined();
  });

  it("rejeita title vazio", () => {
    const result = createActivityInputSchema.safeParse({ ...baseCreate, title: "  " });
    expect(result.success).toBe(false);
  });

  it("rejeita title muito longo", () => {
    const result = createActivityInputSchema.safeParse({
      ...baseCreate,
      title: "x".repeat(MAX_ACTIVITY_TITLE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita description muito longa", () => {
    const result = createActivityInputSchema.safeParse({
      ...baseCreate,
      description: "x".repeat(MAX_ACTIVITY_DESCRIPTION_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita type inválido", () => {
    const result = createActivityInputSchema.safeParse({
      ...baseCreate,
      type: "homework",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita dueAt vazio", () => {
    const result = createActivityInputSchema.safeParse({ ...baseCreate, dueAt: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita dueAt inválido", () => {
    const result = createActivityInputSchema.safeParse({ ...baseCreate, dueAt: "not a date" });
    expect(result.success).toBe(false);
  });

  it("rejeita dueAt impossível no calendário", () => {
    for (const dueAt of ["2026-02-30", "2026-04-31", "2025-02-29"]) {
      const result = createActivityInputSchema.safeParse({ ...baseCreate, dueAt });
      expect(result.success).toBe(false);
    }
  });

  it("rejeita dueAt com hora (datetime-local format)", () => {
    const result = createActivityInputSchema.safeParse({
      ...baseCreate,
      dueAt: "2026-06-01T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita turmaId não-uuid", () => {
    const result = createActivityInputSchema.safeParse({ ...baseCreate, turmaId: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("updateActivityInputSchema", () => {
  it("aceita payload de update", () => {
    const result = updateActivityInputSchema.parse({
      id: validUuid,
      subjectId: validUuid,
      type: "exam",
      title: "Prova de história",
      dueAt: "2026-06-02",
      visibility: "individual",
    });
    expect(result.type).toBe("exam");
    expect(result.dueAt).toBe("2026-06-02");
    expect(result.subjectId).toBe(validUuid);
    expect(result.visibility).toBe("individual");
  });

  it("default visibility=individual quando não informado", () => {
    const result = updateActivityInputSchema.parse({
      id: validUuid,
      subjectId: validUuid,
      type: "exam",
      title: "Prova de história",
      dueAt: "2026-06-02",
    });
    expect(result.visibility).toBe("individual");
  });

  it("aceita visibility=shared_with_turma", () => {
    const result = updateActivityInputSchema.parse({
      id: validUuid,
      subjectId: validUuid,
      type: "exam",
      title: "Prova de história",
      dueAt: "2026-06-02",
      visibility: "shared_with_turma",
    });
    expect(result.visibility).toBe("shared_with_turma");
  });

  it("rejeita id não-uuid", () => {
    const result = updateActivityInputSchema.safeParse({
      id: "abc",
      subjectId: validUuid,
      type: "task",
      title: "x",
      dueAt: "2026-06-02",
      visibility: "individual",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita subjectId não-uuid", () => {
    const result = updateActivityInputSchema.safeParse({
      id: validUuid,
      subjectId: "not-a-uuid",
      type: "task",
      title: "x",
      dueAt: "2026-06-02",
      visibility: "individual",
    });
    expect(result.success).toBe(false);
  });
});

describe("setActivityStatusInputSchema", () => {
  it("aceita os dois status válidos", () => {
    for (const status of ["pending", "done"] as const) {
      const result = setActivityStatusInputSchema.parse({
        activityId: validUuid,
        studentProfileId: validUuid,
        status,
      });
      expect(result.status).toBe(status);
    }
  });

  it("rejeita in_progress (removido na simplificação)", () => {
    const result = setActivityStatusInputSchema.safeParse({
      activityId: validUuid,
      studentProfileId: validUuid,
      status: "in_progress",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita status inválido", () => {
    const result = setActivityStatusInputSchema.safeParse({
      activityId: validUuid,
      studentProfileId: validUuid,
      status: "abandoned",
    });
    expect(result.success).toBe(false);
  });
});

describe("respondSharedActivityInputSchema", () => {
  it("aceita aceitar e rejeitar", () => {
    expect(
      respondSharedActivityInputSchema.parse({ activityId: validUuid, accepted: true }).accepted,
    ).toBe(true);
    expect(
      respondSharedActivityInputSchema.parse({ activityId: validUuid, accepted: false }).accepted,
    ).toBe(false);
  });
});

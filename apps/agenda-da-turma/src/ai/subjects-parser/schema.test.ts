import { describe, expect, it } from "vitest";
import { MAX_SUBJECTS_PER_BATCH, subjectsParserSchema } from "./schema";

describe("subjectsParserSchema", () => {
  it("aceita saída válida com lista de matérias", () => {
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects: [
        { name: "Matemática", teacherName: "Carla" },
        { name: "Português", teacherName: null },
        { name: "Educação Física", teacherName: "Roberto Lima" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subjects).toHaveLength(3);
      expect(result.data.subjects[1]?.teacherName).toBeNull();
    }
  });

  it("aceita saída negativa com reason e lista vazia", () => {
    const result = subjectsParserSchema.safeParse({
      isValidInput: false,
      reason: "Não identifiquei matérias escolares no áudio.",
      subjects: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects: [{ name: "", teacherName: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita teacherName vazio (deve ser null quando ausente)", () => {
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects: [{ name: "Matemática", teacherName: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name maior que MAX_SUBJECT_NAME_LENGTH (80)", () => {
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects: [{ name: "x".repeat(81), teacherName: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita lista acima do limite duro MAX_SUBJECTS_PER_BATCH", () => {
    const subjects = Array.from({ length: MAX_SUBJECTS_PER_BATCH + 1 }, (_, i) => ({
      name: `Matéria ${i}`,
      teacherName: null,
    }));
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects,
    });
    expect(result.success).toBe(false);
  });

  it("aceita exatamente MAX_SUBJECTS_PER_BATCH entradas", () => {
    const subjects = Array.from({ length: MAX_SUBJECTS_PER_BATCH }, (_, i) => ({
      name: `Matéria ${i}`,
      teacherName: null,
    }));
    const result = subjectsParserSchema.safeParse({
      isValidInput: true,
      reason: null,
      subjects,
    });
    expect(result.success).toBe(true);
  });
});

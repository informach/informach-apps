import { describe, expect, it } from "vitest";
import {
  createSubjectInputSchema,
  deleteSubjectInputSchema,
  subjectFormSchema,
  updateSubjectInputSchema,
} from "./schemas";

const validTurmaId = "1bcb37c6-5a18-4d62-a8b6-3ad0bc3e3f10";
const validSubjectId = "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5";

describe("createSubjectInputSchema", () => {
  it("accepts valid input", () => {
    const result = createSubjectInputSchema.safeParse({
      turmaId: validTurmaId,
      name: "Matemática",
      teacherName: "Carla",
    });
    expect(result.success).toBe(true);
  });

  it("trims the name", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "  Matemática  ",
    });
    expect(parsed.name).toBe("Matemática");
  });

  it("converts empty teacherName to undefined", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "História",
      teacherName: "",
    });
    expect(parsed.teacherName).toBeUndefined();
  });

  it("converts missing teacherName to undefined", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "Geografia",
    });
    expect(parsed.teacherName).toBeUndefined();
  });

  it("rejects empty name", () => {
    const result = createSubjectInputSchema.safeParse({
      turmaId: validTurmaId,
      name: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 80 chars", () => {
    const result = createSubjectInputSchema.safeParse({
      turmaId: validTurmaId,
      name: "x".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed turmaId", () => {
    const result = createSubjectInputSchema.safeParse({
      turmaId: "not-uuid",
      name: "Matemática",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSubjectInputSchema", () => {
  it("requires id as uuid", () => {
    expect(
      updateSubjectInputSchema.safeParse({
        id: validSubjectId,
        name: "Matemática",
      }).success,
    ).toBe(true);
    expect(
      updateSubjectInputSchema.safeParse({
        id: "x",
        name: "Matemática",
      }).success,
    ).toBe(false);
  });
});

describe("deleteSubjectInputSchema", () => {
  it("requires id as uuid", () => {
    expect(deleteSubjectInputSchema.safeParse({ id: validSubjectId }).success).toBe(true);
    expect(deleteSubjectInputSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("subjectFormSchema", () => {
  it("accepts only name+teacherName (no turmaId)", () => {
    expect(subjectFormSchema.safeParse({ name: "Matemática" }).success).toBe(true);
  });
});

describe("classDays", () => {
  it("defaults to [] when omitted", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "Matemática",
    });
    expect(parsed.classDays).toEqual([]);
  });

  it("normaliza pra ordem canônica Seg→Sex", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "Matemática",
      classDays: ["fri", "mon", "wed"],
    });
    expect(parsed.classDays).toEqual(["mon", "wed", "fri"]);
  });

  it("deduplica dias repetidos", () => {
    const parsed = createSubjectInputSchema.parse({
      turmaId: validTurmaId,
      name: "Matemática",
      classDays: ["mon", "mon", "tue", "tue"],
    });
    expect(parsed.classDays).toEqual(["mon", "tue"]);
  });

  it("rejeita valores fora do enum (sat/sun não suportados no v1)", () => {
    const result = createSubjectInputSchema.safeParse({
      turmaId: validTurmaId,
      name: "Matemática",
      classDays: ["mon", "sat"],
    });
    expect(result.success).toBe(false);
  });
});

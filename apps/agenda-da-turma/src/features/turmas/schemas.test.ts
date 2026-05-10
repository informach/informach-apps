import { describe, expect, it } from "vitest";
import {
  createTurmaInputSchema,
  joinByCodeInputSchema,
  setActiveTurmaInputSchema,
} from "./schemas";

const validProfileId = "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5";
const validTurmaId = "1bcb37c6-5a18-4d62-a8b6-3ad0bc3e3f10";

const baseCreate = {
  schoolInepCode: "DEVSCH0001",
  grade: "5ano" as const,
  year: 2026,
  classLetter: "A",
  profileId: validProfileId,
};

describe("createTurmaInputSchema", () => {
  it("accepts valid input", () => {
    expect(createTurmaInputSchema.safeParse(baseCreate).success).toBe(true);
  });

  it("rejects unknown grade", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, grade: "10ano" }).success).toBe(false);
  });

  it("rejects year below the minimum", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, year: 2010 }).success).toBe(false);
  });

  it("rejects year above the maximum", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, year: 2200 }).success).toBe(false);
  });

  it("rejects lowercase class letter", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, classLetter: "a" }).success).toBe(
      false,
    );
  });

  it("rejects multi-character class letter", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, classLetter: "AB" }).success).toBe(
      false,
    );
  });

  it("rejects malformed profileId", () => {
    expect(createTurmaInputSchema.safeParse({ ...baseCreate, profileId: "not-uuid" }).success).toBe(
      false,
    );
  });
});

describe("joinByCodeInputSchema", () => {
  it("accepts a valid uppercase code from the alphabet", () => {
    const result = joinByCodeInputSchema.safeParse({
      code: "B7K3PX",
      profileId: validProfileId,
    });
    expect(result.success).toBe(true);
  });

  it("uppercases lowercase input before validating", () => {
    const result = joinByCodeInputSchema.parse({
      code: "b7k3px",
      profileId: validProfileId,
    });
    expect(result.code).toBe("B7K3PX");
  });

  it("rejects ambiguous characters (0/O/1/I/L)", () => {
    expect(
      joinByCodeInputSchema.safeParse({ code: "0OILBC", profileId: validProfileId }).success,
    ).toBe(false);
  });

  it("rejects shorter codes", () => {
    expect(
      joinByCodeInputSchema.safeParse({ code: "ABC", profileId: validProfileId }).success,
    ).toBe(false);
  });
});

describe("setActiveTurmaInputSchema", () => {
  it("requires both ids as uuids", () => {
    expect(
      setActiveTurmaInputSchema.safeParse({
        profileId: validProfileId,
        turmaId: validTurmaId,
      }).success,
    ).toBe(true);
    expect(
      setActiveTurmaInputSchema.safeParse({ profileId: "x", turmaId: validTurmaId }).success,
    ).toBe(false);
  });
});

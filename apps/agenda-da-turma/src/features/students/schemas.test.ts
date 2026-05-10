import { describe, expect, it } from "vitest";
import { createStudentProfileInputSchema, updateStudentProfileInputSchema } from "./schemas";

const validBase = {
  name: "Helena",
  birthDate: "2017-03-15",
};

describe("createStudentProfileInputSchema", () => {
  it("accepts a valid input", () => {
    const result = createStudentProfileInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("trims the name", () => {
    const result = createStudentProfileInputSchema.parse({ ...validBase, name: "  Helena  " });
    expect(result.name).toBe("Helena");
  });

  it("rejects empty name", () => {
    const result = createStudentProfileInputSchema.safeParse({ ...validBase, name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 80 characters", () => {
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      name: "a".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed birth date", () => {
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: "15/03/2017",
    });
    expect(result.success).toBe(false);
  });

  it("rejects calendar-invalid birth date", () => {
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: "2026-13-50",
    });
    expect(result.success).toBe(false);
  });

  it("rejects birth date in the future", () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const futureIso = future.toISOString().slice(0, 10);
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: futureIso,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an age greater than 25 years", () => {
    const old = new Date();
    old.setUTCFullYear(old.getUTCFullYear() - 30);
    const oldIso = old.toISOString().slice(0, 10);
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: oldIso,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentProfileInputSchema", () => {
  it("requires a uuid id", () => {
    const result = updateStudentProfileInputSchema.safeParse({ ...validBase, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid uuid id", () => {
    const result = updateStudentProfileInputSchema.safeParse({
      ...validBase,
      id: "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5",
    });
    expect(result.success).toBe(true);
  });
});

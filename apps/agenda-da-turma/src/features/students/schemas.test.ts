import { describe, expect, it } from "vitest";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { createStudentProfileInputSchema, updateStudentProfileInputSchema } from "./schemas";

const validBase = {
  personId: "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5",
  birthDate: "2017-03-15",
};

describe("createStudentProfileInputSchema", () => {
  it("accepts a valid input", () => {
    const result = createStudentProfileInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("requires a canonical person and refuses a second identity", () => {
    expect(
      createStudentProfileInputSchema.safeParse({ ...validBase, personId: "name-as-id" }).success,
    ).toBe(false);
    expect(
      createStudentProfileInputSchema.safeParse({ ...validBase, name: "Helena" }).success,
    ).toBe(false);
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

  it("rejects normalized impossible birth date", () => {
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: "2026-02-30",
    });
    expect(result.success).toBe(false);
  });

  it("rejects birth date in the future", () => {
    const futureIso = addDaysIso(todayLocalIso(), 1);
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: futureIso,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an age greater than 25 years", () => {
    const oldIso = addDaysIso(todayLocalIso(), -(30 * 366));
    const result = createStudentProfileInputSchema.safeParse({
      ...validBase,
      birthDate: oldIso,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentProfileInputSchema", () => {
  it("requires a uuid id", () => {
    const result = updateStudentProfileInputSchema.safeParse({
      birthDate: validBase.birthDate,
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid uuid id", () => {
    const result = updateStudentProfileInputSchema.safeParse({
      birthDate: validBase.birthDate,
      id: "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5",
    });
    expect(result.success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { formatBirthDate, getAgeFromBirthDate, getAvatarColorClass, getInitials } from "./utils";

describe("getAgeFromBirthDate", () => {
  it("returns the completed years before the birthday", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    expect(getAgeFromBirthDate("2017-03-15", now)).toBe(9);
  });

  it("subtracts a year when the birthday hasn't happened yet this year", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    expect(getAgeFromBirthDate("2017-08-20", now)).toBe(8);
  });

  it("returns 0 when the date is the same as today", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    expect(getAgeFromBirthDate("2026-05-10", now)).toBe(0);
  });

  it("returns 0 when the date string is invalid", () => {
    expect(getAgeFromBirthDate("not-a-date")).toBe(0);
  });
});

describe("formatBirthDate", () => {
  it("formats ISO date as DD/MM/YYYY", () => {
    expect(formatBirthDate("2017-03-15")).toBe("15/03/2017");
  });

  it("returns input unchanged when malformed", () => {
    expect(formatBirthDate("invalid")).toBe("invalid");
  });
});

describe("getInitials", () => {
  it("uses first letter when name is one word", () => {
    expect(getInitials("Helena")).toBe("H");
  });

  it("uses first letter of first and last words when multiple", () => {
    expect(getInitials("Helena Maria Silva")).toBe("HS");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("ana paula")).toBe("AP");
  });

  it("returns ? for empty input", () => {
    expect(getInitials("   ")).toBe("?");
  });
});

describe("getAvatarColorClass", () => {
  it("returns a deterministic class for the same seed", () => {
    expect(getAvatarColorClass("Helena")).toBe(getAvatarColorClass("Helena"));
  });

  it("returns one of the chart-N tailwind classes", () => {
    const cls = getAvatarColorClass("Helena");
    expect(cls).toMatch(/^bg-chart-[1-5]$/);
  });
});

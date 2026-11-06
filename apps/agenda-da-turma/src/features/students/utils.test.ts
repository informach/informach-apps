import { describe, expect, it } from "vitest";
import {
  formatBirthDate,
  getAgeFromBirthDate,
  getAvatarColorIndex,
  getInitials,
  shortChildNames,
} from "./utils";

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

describe("getAvatarColorIndex", () => {
  it("returns a deterministic index for the same seed", () => {
    expect(getAvatarColorIndex("Helena")).toBe(getAvatarColorIndex("Helena"));
  });

  it("stays inside the chart-1..5 range, including for an empty seed", () => {
    for (const seed of ["Helena", "Ana Beatriz", "Zé", "", "x".repeat(200)]) {
      const idx = getAvatarColorIndex(seed);
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(5);
    }
  });
});

describe("shortChildNames", () => {
  const names = (...list: string[]) => [
    ...shortChildNames(list.map((name, i) => ({ id: String(i), name }))).values(),
  ];

  it("uses the first name when it already tells the children apart", () => {
    expect(
      names(
        "Maria Eduarda Albuquerque Santos",
        "João Pedro Cavalcanti de Oliveira",
        "Ana Clara Bittencourt",
      ),
    ).toEqual(["Maria", "João", "Ana"]);
  });

  it("adds names only to the siblings that start the same way", () => {
    expect(names("Maria Eduarda Santos", "Maria Clara Santos", "Pedro Santos")).toEqual([
      "Maria Eduarda",
      "Maria Clara",
      "Pedro",
    ]);
  });

  it("never stops on a particle", () => {
    expect(names("Maria de Fátima", "Maria Luísa")).toEqual(["Maria de Fátima", "Maria Luísa"]);
  });

  it("compares without case and keeps a single-word name", () => {
    expect(names("Maria", "maria Eduarda")).toEqual(["Maria", "maria Eduarda"]);
  });

  it("gives up gracefully on identical names and trims spaces", () => {
    expect(names("  Ana   Clara ", "Ana Clara")).toEqual(["Ana Clara", "Ana Clara"]);
  });
});

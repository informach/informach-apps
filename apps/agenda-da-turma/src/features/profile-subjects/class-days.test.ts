import { describe, expect, it } from "vitest";
import { extrasLine } from "./class-days";

describe("extrasLine", () => {
  it("says one extra with its days, in week order", () => {
    expect(extrasLine([{ name: "Natação", classDays: ["sat", "tue"] }])).toBe(
      "Natação às terças e sábados",
    );
    expect(extrasLine([{ name: "Futebol", classDays: ["sat"] }])).toBe("Futebol aos sábados");
    expect(extrasLine([{ name: "Balé", classDays: [] }])).toBe("Balé");
  });

  it("names several extras, and says nothing without any", () => {
    expect(
      extrasLine([
        { name: "Natação", classDays: ["tue"] },
        { name: "Inglês", classDays: ["thu"] },
      ]),
    ).toBe("Natação e Inglês");
    expect(extrasLine([])).toBeNull();
  });
});

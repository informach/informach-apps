import { describe, expect, it } from "vitest";
import { lunchboxesFor } from "./lunchbox";

const meal = (
  day: string,
  slot: "lunch" | "dinner",
  lunchboxServings: number,
  label: string = slot,
) => ({
  day,
  slot,
  lunchboxServings,
  label,
});

describe("marmita no almoço do dia seguinte", () => {
  it("traz a marmita do jantar de ontem", () => {
    const dinner = meal("2026-10-20", "dinner", 1, "Strogonoff");
    expect(lunchboxesFor("2026-10-21", [dinner])).toEqual([dinner]);
  });

  it("traz também a marmita do almoço de ontem, como o editor promete", () => {
    const lunch = meal("2026-10-24", "lunch", 3, "Feijão da vó");
    expect(lunchboxesFor("2026-10-25", [lunch])).toEqual([lunch]);
  });

  it("com marmitas do almoço e do jantar, mostra as duas, a do almoço primeiro", () => {
    const lunch = meal("2026-10-24", "lunch", 2, "Feijão da vó");
    const dinner = meal("2026-10-24", "dinner", 1, "Omelete");
    // As refeições chegam do banco em ordem alfabética de horário: "dinner" antes de "lunch".
    expect(lunchboxesFor("2026-10-25", [dinner, lunch])).toEqual([lunch, dinner]);
  });

  it("não inventa marmita: sem porção separada, ou de outro dia, não aparece", () => {
    expect(
      lunchboxesFor("2026-10-25", [
        meal("2026-10-24", "dinner", 0),
        meal("2026-10-23", "lunch", 2),
        meal("2026-10-25", "lunch", 2),
      ]),
    ).toEqual([]);
  });

  it("atravessa a virada da semana: o domingo dá a marmita de segunda", () => {
    const sunday = meal("2026-10-25", "lunch", 1);
    expect(lunchboxesFor("2026-10-26", [sunday])).toEqual([sunday]);
  });
});

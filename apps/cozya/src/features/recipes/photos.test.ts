import { describe, expect, it } from "vitest";
import { STARTER_RECIPES } from "@/features/kitchen/starter-recipes";
import { recipePhoto, STARTER_SOURCE } from "./photos";

describe("foto do prato na capa", () => {
  it("usa a foto que o Cozya tem para a receita da coleção", () => {
    const pasta = STARTER_RECIPES.find((item) => item.name.startsWith("Macarrão"));
    expect(pasta?.sourceName).toBe(STARTER_SOURCE);
    expect(recipePhoto({ name: pasta?.name ?? "", sourceName: pasta?.sourceName })).toBe(
      "/marketing/jantar.webp",
    );
  });

  it("não põe foto em receita da casa, nem na da coleção que mudou de nome", () => {
    expect(
      recipePhoto({ name: "Macarrão com tomate e grão-de-bico", sourceName: "Caderno da vó" }),
    ).toBeNull();
    expect(recipePhoto({ name: "Macarrão da Bia", sourceName: STARTER_SOURCE })).toBeNull();
    expect(recipePhoto({ name: "Omelete de abobrinha", sourceName: STARTER_SOURCE })).toBeNull();
  });

  it("não usa uma foto que mostra outro prato", () => {
    // marmitas.webp tem legumes assados que o arroz com lentilha e cenoura não leva.
    const rice = STARTER_RECIPES.find((item) => item.name === "Arroz com lentilha e cenoura");
    expect(rice?.sourceName).toBe(STARTER_SOURCE);
    expect(recipePhoto({ name: rice?.name ?? "", sourceName: rice?.sourceName })).toBeNull();
  });
});

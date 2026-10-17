import { describe, expect, it } from "vitest";
import {
  byFavoriteAndTime,
  matchesSearch,
  type RecipeChoice,
  sinceLabel,
  suggestionsFor,
} from "./recipe-choices";

const NOW = new Date("2026-10-20T15:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000);

function recipe(name: string, values: Partial<RecipeChoice> = {}): RecipeChoice {
  return {
    id: name,
    name,
    servings: 4,
    totalMinutes: null,
    isFavorite: false,
    ingredients: "",
    lastCookedAt: null,
    verdict: null,
    ...values,
  };
}

describe("escolher a refeição", () => {
  it("acha por ingrediente, sem acento e sem caixa", () => {
    const stroganoff = recipe("Strogonoff de frango", {
      ingredients: "600 g de peito de frango\n200 g de champignon fatiado",
    });
    expect(matchesSearch(stroganoff, "CHAMPIGNON")).toBe(true);
    expect(matchesSearch(stroganoff, "strogonoff")).toBe(true);
    expect(matchesSearch(recipe("Feijão da vó"), "feijao")).toBe(true);
    expect(matchesSearch(stroganoff, "abobrinha")).toBe(false);
  });

  it("põe favoritas primeiro, depois o que não se faz há mais tempo e o não repetiria por último", () => {
    const list = [
      recipe("Omelete", { lastCookedAt: daysAgo(3) }),
      recipe("Panqueca"),
      recipe("Escondidinho", { lastCookedAt: daysAgo(35) }),
      recipe("Feijão da vó", { isFavorite: true, lastCookedAt: daysAgo(1) }),
      recipe("Salada", { verdict: "skip", isFavorite: true }),
    ].sort(byFavoriteAndTime);
    expect(list.map((item) => item.name)).toEqual([
      "Feijão da vó",
      "Escondidinho",
      "Omelete",
      "Panqueca",
      "Salada",
    ]);
  });

  it("diz há quanto tempo, como na conversa", () => {
    expect(sinceLabel(recipe("A"), NOW)).toBe("ainda não fez");
    expect(sinceLabel(recipe("A", { lastCookedAt: daysAgo(31) }), NOW)).toBe("faz um mês");
    expect(sinceLabel(recipe("A", { lastCookedAt: daysAgo(65) }), NOW)).toBe("faz 2 meses");
    expect(sinceLabel(recipe("A", { lastCookedAt: daysAgo(15) }), NOW)).toBe("faz 2 semanas");
    expect(sinceLabel(recipe("A", { lastCookedAt: daysAgo(1) }), NOW)).toBe("feita ontem");
  });

  it("sugere uma que faz tempo, uma que nunca fez e uma favorita, fora da semana", () => {
    const picks = suggestionsFor(
      [
        recipe("Strogonoff", { lastCookedAt: daysAgo(2) }),
        recipe("Escondidinho", { lastCookedAt: daysAgo(32) }),
        recipe("Panqueca"),
        recipe("Bolo de cenoura", { isFavorite: true, lastCookedAt: daysAgo(5) }),
        recipe("Salada", { verdict: "skip" }),
        recipe("Macarrão", { lastCookedAt: daysAgo(40) }),
      ],
      new Set(["Macarrão"]),
      NOW,
    );
    expect(picks.map(({ recipe: item, reason }) => `${item.name} · ${reason}`)).toEqual([
      "Escondidinho · faz um mês",
      "Panqueca · ainda não fez",
      "Bolo de cenoura · favorita",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { buildShoppingListText, buildShoppingWhatsappUrl } from "./share-list";

describe("lista do mercado pelo WhatsApp", () => {
  const items = [
    { name: "Alho", amount: "9 dentes", category: "hortifruti", state: "todo" as const },
    { name: "Batata", amount: "800 g", category: "hortifruti", state: "bought" as const },
    { name: "Ovos", amount: "8", category: "proteinas", state: "have" as const },
    { name: "Creme de leite", amount: "1 caixa", category: "laticinios", state: "todo" as const },
    { name: "Páprica", amount: "1 colher de chá", category: "despensa", state: "todo" as const },
    { name: "Sal", amount: "a gosto", category: "despensa", state: "have" as const },
  ];

  it("leva só o que falta, agrupado pelos corredores", () => {
    expect(buildShoppingListText("19 a 25 de outubro", items)).toBe(
      [
        "*Lista do mercado* · 19 a 25 de outubro",
        "",
        "*Hortifruti*",
        "• Alho: 9 dentes",
        "",
        "*Frios e laticínios*",
        "• Creme de leite: 1 caixa",
        "",
        "*Da despensa*",
        "• Páprica: 1 colher de chá",
      ].join("\n"),
    );
  });

  it("avisa quando não falta nada e monta o link do WhatsApp", () => {
    const done = items.map((item) => ({ ...item, state: "have" as const }));
    expect(buildShoppingListText("19 a 25 de outubro", done)).toContain("Tudo em casa.");
    expect(buildShoppingWhatsappUrl("19 a 25 de outubro", done)).toMatch(
      /^https:\/\/wa\.me\/\?text=/,
    );
  });
});

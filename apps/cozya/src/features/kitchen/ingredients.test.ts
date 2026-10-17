import { describe, expect, it } from "vitest";
import { addDays, weekStart } from "./dates";
import {
  consolidateShopping,
  formatAmount,
  parseIngredientLine,
  parseIngredients,
  scaleIngredient,
  shoppingKeyFor,
  splitPreparation,
} from "./ingredients";

describe("quantidades para cozinhar e comprar", () => {
  it("lê frações e vírgulas sem alterar o original", () => {
    expect(parseIngredientLine("1 1/2 xícaras de arroz")).toMatchObject({
      quantity: 1.5,
      unit: "xícara",
      name: "arroz",
      original: "1 1/2 xícaras de arroz",
    });
    expect(parseIngredientLine("0,5 kg de frango")).toMatchObject({ quantity: 0.5, unit: "kg" });
    expect(parseIngredientLine("1 caixa de creme de leite")).toMatchObject({
      quantity: 1,
      unit: "caixa",
      name: "creme de leite",
    });
    expect(parseIngredientLine("2 folhas de louro")).toMatchObject({
      unit: "folha",
      name: "louro",
    });
  });
  it.each([
    "2 a 3 ovos",
    "1/0 xícara de arroz",
    "sal a gosto",
    "um pouco de azeite",
    "1-2 tomates",
    "1.000 g de farinha",
    "2.500 ml de leite",
    "1,000 g de farinha",
  ])("mantém ambiguidade: %s", (line) => {
    expect(parseIngredientLine(line).quantity).toBeNull();
  });
  it("escala apenas quando o rendimento original é conhecido", () => {
    const ingredient = parseIngredientLine("2 ovos");
    expect(scaleIngredient(ingredient, 2, 3)).toBe("3 ovos");
    expect(scaleIngredient(ingredient, 2, 1)).toBe("1 ovo");
    expect(scaleIngredient(ingredient, null, 3)).toBe("2 ovos");
  });
  it("preserva a linha da pessoa quando as porções são as da receita", () => {
    for (const line of ["1 caixa de creme de leite", "2 colheres de sopa de manteiga", "4 ovos"])
      expect(scaleIngredient(parseIngredientLine(line), 4, 4)).toBe(line);
  });
  it("escreve quantidades escaladas como se lê na cozinha", () => {
    const scale = (line: string, base: number, target: number) =>
      scaleIngredient(parseIngredientLine(line), base, target);
    expect(scale("1 abobrinha pequena ralada", 2, 4)).toBe("2 abobrinhas pequenas raladas");
    expect(scale("1 limão", 4, 8)).toBe("2 limões");
    expect(scale("1 caixa de creme de leite", 4, 8)).toBe("2 caixas de creme de leite");
    expect(scale("2 colheres de sopa de manteiga", 4, 2)).toBe("1 colher de sopa de manteiga");
    expect(scale("500 g de carne moída", 4, 8)).toBe("1 kg de carne moída");
    expect(scale("1 1/2 xícaras de arroz", 2, 1)).toBe("0,75 xícara de arroz");
  });
  it("mostra a quantidade de mercado com plural e quilos", () => {
    expect(formatAmount(1000, "g")).toBe("1 kg");
    expect(formatAmount(1500, "ml")).toBe("1,5 l");
    expect(formatAmount(9, "dente")).toBe("9 dentes");
    expect(formatAmount(1, "colher (sopa)")).toBe("1 colher de sopa");
    expect(formatAmount(5, "colher (sopa)")).toBe("5 colheres de sopa");
    expect(formatAmount(8, "un")).toBe("8");
  });
  it("separa o que se compra de como se prepara", () => {
    expect(splitPreparation("alho amassados")).toEqual({
      base: "alho",
      preparation: "amassados",
    });
    expect(splitPreparation("grão-de-bico cozido e escorrido")).toEqual({
      base: "grão-de-bico cozido",
      preparation: "escorrido",
    });
    expect(splitPreparation("peito de frango em cubos").base).toBe("peito de frango");
    expect(splitPreparation("carne seca dessalgada e desfiada").base).toBe("carne seca");
    // Products whose name carries an adjective stay as written.
    expect(splitPreparation("carne moída").base).toBe("carne moída");
    expect(splitPreparation("picanha").base).toBe("picanha");
  });
  it("mantém medidas com separador ambíguo para conferência, inclusive nas compras", () => {
    const original = "1.000 g de farinha";
    const item = parseIngredientLine(original);
    expect(scaleIngredient(item, 4, 8)).toBe(original);
    expect(
      consolidateShopping([
        { recipeId: "a", name: "Pão", baseServings: 4, servings: 8, ingredients: [item] },
      ])[0],
    ).toMatchObject({ name: original, amount: "Conferir" });
    expect(parseIngredientLine("0.125 kg de farinha").quantity).toBe(0.125);
    expect(parseIngredientLine("1,5 kg de farinha").quantity).toBe(1.5);
  });
  it("consolida massa e volume, mas não converte xícara em gramas", () => {
    const result = consolidateShopping([
      {
        recipeId: "a",
        name: "Arroz",
        baseServings: 2,
        servings: 4,
        ingredients: parseIngredients("0,5 kg de arroz\n1 xícara de arroz\n250 ml de leite"),
      },
      {
        recipeId: "b",
        name: "Doce",
        baseServings: 2,
        servings: 2,
        ingredients: parseIngredients("100 g de arroz\n1 l de leite"),
      },
    ]);
    expect(result.map((line) => [line.key, line.amount])).toEqual(
      expect.arrayContaining([
        ["arroz:g", "1,1 kg"],
        ["arroz:xícara", "2 xícaras"],
        ["leite:ml", "1,5 l"],
      ]),
    );
    expect(result).toHaveLength(3);
  });
  it("não inventa quantidades ao repetir receita sem rendimento", () => {
    const meal = {
      recipeId: "a",
      name: "Omelete",
      baseServings: null,
      servings: 4,
      ingredients: parseIngredients("2 ovos"),
    };
    const result = consolidateShopping([meal, meal]);
    expect(result[0]).toMatchObject({
      amount: "Conferir",
      name: "2 ovos",
      note: "Omelete: conferir quantidade para 2 preparos de 4 porções.",
    });
  });
  it("arredonda para cima o que se compra inteiro", () => {
    const meal = (servings: number) => ({
      recipeId: `r${servings}`,
      name: "Strogonoff",
      baseServings: 4,
      servings,
      ingredients: parseIngredients("1 cebola picada\n600 g de peito de frango"),
    });
    const lines = consolidateShopping([meal(3), meal(2)]);
    expect(lines.find((line) => line.name === "Cebola")?.amount).toBe("2");
    expect(lines.find((line) => line.name === "Peito de frango")?.amount).toBe("750 g");
  });
  it("monta a lista de uma semana real: um item por coisa e a despensa numa pergunta", () => {
    const meal = (name: string, base: number, servings: number, text: string) => ({
      recipeId: name,
      name,
      baseServings: base,
      servings,
      ingredients: parseIngredients(text),
    });
    const lines = consolidateShopping([
      meal(
        "Frango assado com batatas",
        4,
        4,
        "1 kg de sobrecoxa de frango\n800 g de batata\n1 limão\n3 dentes de alho\n2 colheres de sopa de azeite\n1 colher de chá de páprica\nsal a gosto",
      ),
      meal(
        "Macarrão com tomate e grão-de-bico",
        4,
        4,
        "320 g de macarrão\n400 g de tomate picado\n240 g de grão-de-bico cozido e escorrido\n2 colheres de sopa de azeite\n2 dentes de alho picados\nsal a gosto\nágua para cozinhar o macarrão",
      ),
      meal(
        "Omelete de abobrinha",
        2,
        4,
        "4 ovos\n1 abobrinha pequena ralada\n1 colher de sopa de azeite\nsal a gosto",
      ),
      meal(
        "Strogonoff de frango",
        4,
        4,
        "600 g de peito de frango em cubos\n1 cebola picada\n2 colheres de sopa de manteiga\n200 g de champignon fatiado\n2 colheres de sopa de ketchup\n1 colher de sopa de mostarda\n1 caixa de creme de leite\nsal a gosto",
      ),
      meal(
        "Feijão da vó",
        6,
        6,
        "500 g de feijão carioca\n1 cebola picada\n4 dentes de alho amassados\n2 folhas de louro\n150 g de bacon em cubos\n2 colheres de sopa de óleo\nsal a gosto",
      ),
    ]);
    const toBuy = lines.filter((line) => line.category !== "despensa");
    const pantry = lines.filter((line) => line.category === "despensa");
    expect(toBuy).toHaveLength(16);
    expect(toBuy.find((line) => line.name === "Alho")).toMatchObject({
      amount: "9 dentes",
      note: "picados e amassados",
    });
    expect(toBuy.find((line) => line.name === "Sobrecoxa de frango")?.amount).toBe("1 kg");
    expect(toBuy.find((line) => line.name === "Ovos")).toMatchObject({
      amount: "8",
      category: "proteinas",
    });
    expect(toBuy.find((line) => line.name === "Abobrinha pequena")?.amount).toBe("2");
    expect(toBuy.find((line) => line.name === "Cebola")?.amount).toBe("2");
    expect(toBuy.find((line) => line.name === "Bacon")?.category).toBe("proteinas");
    expect(toBuy.find((line) => line.name === "Creme de leite")?.amount).toBe("1 caixa");
    expect(toBuy.some((line) => /água/i.test(line.name))).toBe(false);
    expect(pantry.map((line) => line.name).sort()).toEqual(
      ["Azeite", "Ketchup", "Louro", "Mostarda", "Óleo", "Páprica", "Sal"].sort(),
    );
    expect(pantry.find((line) => line.name === "Azeite")?.amount).toBe("6 colheres de sopa");
    expect(pantry.find((line) => line.name === "Sal")?.amount).toBe("a gosto");
    expect(lines.map((line) => line.category)).toEqual(
      [...lines.map((line) => line.category)].sort(
        (a, b) =>
          ["hortifruti", "proteinas", "mercearia", "laticinios", "outros", "despensa"].indexOf(a) -
          ["hortifruti", "proteinas", "mercearia", "laticinios", "outros", "despensa"].indexOf(b),
      ),
    );
  });
  it("usa a mesma chave na receita e na lista", () => {
    expect(shoppingKeyFor(parseIngredientLine("4 dentes de alho amassados"))).toBe("alho:dente");
    expect(shoppingKeyFor(parseIngredientLine("1 kg de sobrecoxa de frango"))).toBe(
      "sobrecoxa de frango:g",
    );
    expect(shoppingKeyFor(parseIngredientLine("sal a gosto"))).toBe("gosto:sal");
    expect(shoppingKeyFor(parseIngredientLine("água para cozinhar o macarrão"))).toBeNull();
    // "Água ou caldo" is an ingredient choice, not the water that cooks the pasta.
    expect(
      shoppingKeyFor(parseIngredientLine("2 xícaras de água ou caldo de legumes")),
    ).not.toBeNull();
  });
  it("calcula semanas na virada do ano e no domingo", () => {
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

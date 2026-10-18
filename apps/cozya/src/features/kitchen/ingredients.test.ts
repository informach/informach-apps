import { describe, expect, it } from "vitest";
import { addDays, weekStart } from "./dates";
import {
  canonicalShoppingKey,
  consolidateShopping,
  formatAmount,
  parseIngredientLine,
  parseIngredients,
  scaleIngredient,
  splitPreparation,
} from "./ingredients";
import { mealShoppingKeys } from "./meal-shopping";

/** One planned meal of a recipe written as text, as the week sends it to the list. */
const meal = (name: string, base: number, servings: number, text: string) => ({
  recipeId: name,
  name,
  baseServings: base,
  servings,
  ingredients: parseIngredients(text),
});

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
    // The adjective follows the noun: "pão francês" is "pães franceses", never "pães francês".
    expect(scale("1 pão francês", 2, 5)).toBe("2,5 pães franceses");
    expect(scale("4 pães franceses", 4, 1)).toBe("1 pão francês");
    expect(scale("1 brócolis", 2, 4)).toBe("2 brócolis");
    expect(scale("2 brócolis", 4, 2)).toBe("1 brócolis");
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
  it("não tira o ralado do que já se compra ralado", () => {
    // Queijo ralado, farinha de rosca e coco ralado são outro produto, não o queijo, o pão e o coco.
    expect(splitPreparation("queijo ralado").base).toBe("queijo ralado");
    expect(splitPreparation("queijo parmesão ralado").base).toBe("queijo parmesão ralado");
    expect(splitPreparation("pão ralado").base).toBe("pão ralado");
    expect(splitPreparation("coco ralado").base).toBe("coco ralado");
    // A cenoura e o gengibre se compram inteiros e se ralam em casa.
    expect(splitPreparation("cenoura ralada")).toEqual({ base: "cenoura", preparation: "ralada" });
    expect(splitPreparation("gengibre bem ralado").base).toBe("gengibre");
    const lines = consolidateShopping([
      meal("Bolo", 4, 4, "100 g de coco ralado\n50 g de queijo ralado\n1 xícara de pão ralado"),
      meal("Salada", 4, 4, "1 coco\n200 g de queijo"),
    ]);
    expect(lines.map((line) => line.name).sort()).toEqual(
      ["Coco", "Coco ralado", "Pão ralado", "Queijo", "Queijo ralado"].sort(),
    );
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
    const keys = (text: string) =>
      mealShoppingKeys({ id: "r", name: "Receita", servings: 4, ingredients: text }, 4);
    expect(keys("4 dentes de alho amassados")).toEqual(["alho:dente"]);
    expect(keys("1 kg de sobrecoxa de frango")).toEqual(["sobrecoxa de frango:g"]);
    expect(keys("sal a gosto")).toEqual(["gosto:sal"]);
    expect(keys("água para cozinhar o macarrão")).toEqual([]);
    // "Água ou caldo" is an ingredient choice, not the water that cooks the pasta.
    expect(keys("2 xícaras de água ou caldo de legumes")).toHaveLength(1);
  });
  it("junta singular e plural numa linha só, como a página promete", () => {
    const lines = consolidateShopping([
      meal("Strogonoff", 4, 4, "1 cebola picada\n4 ovos\n1 pão francês\n1 limão"),
      meal("Feijão", 4, 4, "2 cebolas\n1 ovo\n2 pães franceses\n2 limões\n2 grãos-de-bico"),
      meal("Salada", 4, 4, "1 grão-de-bico\n1 tomate\n3 tomates pelados\n2 abobrinhas pequenas"),
      meal("Omelete", 4, 4, "1 abobrinha pequena ralada\n1 tomate pelado"),
    ]);
    const amount = (name: string) =>
      lines.filter((line) => line.name === name).map((l) => l.amount);
    expect(amount("Cebola")).toEqual(["3"]);
    expect(amount("Ovos")).toEqual(["5"]);
    expect(amount("Pão francês")).toEqual(["3"]);
    expect(amount("Limão")).toEqual(["3"]);
    expect(amount("Grãos-de-bico")).toEqual(["3"]);
    expect(amount("Tomates pelados")).toEqual(["4"]);
    expect(amount("Abobrinhas pequenas")).toEqual(["3"]);
    // Different things stay apart: a tomato is not a peeled tomato.
    expect(amount("Tomate")).toEqual(["1"]);
    expect(lines).toHaveLength(8);
  });
  it("acerta o plural das palavras que fogem da regra", () => {
    const lines = consolidateShopping([
      meal("A", 4, 4, "2 colheres de sopa de maionese\n1 brócolis\n1 alface\n1 maçã"),
      meal("B", 4, 4, "1 colher de sopa de maionese\n2 brócolis\n2 alfaces\n2 maçãs"),
    ]);
    expect(lines.map((line) => [line.name, line.amount])).toEqual(
      expect.arrayContaining([
        ["Maionese", "3 colheres de sopa"],
        ["Brócolis", "3"],
        ["Alface", "3"],
        ["Maçã", "3"],
      ]),
    );
    expect(lines).toHaveLength(4);
  });
  it("lê a lista gravada antes da regra do singular sem pedir para atualizar", () => {
    expect(canonicalShoppingKey("cebolas:un")).toBe("cebola:un");
    expect(canonicalShoppingKey("ovos:un")).toBe("ovo:un");
    expect(canonicalShoppingKey("paes franceses:un")).toBe(canonicalShoppingKey("pao frances:un"));
    expect(canonicalShoppingKey("graos-de-bico cozido:g")).toBe("grao-de-bico cozido:g");
    expect(canonicalShoppingKey("gosto:pimentas")).toBe("gosto:pimenta");
    expect(canonicalShoppingKey("molho de tomates:g")).toBe("molho de tomates:g");
    expect(canonicalShoppingKey("manual:abc")).toBe("manual:abc");
    expect(canonicalShoppingKey("review:r:0:4")).toBe("review:r:0:4");
    // Already in the current form, the key does not change again.
    const [line] = consolidateShopping([meal("A", 4, 4, "2 cebolas")]);
    expect(canonicalShoppingKey(line?.key ?? "")).toBe(line?.key);
  });
  it("calcula semanas na virada do ano e no domingo", () => {
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

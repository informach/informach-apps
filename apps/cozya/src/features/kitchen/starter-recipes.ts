import { STARTER_SOURCE } from "@/features/recipes/photos";
import type { RecipeFormValues } from "@/features/recipes/schemas";

// Original editorial drafts created for Cozya. No third-party text or tested-recipe claim.
export const STARTER_RECIPES: readonly RecipeFormValues[] = [
  {
    name: "Macarrão com tomate e grão-de-bico",
    servings: 4,
    totalMinutes: null,
    ingredients:
      "320 g de macarrão\n400 g de tomate picado\n240 g de grão-de-bico cozido e escorrido\n2 colheres de sopa de azeite\n2 dentes de alho picados\nsal a gosto\nágua para cozinhar o macarrão",
    preparation:
      "Leve uma panela com água ao fogo e cozinhe o macarrão pelo tempo indicado na embalagem. Reserve um pouco da água antes de escorrer.\nAqueça o azeite em outra panela e refogue o alho sem deixar queimar.\nAdicione o tomate e cozinhe até amolecer. Junte o grão-de-bico e aqueça por completo.\nMisture o macarrão ao molho. Adicione um pouco da água reservada, se necessário, e ajuste o sal.",
    finishing: "Sirva após o preparo.",
    isFavorite: false,
    creationMethod: "manual",
    sourceName: STARTER_SOURCE,
    sourceUrl: null,
  },
  {
    name: "Arroz com lentilha e cenoura",
    servings: 4,
    totalMinutes: null,
    ingredients:
      "1 xícara de arroz\n1 xícara de lentilha cozida e escorrida\n1 cenoura ralada\n1 cebola picada\n1 colher de sopa de azeite\n2 xícaras de água quente\nsal a gosto",
    preparation:
      "Em uma panela, aqueça o azeite e refogue a cebola até amolecer.\nAcrescente a cenoura e o arroz e mexa para envolver os grãos.\nAdicione a água quente e o sal. Cozinhe em fogo baixo, com a panela parcialmente tampada, até o arroz ficar macio. Se a água secar antes, acrescente água quente aos poucos.\nMisture a lentilha já cozida e aqueça por completo. Desligue e deixe descansar com a panela tampada por 5 minutos.",
    finishing: "Solte os grãos com um garfo antes de servir.",
    isFavorite: false,
    creationMethod: "manual",
    sourceName: STARTER_SOURCE,
    sourceUrl: null,
  },
  {
    name: "Omelete de abobrinha",
    servings: 2,
    totalMinutes: null,
    ingredients: "4 ovos\n1 abobrinha pequena ralada\n1 colher de sopa de azeite\nsal a gosto",
    preparation:
      "Esprema levemente a abobrinha ralada para retirar parte da água.\nBata os ovos em uma tigela e misture a abobrinha e o sal.\nAqueça o azeite em uma frigideira antiaderente e despeje a mistura. Cozinhe em fogo baixo com tampa.\nQuando a base estiver firme, vire com auxílio de um prato e cozinhe o outro lado até não haver partes líquidas de ovo.",
    finishing: "Divida em duas porções e sirva.",
    isFavorite: false,
    creationMethod: "manual",
    sourceName: STARTER_SOURCE,
    sourceUrl: null,
  },
  {
    name: "Batata e brócolis de assadeira",
    servings: 4,
    totalMinutes: null,
    ingredients:
      "600 g de batata\n300 g de brócolis\n2 colheres de sopa de azeite\nsal a gosto\nágua para cozinhar as batatas",
    preparation:
      "Aqueça o forno a 200 °C. Lave as batatas, corte em pedaços semelhantes e cozinhe em água até começarem a ficar macias. Escorra.\nSepare o brócolis em floretes, lave e escorra.\nDistribua as batatas e o brócolis em uma assadeira sem amontoar. Misture com o azeite e o sal.\nAsse até os legumes ficarem macios e levemente dourados, mexendo na metade do preparo. Confira o ponto com um garfo; o tempo varia conforme o corte e o forno.",
    finishing: "Use como acompanhamento para a refeição da semana.",
    isFavorite: false,
    creationMethod: "manual",
    sourceName: STARTER_SOURCE,
    sourceUrl: null,
  },
];

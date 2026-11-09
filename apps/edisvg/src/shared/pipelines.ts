import { z } from "zod";

/**
 * Pipelines ("receitas"): work the person repeats, saved once with a name, style instructions for
 * the assistant and a text palette, and run with only what changes each time (the files and the
 * script). Each recipe is of a kind, which fixes its steps and inputs. Two come ready, and can be
 * edited (the edit is kept over the original, which "Restaurar" brings back), duplicated or used
 * as they are. Plan: docs/propostas/edisvg-pipelines-2026-11-08/plano.md.
 */

export const RECIPE_KINDS = ["game-scene", "screen-demo"] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export const RECIPE_KIND_LABELS: Record<RecipeKind, string> = {
  "game-scene": "Cena animada a partir de um projeto do Estúdio",
  "screen-demo": "Animação por cima de um vídeo de demonstração",
};

const HEX = /^#[0-9a-f]{6}$/i;
export const recipeSchema = z.strictObject({
  id: z.string().regex(/^recipe-[\w-]{1,80}$/),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(RECIPE_KINDS),
  /** What the assistant is asked to do, in the person's words. */
  style: z.string().max(4000),
  /** Colours for the texts of the animation, in order of use (the first is the main one). */
  textPalette: z.array(z.string().regex(HEX)).min(1).max(12),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const recipeStoreSchema = z.strictObject({
  version: z.literal(1),
  recipes: z.array(recipeSchema).max(100),
  /** Ready recipes the person removed from the list. */
  hidden: z
    .array(z.string().regex(/^recipe-[\w-]{1,80}$/))
    .max(20)
    .default([]),
});
export type RecipeStore = z.infer<typeof recipeStoreSchema>;

export const emptyRecipeStore = (): RecipeStore => ({ version: 1, recipes: [], hidden: [] });

/** The recipes that come with EdiSVG (the two the person described when asking for pipelines). */
export const BUILT_IN_RECIPES: readonly Recipe[] = [
  {
    id: "recipe-cena-do-jogo",
    name: "Cena animada do jogo",
    kind: "game-scene",
    style:
      "Anime a Cena para ilustrar o que a narração diz, no tempo de cada frase. Personagens e objetos entram quando são citados (deslizando ou crescendo), saem quando o assunto muda, e o que está sendo explicado ganha destaque (um leve aumento ou um pulinho). Textos curtos, só com as palavras-chave da frase, aparecem junto dela, nas cores da paleta de texto, e somem com ela. Movimentos suaves, nada piscando e nada acontecendo fora do tempo da fala.",
    textPalette: ["#ffffff", "#143d35", "#ffb547"],
  },
  {
    id: "recipe-demonstracao",
    name: "Demonstração passo a passo",
    kind: "screen-demo",
    style:
      'Por cima do vídeo da demonstração, guie o olhar no tempo da fala: uma seta aponta onde a professora clica ou mexe, um destaque contorna a área que está sendo explicada e balões curtos repetem o passo ("Clique em Programação"). Textos de ênfase só nas palavras importantes, nas cores da paleta de texto. Uma indicação por vez, entrando um pouco antes da ação e saindo quando o passo termina, sem nunca cobrir o que está sendo mostrado.',
    textPalette: ["#ffffff", "#1f2a44", "#ffb547"],
  },
];

export const isBuiltIn = (id: string): boolean => BUILT_IN_RECIPES.some((r) => r.id === id);

/** The list as the person sees it: ready recipes (with their edits), then their own. */
export function listRecipes(store: RecipeStore): Recipe[] {
  const saved = new Map(store.recipes.map((r) => [r.id, r]));
  const hidden = new Set(store.hidden);
  const ready = BUILT_IN_RECIPES.filter((r) => !hidden.has(r.id)).map((r) => saved.get(r.id) ?? r);
  return [...ready, ...store.recipes.filter((r) => !isBuiltIn(r.id))];
}

/** A ready recipe as it came, to bring back after the person edited it. */
export const originalRecipe = (id: string): Recipe | undefined =>
  BUILT_IN_RECIPES.find((r) => r.id === id);

/** How many recipes the profile keeps (recipeStoreSchema). */
export const MAX_RECIPES = 100;

export function saveRecipe(store: RecipeStore, recipe: Recipe): RecipeStore {
  const value = recipeSchema.parse(recipe);
  const original = originalRecipe(value.id);
  // A ready recipe saved exactly as it came is not kept: the original is used.
  const same = original && JSON.stringify(original) === JSON.stringify(value);
  const others = store.recipes.filter((r) => r.id !== value.id);
  const recipes = same ? others : [...others, value];
  if (recipes.length > MAX_RECIPES)
    throw new Error(`O limite é de ${MAX_RECIPES} receitas: exclua uma antes de criar outra.`);
  return { ...store, recipes };
}

export function removeRecipe(store: RecipeStore, id: string): RecipeStore {
  const recipes = store.recipes.filter((r) => r.id !== id);
  return isBuiltIn(id)
    ? { ...store, recipes, hidden: [...new Set([...store.hidden, id])] }
    : { ...store, recipes };
}

export function restoreRecipe(store: RecipeStore, id: string): RecipeStore {
  return {
    ...store,
    recipes: store.recipes.filter((r) => r.id !== id),
    hidden: store.hidden.filter((h) => h !== id),
  };
}

export function duplicateRecipe(store: RecipeStore, id: string, newId: string): RecipeStore {
  const source = listRecipes(store).find((r) => r.id === id);
  if (!source) throw new Error("Receita não encontrada.");
  const names = new Set(listRecipes(store).map((r) => r.name));
  let name = `${source.name} (cópia)`.slice(0, 80);
  for (let n = 2; names.has(name); n++) name = `${source.name} (cópia ${n})`.slice(0, 80);
  return saveRecipe(store, { ...source, id: newId, name });
}

/**
 * A stored file as the main process can read it. What does not fit (a recipe of a newer EdiSVG,
 * a hand edit) is left out one recipe at a time, never the whole file; `complete` says whether
 * everything was kept (if not, main keeps a copy of the file before it is written again).
 */
export function salvageRecipeStore(raw: unknown): { store: RecipeStore; complete: boolean } {
  const parsed = recipeStoreSchema.safeParse(raw);
  if (parsed.success) return { store: parsed.data, complete: true };
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Extra fields of a newer version are dropped; a recipe that still does not fit is left out.
  const loose = z.object(recipeSchema.shape);
  const seen = new Set<string>();
  const recipes: Recipe[] = [];
  for (const item of Array.isArray(value.recipes) ? value.recipes : []) {
    const recipe = loose.safeParse(item);
    if (!recipe.success || seen.has(recipe.data.id) || recipes.length >= MAX_RECIPES) continue;
    seen.add(recipe.data.id);
    recipes.push(recipe.data);
  }
  const id = z.string().regex(/^recipe-[\w-]{1,80}$/);
  const hidden = [
    ...new Set(
      (Array.isArray(value.hidden) ? value.hidden : []).filter((h) => id.safeParse(h).success),
    ),
  ].slice(0, 20) as string[];
  return { store: { version: 1, recipes, hidden }, complete: false };
}

export const parseRecipeStore = (raw: unknown): RecipeStore => salvageRecipeStore(raw).store;

/* ---------- Inputs of a run ---------- */

/** A file the person picked; the path stays in the main process, the window holds the token. */
export const pickedFileSchema = z.strictObject({
  token: z.string().regex(/^file-[\w-]{8,80}$/),
  name: z.string().min(1).max(260),
  /** What it was picked as. */
  kind: z.enum(["szproject", "audio", "lesson", "video"]),
  size: z.number().int().nonnegative(),
});
export type PickedFile = z.infer<typeof pickedFileSchema>;

/** What a recipe asks for when it runs, by kind (the palette comes from the recipe, editable). */
export const RECIPE_INPUTS: Record<
  RecipeKind,
  readonly { key: "project" | "video" | "audio"; label: string; accepts: PickedFile["kind"][] }[]
> = {
  "game-scene": [
    { key: "project", label: "Projeto do Estúdio (.szproject.json)", accepts: ["szproject"] },
    {
      key: "audio",
      label: "Áudio da aula (arquivo ou aula do EdiAula)",
      accepts: ["audio", "lesson"],
    },
  ],
  "screen-demo": [
    { key: "video", label: "Vídeo da demonstração", accepts: ["video"] },
    {
      key: "audio",
      label: "Áudio da aula (arquivo ou aula do EdiAula)",
      accepts: ["audio", "lesson"],
    },
  ],
};

export const runInputsSchema = z.strictObject({
  recipeId: z.string().regex(/^recipe-[\w-]{1,80}$/),
  files: z.partialRecord(z.enum(["project", "video", "audio"]), pickedFileSchema),
  /** The script of this stretch only, as written. */
  script: z.string().trim().min(1).max(20000),
  textPalette: z.array(z.string().regex(HEX)).min(1).max(12),
});
export type RunInputs = z.infer<typeof runInputsSchema>;

/** What is missing before a run can start, in the person's words (empty: ready). */
export function missingInputs(recipe: Recipe, inputs: Partial<RunInputs>): string[] {
  const out: string[] = [];
  for (const input of RECIPE_INPUTS[recipe.kind]) {
    const file = inputs.files?.[input.key];
    if (!file || !input.accepts.includes(file.kind)) out.push(input.label);
  }
  if (!inputs.script?.trim()) out.push("Roteiro do trecho");
  if (!inputs.textPalette?.length) out.push("Paleta de texto");
  return out;
}

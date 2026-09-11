import type { CozyaIngredient } from "@informach/db/schema";

export const CATEGORIES = {
  hortifruti: "Hortifruti",
  mercearia: "Mercearia",
  proteinas: "Carnes, ovos e proteínas",
  laticinios: "Leites e derivados",
  outros: "Outros / conferir",
} as const;

const units: Record<string, string> = {
  g: "g",
  grama: "g",
  gramas: "g",
  kg: "kg",
  quilo: "kg",
  quilos: "kg",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  l: "l",
  litro: "l",
  litros: "l",
  unidade: "un",
  unidades: "un",
  un: "un",
  xicara: "xícara",
  xicaras: "xícara",
  "colher de sopa": "colher (sopa)",
  "colheres de sopa": "colher (sopa)",
  "colher de cha": "colher (chá)",
  "colheres de cha": "colher (chá)",
  "colher (sopa)": "colher (sopa)",
  "colheres (sopa)": "colher (sopa)",
  "colher (cha)": "colher (chá)",
  "colheres (cha)": "colher (chá)",
  dente: "dente",
  dentes: "dente",
  lata: "lata",
  latas: "lata",
};

export function normalizeIngredientName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function categoryFor(name: string): CozyaIngredient["category"] {
  const n = normalizeIngredientName(name);
  if (/\b(ovo|ovos|frango|carne|peixe|atum)\b/.test(n)) return "proteinas";
  if (/\b(leite|queijo|manteiga|iogurte|requeijao)\b/.test(n)) return "laticinios";
  if (/\b(tomate|tomates|cebola|alho|cenoura|batata|abobrinha|limao|alface|couve|banana)\b/.test(n))
    return "hortifruti";
  if (/\b(arroz|feijao|macarrao|farinha|sal|acucar|azeite|oleo|aveia)\b/.test(n))
    return "mercearia";
  return "outros";
}

/** Conservative, deterministic extraction. Ambiguous amounts remain verbatim for review. */
export function parseIngredientLine(line: string): CozyaIngredient {
  const original = line.trim().replace(/^[-•]\s*/, "");
  const unknown = {
    original,
    name: original,
    quantity: null,
    unit: "",
    category: categoryFor(original),
  };
  if (/\d\s*(?:a|até|–|-)\s*\d|a gosto|quanto baste/i.test(original)) return unknown;
  const match = original.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(\p{L}.+)$/u);
  if (!match?.[1] || !match[2]) return unknown;
  // A recipe copied from the web may use either locale: 1.000 / 1,000 can mean
  // one or one thousand. Preserve the source instead of silently buying 1/1000.
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(match[1])) return unknown;
  const amount = match[1].replace(",", ".");
  const parts = amount.split(/\s+/);
  const fraction = parts.at(-1)?.split("/").map(Number);
  const quantity =
    fraction?.length === 2
      ? (parts.length === 2 ? Number(parts[0]) : 0) + (fraction[0] ?? 0) / (fraction[1] ?? 0)
      : Number(amount);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return unknown;
  const rest = match[2];
  const normalized = normalizeIngredientName(rest);
  const matchedUnit = Object.keys(units)
    .sort((a, b) => b.length - a.length)
    .find((unit) => normalized.startsWith(`${unit} `));
  const name = (matchedUnit ? rest.slice(matchedUnit.length) : rest)
    .replace(/^\s*(?:de\s+)?/i, "")
    .trim();
  if (!name) return unknown;
  return {
    original,
    name,
    quantity,
    unit: matchedUnit ? (units[matchedUnit] ?? "un") : "un",
    category: categoryFor(name),
  };
}

export function parseIngredients(text: string): CozyaIngredient[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export function scaleIngredient(
  item: CozyaIngredient,
  base: number | null,
  target: number,
): string {
  if (!base || item.quantity === null) return item.original;
  return `${formatQuantity((item.quantity * target) / base)} ${item.unit} ${item.name}`;
}

export type ShoppingLine = {
  key: string;
  name: string;
  amount: string;
  category: string;
  note: string;
};
export type PlannedIngredients = {
  recipeId: string;
  name: string;
  baseServings: number | null;
  servings: number;
  ingredients: CozyaIngredient[];
};

export function consolidateShopping(meals: PlannedIngredients[]): ShoppingLine[] {
  const groups = new Map<string, { line: ShoppingLine; quantity: number; unit: string }>();
  for (const meal of meals) {
    for (const [index, item] of meal.ingredients.entries()) {
      const canScale = meal.baseServings !== null && item.quantity !== null;
      if (!canScale) {
        const key = `review:${meal.recipeId}:${index}:${meal.servings}`;
        const current = groups.get(key);
        if (current) {
          current.quantity++;
          current.line.note = `${meal.name}: conferir quantidade para ${current.quantity} preparos de ${meal.servings} porções.`;
        } else
          groups.set(key, {
            quantity: 1,
            unit: "",
            line: {
              key,
              name: item.original,
              amount: "Conferir",
              category: item.category,
              note: `${meal.name}: ${meal.baseServings ? "quantidade não numérica" : "rendimento original não informado"}; conferir para ${meal.servings} porções.`,
            },
          });
        continue;
      }
      // Only convert compatible mass/volume units. Never infer cup size or ingredient density.
      const factor = item.unit === "kg" || item.unit === "l" ? 1000 : 1;
      const unit = item.unit === "kg" ? "g" : item.unit === "l" ? "ml" : item.unit;
      const quantity = (((item.quantity ?? 0) * meal.servings) / (meal.baseServings ?? 1)) * factor;
      const key = `${normalizeIngredientName(item.name)}:${unit}`;
      const existing = groups.get(key);
      if (existing) existing.quantity += quantity;
      else
        groups.set(key, {
          quantity,
          unit,
          line: { key, name: item.name, amount: "", category: item.category, note: "" },
        });
    }
  }
  return [...groups.values()]
    .map(({ line, quantity, unit }) => ({
      ...line,
      amount: line.amount || `${formatQuantity(quantity)} ${unit}`,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "pt-BR"));
}

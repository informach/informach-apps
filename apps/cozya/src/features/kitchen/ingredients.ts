import type { CozyaIngredient } from "@informach/db/schema";

/** Shopping groups in the order a supermarket trip usually follows. */
export const CATEGORIES = {
  hortifruti: "Hortifruti",
  proteinas: "Carnes e ovos",
  mercearia: "Mercearia",
  laticinios: "Frios e laticínios",
  outros: "Outros",
  despensa: "Na despensa",
} as const;

export type ShoppingCategory = keyof typeof CATEGORIES;

const CATEGORY_ORDER = Object.keys(CATEGORIES) as ShoppingCategory[];

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
  "xicara de cha": "xícara",
  "xicaras de cha": "xícara",
  "xicara (cha)": "xícara",
  "xicaras (cha)": "xícara",
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
  caixa: "caixa",
  caixas: "caixa",
  pacote: "pacote",
  pacotes: "pacote",
  folha: "folha",
  folhas: "folha",
  maco: "maço",
  macos: "maço",
  copo: "copo",
  copos: "copo",
  pitada: "pitada",
  pitadas: "pitada",
  fatia: "fatia",
  fatias: "fatia",
  pote: "pote",
  potes: "pote",
};

/** Singular and plural forms for the units people read in a kitchen or a market. */
const UNIT_FORMS: Record<string, readonly [string, string]> = {
  xícara: ["xícara", "xícaras"],
  "colher (sopa)": ["colher de sopa", "colheres de sopa"],
  "colher (chá)": ["colher de chá", "colheres de chá"],
  dente: ["dente", "dentes"],
  lata: ["lata", "latas"],
  caixa: ["caixa", "caixas"],
  pacote: ["pacote", "pacotes"],
  folha: ["folha", "folhas"],
  maço: ["maço", "maços"],
  copo: ["copo", "copos"],
  pitada: ["pitada", "pitadas"],
  fatia: ["fatia", "fatias"],
  pote: ["pote", "potes"],
};

export function normalizeIngredientName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const RULES: [RegExp, CozyaIngredient["category"]][] = [
  [
    /\b(caldo|molho de tomate|extrato de tomate|polpa de tomate|tomate pelado|leite de coco)\b/,
    "mercearia",
  ],
  [/\bcreme de leite\b|\bleite condensado\b/, "laticinios"],
  [
    /\b(ovo|ovos|frango|carne|peixe|atum|bacon|linguica|calabresa|presunto|salsicha|sobrecoxa|coxa|coxas|file|alcatra|patinho|acem|costela|lombo|pernil|camarao|sardinha|bacalhau|tofu|peito)\b/,
    "proteinas",
  ],
  [
    /\b(leite|queijo|manteiga|iogurte|requeijao|nata|mucarela|mussarela|parmesao|ricota|catupiry|cream cheese)\b/,
    "laticinios",
  ],
  [
    /\b(tomate|tomates|cebola|cebolas|alho|cenoura|cenouras|batata|batatas|abobrinha|abobrinhas|limao|limoes|alface|couve|banana|bananas|mandioca|aipim|macaxeira|abobora|brocolis|pepino|pimentao|cheiro-verde|salsinha|cebolinha|coentro|manjericao|hortela|gengibre|chuchu|beterraba|inhame|mandioquinha|berinjela|repolho|espinafre|rucula|maca|macas|laranja|laranjas|mamao|uva|uvas|morango|morangos|abacate|manga|cogumelo|cogumelos|quiabo|vagem)\b/,
    "hortifruti",
  ],
  [
    /\b(arroz|feijao|macarrao|massa|farinha|acucar|aveia|grao-de-bico|grao de bico|lentilha|ervilha|milho|champignon|azeitona|azeitonas|chocolate|cacau|fuba|amido|maisena|polvilho|gelatina|coco ralado|castanha|castanhas|amendoim|nozes|uva-passa|biscoito|pao|torrada|quinoa|cuscuz|sal|azeite|oleo)\b/,
    "mercearia",
  ],
];

function categoryFor(name: string): CozyaIngredient["category"] {
  const n = normalizeIngredientName(name);
  return RULES.find(([pattern]) => pattern.test(n))?.[1] ?? "outros";
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

/** Portuguese uses the singular below two ("1,5 xícara") and the plural from two on. */
function isPlural(quantity: number) {
  return quantity >= 2;
}

/** Amount as it is read at the market: 1 kg instead of 1.000 g, 9 dentes, 8 (eggs). */
export function formatAmount(quantity: number, unit: string): string {
  if (unit === "g" && quantity >= 1000) return `${formatQuantity(quantity / 1000)} kg`;
  if (unit === "ml" && quantity >= 1000) return `${formatQuantity(quantity / 1000)} l`;
  if (unit === "un" || unit === "") return formatQuantity(quantity);
  const forms = UNIT_FORMS[unit];
  return `${formatQuantity(quantity)} ${forms ? forms[isPlural(quantity) ? 1 : 0] : unit}`;
}

const STOP_WORDS = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "com",
  "sem",
  "para",
  "ao",
  "à",
  "e",
]);

function pluralizeWord(word: string): string {
  if (/[sx]$/i.test(word)) return word;
  if (/^(?:p|m)ão$/i.test(word)) return word.replace(/ão$/i, "ães");
  if (/ão$/i.test(word)) return word.replace(/ão$/i, "ões");
  if (/[aeiouáéíóúâêôã]$/i.test(word)) return `${word}s`;
  if (/m$/i.test(word)) return `${word.slice(0, -1)}ns`;
  if (/[rz]$/i.test(word)) return `${word}es`;
  if (/l$/i.test(word)) return `${word.slice(0, -1)}is`;
  return word;
}

function singularizeWord(word: string): string {
  if (/(?:ões|ães)$/i.test(word)) return word.replace(/(?:ões|ães)$/i, "ão");
  if (/ns$/i.test(word)) return `${word.slice(0, -2)}m`;
  if (/[rz]es$/i.test(word)) return word.slice(0, -2);
  if (/[aeiouáéíóúâêôã]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Inflects the noun phrase before the first preposition: "abobrinha pequena ralada". */
function inflectHead(name: string, plural: boolean): string {
  let stopped = false;
  return name
    .split(" ")
    .map((word) => {
      if (stopped || STOP_WORDS.has(word.toLowerCase()) || /\d/.test(word)) {
        stopped = true;
        return word;
      }
      const [head = word, ...tail] = word.split("-");
      return [plural ? pluralizeWord(head) : singularizeWord(head), ...tail].join("-");
    })
    .join(" ");
}

/** The person's own line stays intact unless the portions really change. */
export function scaleIngredient(
  item: CozyaIngredient,
  base: number | null,
  target: number,
): string {
  if (!base || item.quantity === null || base === target) return item.original;
  const quantity = (item.quantity * target) / base;
  if (item.unit !== "un") return `${formatAmount(quantity, item.unit)} de ${item.name}`;
  const name =
    isPlural(item.quantity) === isPlural(quantity)
      ? item.name
      : inflectHead(item.name, isPlural(quantity));
  return `${formatQuantity(quantity)} ${name}`;
}

const PREPARATION_WORD =
  /^(?:picad|picadinh|amassad|ralad|fatiad|desfiad|dessalgad|descascad|lavad|escorrid|triturad|derretid|peneirad|cortad|batid|morn|gelad)(?:o|a|os|as)$/;
const PREPARATION_PAIRS: Record<string, readonly string[]> = {
  em: [
    "cubos",
    "cubinhos",
    "rodelas",
    "tiras",
    "pedacos",
    "fatias",
    "lascas",
    "gomos",
    "temperatura",
  ],
  sem: ["pele", "semente", "sementes", "casca"],
  para: ["untar", "polvilhar", "decorar", "servir", "fritar", "pincelar"],
  a: ["gosto"],
  quanto: ["baste"],
};

/** Splits "alho amassados" into what is bought ("alho") and how it is used ("amassados"). */
export function splitPreparation(name: string): { base: string; preparation: string } {
  const words = name.trim().split(/\s+/);
  const plain = words.map((word) => normalizeIngredientName(word).replace(/[,;.]$/, ""));
  const index = plain.findIndex(
    (word, i) =>
      i > 0 &&
      (PREPARATION_WORD.test(word) ||
        (word === "bem" && PREPARATION_WORD.test(plain[i + 1] ?? "")) ||
        (PREPARATION_PAIRS[word]?.includes(plain[i + 1] ?? "") ?? false)),
  );
  if (index <= 0) return { base: name.trim(), preparation: "" };
  const base = words
    .slice(0, index)
    .join(" ")
    .replace(/[\s,]+e$/i, "")
    .replace(/,$/, "")
    .trim();
  if (!base) return { base: name.trim(), preparation: "" };
  return { base, preparation: words.slice(index).join(" ") };
}

const PANTRY_STAPLES = [
  "sal",
  "pimenta-do-reino",
  "pimenta do reino",
  "azeite",
  "oleo",
  "vinagre",
  "louro",
  "folha de louro",
  "folhas de louro",
  "paprica",
  "oregano",
  "cominho",
  "ketchup",
  "mostarda",
  "fermento",
  "bicarbonato",
  "canela",
  "noz-moscada",
  "noz moscada",
  "shoyu",
  "molho shoyu",
  "molho de soja",
  "molho ingles",
];

/** Basics most kitchens keep: asked once ("tem tudo?"), not bought by default. */
export function isPantryStaple(base: string): boolean {
  const n = normalizeIngredientName(base);
  return PANTRY_STAPLES.some((staple) => n === staple || n.startsWith(`${staple} `));
}

/** Plain cooking water is never shopping. Bottled or coconut water is. */
export function isCookingWater(base: string): boolean {
  const n = normalizeIngredientName(base);
  if (/\bou\b/.test(n)) return false;
  return /^agua(?:\s|$)/.test(n) && !/^agua (?:de coco|com gas|tonica|mineral)/.test(n);
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function joinPreparations(values: Iterable<string>) {
  const list = [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

const TO_TASTE = /a gosto|quanto baste/i;

export type ShoppingLine = {
  key: string;
  name: string;
  amount: string;
  category: ShoppingCategory;
  note: string;
};
export type PlannedIngredients = {
  recipeId: string;
  name: string;
  baseServings: number | null;
  servings: number;
  ingredients: CozyaIngredient[];
};

type Group = {
  line: ShoppingLine;
  quantity: number;
  unit: string;
  preparations: Set<string>;
};

/** Shopping key of one recipe line, shared by the list and the "missing for today" check. */
export function shoppingKeyFor(item: CozyaIngredient): string | null {
  const { base } = splitPreparation(item.name);
  if (isCookingWater(base)) return null;
  if (item.quantity === null)
    return TO_TASTE.test(item.original) ? `gosto:${normalizeIngredientName(base)}` : null;
  const unit = item.unit === "kg" ? "g" : item.unit === "l" ? "ml" : item.unit;
  return `${normalizeIngredientName(base)}:${unit}`;
}

export function consolidateShopping(meals: PlannedIngredients[]): ShoppingLine[] {
  const groups = new Map<string, Group>();
  for (const meal of meals) {
    for (const [index, item] of meal.ingredients.entries()) {
      const { base, preparation } = splitPreparation(item.name);
      if (isCookingWater(base)) continue;
      const pantry = isPantryStaple(base);
      if (item.quantity === null && TO_TASTE.test(item.original)) {
        // "Sal a gosto" in five recipes is one question, not five items to review.
        const key = `gosto:${normalizeIngredientName(base)}`;
        if (!groups.has(key))
          groups.set(key, {
            quantity: 0,
            unit: "",
            preparations: new Set(),
            line: {
              key,
              name: capitalize(base),
              amount: "a gosto",
              category: pantry ? "despensa" : item.category,
              note: "",
            },
          });
        continue;
      }
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
            preparations: new Set(),
            line: {
              key,
              name: item.original,
              amount: "Conferir",
              category: pantry ? "despensa" : item.category,
              note: `${meal.name}: ${meal.baseServings ? "quantidade não numérica" : "rendimento original não informado"}; conferir para ${meal.servings} porções.`,
            },
          });
        continue;
      }
      // Only convert compatible mass/volume units. Never infer cup size or ingredient density.
      const factor = item.unit === "kg" || item.unit === "l" ? 1000 : 1;
      const unit = item.unit === "kg" ? "g" : item.unit === "l" ? "ml" : item.unit;
      const quantity = (((item.quantity ?? 0) * meal.servings) / (meal.baseServings ?? 1)) * factor;
      const key = `${normalizeIngredientName(base)}:${unit}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.preparations.add(preparation);
      } else
        groups.set(key, {
          quantity,
          unit,
          preparations: new Set([preparation]),
          line: {
            key,
            name: capitalize(base),
            amount: "",
            category: pantry ? "despensa" : item.category,
            note: "",
          },
        });
    }
  }
  return [...groups.values()]
    .map(({ line, quantity, unit, preparations }) => ({
      ...line,
      // Whole things are bought whole: 1,25 onion on the list is 2 onions at the market.
      amount:
        line.amount || formatAmount(unit === "un" ? Math.ceil(quantity - 1e-9) : quantity, unit),
      note: line.note || joinPreparations(preparations),
    }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

/** Stored lines may predate a category; unknown values fall back to "outros". */
export function shoppingCategory(value: string): ShoppingCategory {
  return (CATEGORY_ORDER as string[]).includes(value) ? (value as ShoppingCategory) : "outros";
}

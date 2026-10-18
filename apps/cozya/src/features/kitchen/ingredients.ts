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

/** Words that are the same in the singular and in the plural. */
const INVARIABLE = new Set(["brócolis", "brocolis", "ananás", "ananas"]);

function pluralizeWord(word: string): string {
  if (INVARIABLE.has(word.toLowerCase())) return word;
  // "pão francês", "pães franceses"
  if (/ês$/i.test(word)) return word.replace(/ês$/i, "eses");
  if (/[sx]$/i.test(word)) return word;
  if (/^(?:p|m)ão$/i.test(word)) return word.replace(/ão$/i, "ães");
  if (/ão$/i.test(word)) return word.replace(/ão$/i, "ões");
  if (/[aeiouáéíóúâêôã]$/i.test(word)) return `${word}s`;
  if (/m$/i.test(word)) return `${word.slice(0, -1)}ns`;
  if (/[rz]$/i.test(word)) return `${word}es`;
  if (/el$/i.test(word)) return `${word.slice(0, -2)}éis`;
  if (/ol$/i.test(word)) return `${word.slice(0, -2)}óis`;
  if (/l$/i.test(word)) return `${word.slice(0, -1)}is`;
  return word;
}

/** `first` is the noun; the words after it are adjectives: "pães franceses". */
function singularizeWord(word: string, first: boolean): string {
  if (INVARIABLE.has(word.toLowerCase())) return word;
  if (/(?:ões|ães)$/i.test(word)) return word.replace(/(?:ões|ães)$/i, "ão");
  // "francês" is already singular; "franceses" after a noun is its plural.
  if (/ês$/i.test(word)) return word;
  if (!first && /eses$/i.test(word)) return word.replace(/eses$/i, "ês");
  if (/éis$/i.test(word)) return word.replace(/éis$/i, "el");
  if (/óis$/i.test(word)) return word.replace(/óis$/i, "ol");
  if (/ais$/i.test(word)) return word.replace(/ais$/i, "al");
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
    .map((word, index) => {
      if (stopped || STOP_WORDS.has(word.toLowerCase()) || /\d/.test(word)) {
        stopped = true;
        return word;
      }
      const [head = word, ...tail] = word.split("-");
      return [plural ? pluralizeWord(head) : singularizeWord(head, index === 0), ...tail].join("-");
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
/** Grated cheese, breadcrumbs and grated coconut are bought grated: there "ralado" is the product. */
const SOLD_GRATED = /\b(?:queijo|parmesao|mucarela|mussarela|pao|coco)\b/;

function isPreparation(plain: readonly string[], index: number): boolean {
  const word = plain[index] ?? "";
  if (!PREPARATION_WORD.test(word)) return false;
  return !(/^ralad/.test(word) && SOLD_GRATED.test(plain.slice(0, index).join(" ")));
}
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
      (isPreparation(plain, i) ||
        (word === "bem" && isPreparation(plain, i + 1)) ||
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

/** Prepositions and articles of a normalized name, where the thing bought stops. */
const KEY_STOP_WORDS = new Set([
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
  "a",
  "e",
]);

/**
 * One normalized word in the singular, for the key only. What matters is that both forms meet
 * ("cebolas" and "cebola", "paes" and "pao", "franceses" and "frances"), not the spelling: the
 * name on the list stays as the recipe writes it. `first` is the noun; adjectives follow it.
 */
function keyWord(word: string, first: boolean): string {
  if (/(?:oes|aes)$/.test(word)) return `${word.slice(0, -3)}ao`;
  // "pao frances" and "paes franceses": the adjective in "-es" meets its plural in "-eses".
  if (!first && /eses$/.test(word)) return word.slice(0, -3);
  if (/eis$/.test(word)) return `${word.slice(0, -3)}el`;
  if (/ois$/.test(word)) return `${word.slice(0, -3)}ol`;
  if (/ais$/.test(word)) return `${word.slice(0, -3)}al`;
  if (/ns$/.test(word)) return `${word.slice(0, -2)}m`;
  if (/[rz]es$/.test(word)) return word.slice(0, -2);
  if (/[aeiou]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** What is bought, in the singular: the noun phrase before the first preposition. */
function keyName(normalized: string): string {
  let stopped = false;
  return normalized
    .split(" ")
    .map((word, index) => {
      if (stopped || KEY_STOP_WORDS.has(word)) {
        stopped = true;
        return word;
      }
      // "graos-de-bico" is "grao-de-bico"; what follows the preposition stays.
      let joined = false;
      return word
        .split("-")
        .map((part, at) => {
          if (joined || KEY_STOP_WORDS.has(part)) {
            joined = true;
            return part;
          }
          return keyWord(part, index === 0 && at === 0);
        })
        .join("-");
    })
    .join(" ");
}

/**
 * The key of a list line, so "1 cebola picada" and "2 cebolas" are one line: what is bought,
 * in the singular, and the unit it is counted in.
 */
function shoppingKey(base: string, unit: string): string {
  return `${keyName(normalizeIngredientName(base))}:${unit}`;
}

function toTasteKey(base: string): string {
  return `gosto:${keyName(normalizeIngredientName(base))}`;
}

/**
 * A saved line's key under the current rules. Lines saved before the singular rule keep
 * "cebolas:un": read through this, the list matches the week without asking for an update, and
 * an update keeps what was already checked.
 */
export function canonicalShoppingKey(key: string): string {
  if (key.startsWith("manual:") || key.startsWith("review:")) return key;
  if (key.startsWith("gosto:")) return `gosto:${keyName(key.slice("gosto:".length))}`;
  const at = key.lastIndexOf(":");
  return at < 0 ? key : `${keyName(key.slice(0, at))}:${key.slice(at + 1)}`;
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
        const key = toTasteKey(base);
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
      const key = shoppingKey(base, unit);
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

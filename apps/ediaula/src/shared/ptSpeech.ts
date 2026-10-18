import { editDistance, foldText } from "./glossary.ts";

/**
 * Spoken Brazilian Portuguese against written text: the script says "para o", "25%" and
 * "x 208"; whisper writes "pro", "vinte e cinco por cento" and "xis duzentos e oito". Both sides
 * go through tokenize() and are compared token by token, exactly or, for longer words and
 * glossary terms, by sound (fuzzyEqual).
 */

export interface SpeechToken {
  /** Normalized form: lowercase, no accents, numbers as digits ("208", ordinals "3o", "%"). */
  tok: string;
  /** Indexes of the original words this token comes from. */
  src: number[];
  /** An article or preposition (also inside a contraction): left out of section scores. */
  stop?: boolean;
  /** Punctuation follows: a number never runs across it. */
  pause?: boolean;
}

/** Articles, prepositions and their contractions; "e" joins them as the commonest link word. */
const STOP = new Set(
  (
    "o a os as um uma uns umas de da do das dos em no na nos nas num numa nuns numas dum duma " +
    "duns dumas para pra pro pras pros por pelo pela pelos pelas ao aos com sem sob sobre ate " +
    "entre desde contra apos perante e"
  ).split(" "),
);

/** Colloquial forms and contractions, as the words they stand for. */
const CONTRACTIONS: Record<string, string[]> = {
  pra: ["para"],
  pro: ["para", "o"],
  pras: ["para", "as"],
  pros: ["para", "os"],
  ta: ["esta"],
  to: ["estou"],
  tava: ["estava"],
  tavam: ["estavam"],
  tamo: ["estamos"],
  ce: ["voce"],
  ces: ["voces"],
  num: ["em", "um"],
  numa: ["em", "uma"],
  nuns: ["em", "uns"],
  numas: ["em", "umas"],
  dum: ["de", "um"],
  duma: ["de", "uma"],
  duns: ["de", "uns"],
  dumas: ["de", "umas"],
  vamo: ["vamos"],
};

/** Contractions of an article or preposition (all their parts are function words). */
const STOP_CONTRACTIONS = new Set([
  "pra",
  "pro",
  "pras",
  "pros",
  "num",
  "numa",
  "nuns",
  "numas",
  "dum",
  "duma",
  "duns",
  "dumas",
]);

/** Cardinals below a thousand: value and slot (1 units, 1.5 ten to nineteen, 2 tens, 3 hundreds). */
const CARDINALS: Record<string, [number, number]> = {
  zero: [0, 1],
  um: [1, 1],
  uma: [1, 1],
  dois: [2, 1],
  duas: [2, 1],
  tres: [3, 1],
  quatro: [4, 1],
  cinco: [5, 1],
  seis: [6, 1],
  sete: [7, 1],
  oito: [8, 1],
  nove: [9, 1],
  dez: [10, 1.5],
  onze: [11, 1.5],
  doze: [12, 1.5],
  treze: [13, 1.5],
  quatorze: [14, 1.5],
  catorze: [14, 1.5],
  quinze: [15, 1.5],
  dezesseis: [16, 1.5],
  dezasseis: [16, 1.5],
  dezessete: [17, 1.5],
  dezoito: [18, 1.5],
  dezenove: [19, 1.5],
  dezanove: [19, 1.5],
  vinte: [20, 2],
  trinta: [30, 2],
  quarenta: [40, 2],
  cinquenta: [50, 2],
  sessenta: [60, 2],
  setenta: [70, 2],
  oitenta: [80, 2],
  noventa: [90, 2],
  cem: [100, 3],
  cento: [100, 3],
  duzentos: [200, 3],
  duzentas: [200, 3],
  trezentos: [300, 3],
  trezentas: [300, 3],
  quatrocentos: [400, 3],
  quatrocentas: [400, 3],
  quinhentos: [500, 3],
  quinhentas: [500, 3],
  seiscentos: [600, 3],
  seiscentas: [600, 3],
  setecentos: [700, 3],
  setecentas: [700, 3],
  oitocentos: [800, 3],
  oitocentas: [800, 3],
  novecentos: [900, 3],
  novecentas: [900, 3],
};

const MULTIPLIERS: Record<string, number> = {
  mil: 1000,
  milhao: 1e6,
  milhoes: 1e6,
};

/** Ordinals: units and tens, masculine and feminine, singular and plural. */
const ORDINALS = new Map<string, [number, number]>();
for (const [stem, value, slot] of [
  ["primeir", 1, 1],
  ["segund", 2, 1],
  ["terceir", 3, 1],
  ["quart", 4, 1],
  ["quint", 5, 1],
  ["sext", 6, 1],
  ["setim", 7, 1],
  ["oitav", 8, 1],
  ["non", 9, 1],
  ["decim", 10, 2],
  ["vigesim", 20, 2],
  ["trigesim", 30, 2],
  ["quadragesim", 40, 2],
  ["quinquagesim", 50, 2],
  ["sexagesim", 60, 2],
  ["septuagesim", 70, 2],
  ["setuagesim", 70, 2],
  ["octogesim", 80, 2],
  ["nonagesim", 90, 2],
  ["centesim", 100, 3],
] as const)
  for (const end of ["o", "a", "os", "as"]) ORDINALS.set(`${stem}${end}`, [value, slot]);

/** Letter names that are not also Portuguese words, as the letter they spell. */
const LETTER_NAMES: Record<string, string> = {
  bê: "b",
  efe: "f",
  gê: "g",
  agá: "h",
  jota: "j",
  eme: "m",
  ene: "n",
  pê: "p",
  tê: "t",
  dáblio: "w",
  dábliu: "w",
  xis: "x",
  ípsilon: "y",
  zê: "z",
};
/** Letter names that are also words ("cê" is "você", "ele" a pronoun): only inside a spelled run. */
const WEAK_LETTER_NAMES: Record<string, string> = {
  cê: "c",
  dê: "d",
  cá: "k",
  ele: "l",
  ó: "o",
  quê: "q",
  erre: "r",
  esse: "s",
  vê: "v",
};

interface Piece {
  /** The word as written, lowercase with its accents (letter names need them). */
  lower: string;
  /** Folded (no accents, letters and digits only), or a marker ("%"). */
  fold: string;
  src: number;
  /** A single letter written as a capital ("P D F"). */
  capital: boolean;
  /** The last piece of a word followed by punctuation. */
  pause?: boolean;
}

/**
 * A letter spelled on its own: a capital, a letter that is not a word ("x", but not "a", "e" or
 * "o") or a letter name. `strong` when it can only be a letter.
 */
function letterOf(p: Piece): { letter: string; strong: boolean } | null {
  const name = LETTER_NAMES[p.lower];
  if (name) return { letter: name, strong: true };
  if (p.lower.length === 1 && /^[a-z]$/.test(p.fold))
    return p.capital || !"aeo".includes(p.fold) ? { letter: p.fold, strong: true } : null;
  const weak = WEAK_LETTER_NAMES[p.lower];
  return weak ? { letter: weak, strong: false } : null;
}

/** Splits written words into pieces: hyphens and slashes apart, "%" and decimals on their own. */
function pieces(
  words: readonly string[],
  compounds: ReadonlyMap<string, readonly string[]> | undefined,
): Piece[] {
  const out: Piece[] = [];
  words.forEach((word, src) => {
    const text = word.replace(/(\d)\s*[º°]/g, "$1o").replace(/(\d)\s*ª/g, "$1a");
    for (const part of text.split(/[-‐‑–—/]+/)) {
      const percent = /%/.test(part);
      const bare = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (bare) {
        const lower = bare.toLowerCase();
        const capital = /^\p{Lu}$/u.test(bare);
        // Thousands written with dots ("1.000") and decimals with a comma ("2,5").
        if (/^\d{1,3}(?:\.\d{3})+$/.test(bare))
          out.push({ lower, fold: bare.replace(/\./g, ""), src, capital });
        else if (/^\d+,\d+$/.test(bare)) {
          const [a, b] = bare.split(",");
          out.push({ lower: a, fold: a, src, capital });
          out.push({ lower: "vírgula", fold: "virgula", src, capital: false });
          out.push({ lower: b, fold: b, src, capital });
        } else {
          const fold = foldText(bare);
          const split = compounds?.get(fold);
          if (split && split.length > 1)
            for (const s of split) out.push({ lower: s, fold: s, src, capital: false });
          else if (fold) out.push({ lower, fold, src, capital });
        }
      }
      if (percent) out.push({ lower: "%", fold: "%", src, capital: false });
    }
    const last = out[out.length - 1];
    if (last?.src === src && /[,.;:!?…]["”')\]]*$/.test(word)) last.pause = true;
  });
  return out;
}

/** A run of spelled letters becomes one token ("pê dê efe" and "P D F" are "pdf"). */
function spellRuns(list: Piece[]): SpeechToken[] {
  const out: SpeechToken[] = [];
  for (let i = 0; i < list.length; ) {
    let j = i;
    let strong = 0;
    while (j < list.length) {
      const l = letterOf(list[j]);
      if (!l) break;
      if (l.strong) strong++;
      j++;
    }
    // Two letters that can only be letters, or three with one of them ("pê dê efe").
    if (strong >= 2 || (j - i >= 3 && strong >= 1)) {
      out.push({
        tok: list
          .slice(i, j)
          .map((p) => letterOf(p)?.letter ?? "")
          .join(""),
        src: [...new Set(list.slice(i, j).map((p) => p.src))],
        ...(list[j - 1].pause ? { pause: true } : {}),
      });
      i = j;
      continue;
    }
    const p = list[i];
    const name = LETTER_NAMES[p.lower];
    const stop = STOP_CONTRACTIONS.has(p.fold) || STOP.has(p.fold);
    const parts = name ? [name] : p.fold === "%" ? ["%"] : (CONTRACTIONS[p.fold] ?? [p.fold]);
    for (const [k, tok] of parts.entries())
      out.push({
        tok,
        src: [p.src],
        ...(stop && !name ? { stop } : {}),
        ...(p.pause && k === parts.length - 1 ? { pause: true } : {}),
      });
    i++;
  }
  return out;
}

const isDigits = (s: string): boolean => /^\d+$/.test(s);

/**
 * The number starting at `i`, if any: cardinals up to the millions ("dois mil e vinte e seis"),
 * digits with a multiplier ("2 mil"), ordinals ("vigésimo primeiro") and "por cento".
 */
function numberAt(toks: SpeechToken[], i: number): { tok: string; end: number } | null {
  const first = toks[i].tok;
  const ord = ORDINALS.get(first);
  if (ord) {
    let value = ord[0];
    let slot = ord[1];
    let j = i + 1;
    while (j < toks.length && !toks[j - 1].pause) {
      const next = ORDINALS.get(toks[j].tok);
      if (!next || next[1] >= slot) break;
      value += next[0];
      slot = next[1];
      j++;
    }
    return { tok: `${value}o`, end: j };
  }
  if (/^\d+[oa]$/.test(first)) return { tok: `${first.slice(0, -1)}o`, end: i + 1 };
  if (!(first in CARDINALS) && !(first in MULTIPLIERS) && !isDigits(first)) return null;
  let total = 0;
  let group = 0;
  /** The slot of the last number word: the next one has to fill a lower one. */
  let last = Number.POSITIVE_INFINITY;
  /** Multipliers come in decreasing order ("dois milhões e trezentos mil"). */
  let lastMult = Number.POSITIVE_INFINITY;
  let any = false;
  let j = i;
  // Punctuation ends a number: "dois, três" are two.
  while (j < toks.length && !(j > i && toks[j - 1].pause)) {
    const t = toks[j].tok;
    if (t === "e" && any && !isDigits(toks[j - 1].tok)) {
      const next = toks[j + 1]?.tok;
      const card = next !== undefined ? CARDINALS[next] : undefined;
      if (card && card[1] < last) {
        j++;
        continue;
      }
      break;
    }
    const card = CARDINALS[t];
    if (card) {
      if (card[1] >= last) break;
      group += card[0];
      last = card[1] === 1.5 ? 1 : card[1];
      any = true;
      j++;
      continue;
    }
    if (isDigits(t) && !any) {
      // Digits stand alone, unless a multiplier follows ("2 mil").
      const mult = MULTIPLIERS[toks[j + 1]?.tok ?? ""];
      if (!mult) return { tok: t.replace(/^0+(?=\d)/, ""), end: j + 1 };
      group = Number(t);
      any = true;
      last = 0;
      j++;
      continue;
    }
    const mult = MULTIPLIERS[t];
    if (mult) {
      if (mult >= lastMult) break;
      total += (group || 1) * mult;
      group = 0;
      lastMult = mult;
      last = mult === 1000 ? 3.5 : 4;
      any = true;
      j++;
      continue;
    }
    break;
  }
  if (!any) return null;
  // A lone "e" left at the end belongs to the next words.
  while (j > i && toks[j - 1].tok === "e") j--;
  return { tok: String(total + group), end: j };
}

/** Number words as digits, "por cento" as "%". */
function numbers(toks: SpeechToken[]): SpeechToken[] {
  const out: SpeechToken[] = [];
  for (let i = 0; i < toks.length; ) {
    if (toks[i].tok === "por" && toks[i + 1]?.tok === "cento") {
      out.push({ tok: "%", src: [...new Set([...toks[i].src, ...toks[i + 1].src])] });
      i += 2;
      continue;
    }
    const n = numberAt(toks, i);
    if (!n) {
      out.push(toks[i]);
      i++;
      continue;
    }
    const span = toks.slice(i, n.end);
    const src = [...new Set(span.flatMap((t) => t.src))];
    // "um" or "uma" alone is usually the article.
    const stop = span.length === 1 && !!span[0].stop;
    out.push({
      tok: n.tok,
      src,
      ...(stop ? { stop } : {}),
      ...(span[span.length - 1].pause ? { pause: true } : {}),
    });
    i = n.end;
  }
  return out;
}

/** Hyphenated words of `texts`, joined, with their parts ("guardachuva" → guarda, chuva). */
export function compoundsOf(texts: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const text of texts)
    for (const word of text.split(/\s+/)) {
      if (!/[\p{L}\p{N}][-‐‑][\p{L}\p{N}]/u.test(word)) continue;
      const parts = word
        .split(/[-‐‑]+/)
        .map(foldText)
        .filter(Boolean);
      if (parts.length > 1) out.set(parts.join(""), parts);
    }
  return out;
}

/**
 * Normalized tokens of a text (split at spaces) or of a list of words, each pointing back at the
 * words it came from. Contractions are expanded ("pro" → para o), numbers become digits in
 * either direction, hyphenated words are split ("praia-tropical" → praia tropical) and so is a
 * word spelled joined when `compounds` knows it (compoundsOf), and spelled letters join
 * ("pê dê efe" → pdf).
 */
export function tokenize(
  input: string | readonly string[],
  opts: { compounds?: ReadonlyMap<string, readonly string[]> } = {},
): SpeechToken[] {
  const words = typeof input === "string" ? input.split(/\s+/).filter(Boolean) : input;
  return numbers(spellRuns(pieces(words, opts.compounds)));
}

const keys = new Map<string, string>();

/**
 * Roughly how a word sounds in Brazilian Portuguese: ç/ss/z/c before e and i are one sound, ch
 * and sh another, lh and nh, qu and gu, a silent h, doubled letters and the open endings
 * ("bem"/"ben", "leite"/"leiti") collapse.
 */
export function phoneticKey(token: string): string {
  const known = keys.get(token);
  if (known !== undefined) return known;
  const key = foldText(token)
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/[cs]h/g, "x")
    .replace(/lh/g, "li")
    .replace(/nh/g, "ni")
    .replace(/qu(?=[ei])/g, "k")
    .replace(/qu/g, "kw")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/[sx]c(?=[ei])/g, "s")
    .replace(/c(?=[ei])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/m$/, "n")
    .replace(/l$/, "u")
    .replace(/e$/, "i")
    .replace(/o$/, "u");
  if (keys.size > 50000) keys.clear();
  keys.set(token, key);
  return key;
}

/** Shortest token compared by sound, unless it is a glossary term. */
const FUZZY_MIN = 4;

/**
 * Whether two normalized tokens are the same word said or written another way: equal, or (for
 * tokens of 4 letters or more, or glossary terms) with sound keys one edit apart, two for words
 * of 7 letters or more. Numbers only match exactly.
 */
export function fuzzyEqual(a: string, b: string, glossary?: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (/\d|%/.test(a) || /\d|%/.test(b)) return false;
  if (Math.min(a.length, b.length) < FUZZY_MIN && !(glossary?.has(a) || glossary?.has(b)))
    return false;
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (ka === kb) return true;
  const max = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return editDistance(ka, kb, max) <= max;
}

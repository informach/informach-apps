import {
  Atom,
  BookOpen,
  BookText,
  Bot,
  Brain,
  Calculator,
  Church,
  Computer,
  DraftingCompass,
  Dumbbell,
  FlaskConical,
  Globe2,
  HeartHandshake,
  Landmark,
  Languages,
  Leaf,
  type LucideIcon,
  Music,
  Palette,
  PenLine,
  TestTube,
} from "lucide-react";

export type SubjectColorIndex = 1 | 2 | 3 | 4 | 5;

const ALL_COLOR_INDEXES: readonly SubjectColorIndex[] = [1, 2, 3, 4, 5] as const;

const CURATED_COLOR_BY_NAME = new Map<string, SubjectColorIndex>([
  ["matematica", 1],
  ["matematicas", 1],
  ["portugues", 2],
  ["lingua portuguesa", 2],
  ["ciencias", 3],
  ["ciencias da natureza", 3],
  ["historia", 4],
  ["ingles", 5],
  ["lingua inglesa", 5],
]);

const CURATED_ICON_BY_NAME = new Map<string, LucideIcon>([
  ["matematica", Calculator],
  ["matematicas", Calculator],
  ["portugues", BookText],
  ["lingua portuguesa", BookText],
  ["redacao", PenLine],
  ["literatura", BookOpen],
  ["ciencias", FlaskConical],
  ["ciencias da natureza", FlaskConical],
  ["biologia", Leaf],
  ["quimica", TestTube],
  ["fisica", Atom],
  ["historia", Landmark],
  ["geografia", Globe2],
  ["ingles", Languages],
  ["lingua inglesa", Languages],
  ["espanhol", Languages],
  ["lingua espanhola", Languages],
  ["educacao fisica", Dumbbell],
  ["ed fisica", Dumbbell],
  ["arte", Palette],
  ["artes", Palette],
  ["musica", Music],
  ["religiao", Church],
  ["ensino religioso", Church],
  ["filosofia", Brain],
  ["sociologia", HeartHandshake],
  ["informatica", Computer],
  ["computacao", Computer],
  ["programacao", Computer],
  ["robotica", Bot],
  ["geometria", DraftingCompass],
  ["desenho geometrico", DraftingCompass],
]);

// Normaliza nome de matéria pra matching robusto:
// - tira acentos (NFD + diacritics)
// - lowercase
// - troca qualquer não-alfanumérico (pontuação, hifens, etc) por espaço
// - colapsa espaços
// Exemplos: "Matemática" → "matematica"; "Ed. Física" → "ed fisica";
// "História do Brasil" → "historia do brasil"; "MÚSICA" → "musica".
// Exportada porque o mesmo normalize é reaproveitado pelos matchers de
// matéria e estudante em features/activities/match-{subject,student}.ts.
export function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Procura a chave curada mais específica que case com `normalized`:
// 1. match exato (chave === normalized)
// 2. match de prefixo de palavra (normalized começa com "chave " — boundary garante
//    que "historia" NÃO casa "historiador" mas casa "historia do brasil")
// Ordena chaves por tamanho decrescente pra "lingua inglesa" vencer "ingles"
// quando ambos existem no mapa e ambos prefixam a entrada.
function findCuratedKey<V>(normalized: string, map: ReadonlyMap<string, V>): string | null {
  if (!normalized) return null;
  if (map.has(normalized)) return normalized;
  const keys = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized.startsWith(`${key} `)) return key;
  }
  return null;
}

function hashToColorIndex(seed: string): SubjectColorIndex {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ((hash % 5) + 1) as SubjectColorIndex;
}

export function getSubjectColorIndex(name: string): SubjectColorIndex {
  const norm = normalize(name);
  if (!norm) return 1;
  const curatedKey = findCuratedKey(norm, CURATED_COLOR_BY_NAME);
  if (curatedKey) {
    const curated = CURATED_COLOR_BY_NAME.get(curatedKey);
    if (curated) return curated;
  }
  return hashToColorIndex(norm);
}

// Algoritmo de escolha livre-de-colisão dentro de uma turma:
// 1. Se o nome tem cor curada e o slot ainda está livre, usa o curado.
// 2. Senão, primeiro índice 1..5 que não está em `usedIndexes`.
// 3. Se todos os 5 estão ocupados (≥6 matérias na turma), fallback determinístico via hash.
export function pickAvailableColorIndex(
  name: string,
  usedIndexes: ReadonlyArray<number>,
): SubjectColorIndex {
  const used = new Set<number>(usedIndexes);
  const norm = normalize(name);
  if (norm) {
    const curatedKey = findCuratedKey(norm, CURATED_COLOR_BY_NAME);
    if (curatedKey) {
      const curated = CURATED_COLOR_BY_NAME.get(curatedKey);
      if (curated && !used.has(curated)) return curated;
    }
  }
  for (const idx of ALL_COLOR_INDEXES) {
    if (!used.has(idx)) return idx;
  }
  return hashToColorIndex(norm || "fallback");
}

const TINTED_BG_BY_INDEX: Record<SubjectColorIndex, string> = {
  1: "border-chart-1/40 bg-chart-1/15",
  2: "border-chart-2/40 bg-chart-2/15",
  3: "border-chart-3/40 bg-chart-3/15",
  4: "border-chart-4/40 bg-chart-4/15",
  5: "border-chart-5/40 bg-chart-5/15",
};

const TEXT_BY_INDEX: Record<SubjectColorIndex, string> = {
  1: "text-chart-1",
  2: "text-chart-2",
  3: "text-chart-3",
  4: "text-chart-4",
  5: "text-chart-5",
};

const ICON_BG_BY_INDEX: Record<SubjectColorIndex, string> = {
  1: "bg-chart-1/20 text-chart-1",
  2: "bg-chart-2/20 text-chart-2",
  3: "bg-chart-3/20 text-chart-3",
  4: "bg-chart-4/20 text-chart-4",
  5: "bg-chart-5/20 text-chart-5",
};

function asColorIndex(idx: number): SubjectColorIndex {
  if (idx === 1 || idx === 2 || idx === 3 || idx === 4 || idx === 5) {
    return idx;
  }
  return 1;
}

export function getSubjectTintedClassByIndex(idx: number): string {
  return TINTED_BG_BY_INDEX[asColorIndex(idx)];
}

export function getSubjectTextClassByIndex(idx: number): string {
  return TEXT_BY_INDEX[asColorIndex(idx)];
}

export function getSubjectIconClassByIndex(idx: number): string {
  return ICON_BG_BY_INDEX[asColorIndex(idx)];
}

export function getSubjectTintedClass(name: string): string {
  return TINTED_BG_BY_INDEX[getSubjectColorIndex(name)];
}

export function getSubjectTextClass(name: string): string {
  return TEXT_BY_INDEX[getSubjectColorIndex(name)];
}

export function getSubjectIconClass(name: string): string {
  return ICON_BG_BY_INDEX[getSubjectColorIndex(name)];
}

export function getSubjectIcon(name: string): LucideIcon {
  const norm = normalize(name);
  if (!norm) return BookOpen;
  const key = findCuratedKey(norm, CURATED_ICON_BY_NAME);
  if (!key) return BookOpen;
  return CURATED_ICON_BY_NAME.get(key) ?? BookOpen;
}

// Limite de distância de edição (Levenshtein) sobre os nomes normalizados.
// Cobre erros de digitação ("Matemtica" → "Matemática"), letra trocada
// ("Educaçao" → "Educação") e abreviações curtas ("Mat" → "Mate" não, mas
// "Matemat" → "Matemati" sim). Mudanças grandes ("Matemática" → "Educação
// Física") ficam muito além de 3 e caem fora.
const MAX_MINOR_EDIT_DISTANCE = 3;

// Distância de Levenshtein clássica com fast-paths: short-circuit se a
// diferença de tamanho já excede o cap. Tamanho dos nomes de matéria é
// pequeno (< 60 chars), então O(n*m) é trivial.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const aLen = a.length;
  const bLen = b.length;
  let prev = Array.from({ length: bLen + 1 }, (_, i) => i);
  const curr = new Array<number>(bLen + 1);

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr.slice();
  }
  return prev[bLen] ?? 0;
}

// "Ajuste pequeno" no nome: depois de normalizar (sem acento, lower,
// pontuação→espaço, espaços colapsados):
//   - igual → trivial (só acento/caixa/pontuação) → libera
//   - distância de edição ≤ 3 → erro de digitação típico → libera
//   - acima disso → mudou o cerne → bloqueia
// Usado pelo service de updateSubject quando a matéria já está em uso por
// outras famílias — pra evitar que renomear "Matemática" pra "Educação
// Física" quebre as atividades alheias.
export function isMinorNameEdit(oldName: string, newName: string): boolean {
  const a = normalize(oldName);
  const b = normalize(newName);
  if (a === b) return true;
  // Short-circuit: se a diferença bruta de tamanho já passa do limite,
  // a distância de edição também passa.
  if (Math.abs(a.length - b.length) > MAX_MINOR_EDIT_DISTANCE) return false;
  return levenshtein(a, b) <= MAX_MINOR_EDIT_DISTANCE;
}

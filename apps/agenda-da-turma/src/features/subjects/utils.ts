export type SubjectColorIndex = 1 | 2 | 3 | 4 | 5;

const CURATED_BY_NAME = new Map<string, SubjectColorIndex>([
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

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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
  const curated = CURATED_BY_NAME.get(norm);
  if (curated) return curated;
  return hashToColorIndex(norm);
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

export function getSubjectTintedClass(name: string): string {
  return TINTED_BG_BY_INDEX[getSubjectColorIndex(name)];
}

export function getSubjectTextClass(name: string): string {
  return TEXT_BY_INDEX[getSubjectColorIndex(name)];
}

export function getSubjectIconClass(name: string): string {
  return ICON_BG_BY_INDEX[getSubjectColorIndex(name)];
}

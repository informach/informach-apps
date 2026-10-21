/** Scripts whose letters change form or order by OpenType substitution: without
 * those GSUB features the platform draws isolated, unjoined or unreordered
 * glyphs. Scripts that read correctly with plain cmap glyphs (Latin, Greek,
 * Cyrillic, Hebrew, Thai, CJK…) are not listed. Indic scripts accept the
 * current ("2") and legacy shaping tags. A font passes when the script a
 * shaper selects applies at least one of the script's contextual features. */
const joining = ["init", "medi", "fina"],
  indic = [
    "akhn",
    "rphf",
    "rkrf",
    "pref",
    "blwf",
    "abvf",
    "half",
    "pstf",
    "vatu",
    "cjct",
    "pres",
    "abvs",
    "blws",
    "psts",
  ],
  khmer = ["pref", "blwf", "abvf", "pstf", "cfar", "pres", "abvs", "blws", "psts"],
  myanmar = ["rphf", "pref", "blwf", "pstf", "pres", "abvs", "blws", "psts"];
export const SHAPING_SCRIPTS: readonly {
  name: string;
  pattern: RegExp;
  tags: readonly string[];
  features: readonly string[];
}[] = [
  { name: "árabe", pattern: /\p{Script=Arabic}/u, tags: ["arab"], features: joining },
  { name: "siríaco", pattern: /\p{Script=Syriac}/u, tags: ["syrc"], features: joining },
  { name: "n'ko", pattern: /\p{Script=Nko}/u, tags: ["nko "], features: joining },
  { name: "mongol", pattern: /\p{Script=Mongolian}/u, tags: ["mong"], features: joining },
  { name: "adlam", pattern: /\p{Script=Adlam}/u, tags: ["adlm"], features: joining },
  {
    name: "devanágari",
    pattern: /\p{Script=Devanagari}/u,
    tags: ["dev2", "deva"],
    features: indic,
  },
  { name: "bengali", pattern: /\p{Script=Bengali}/u, tags: ["bng2", "beng"], features: indic },
  { name: "gurmukhi", pattern: /\p{Script=Gurmukhi}/u, tags: ["gur2", "guru"], features: indic },
  { name: "guzerate", pattern: /\p{Script=Gujarati}/u, tags: ["gjr2", "gujr"], features: indic },
  { name: "oriá", pattern: /\p{Script=Oriya}/u, tags: ["ory2", "orya"], features: indic },
  { name: "tâmil", pattern: /\p{Script=Tamil}/u, tags: ["tml2", "taml"], features: indic },
  { name: "télugo", pattern: /\p{Script=Telugu}/u, tags: ["tel2", "telu"], features: indic },
  { name: "canarês", pattern: /\p{Script=Kannada}/u, tags: ["knd2", "knda"], features: indic },
  { name: "malaiala", pattern: /\p{Script=Malayalam}/u, tags: ["mlm2", "mlym"], features: indic },
  { name: "cingalês", pattern: /\p{Script=Sinhala}/u, tags: ["sinh"], features: indic },
  { name: "khmer", pattern: /\p{Script=Khmer}/u, tags: ["khmr"], features: khmer },
  { name: "birmanês", pattern: /\p{Script=Myanmar}/u, tags: ["mym2", "mymr"], features: myanmar },
  { name: "tibetano", pattern: /\p{Script=Tibetan}/u, tags: ["tibt"], features: ["abvs", "blws"] },
];
export type ShapingScript = (typeof SHAPING_SCRIPTS)[number];
// Already-shaped presentation forms and the isolated Arabic mathematical
// letters belong to the Arabic script but never join.
const preshaped = /[ﭐ-﷿ﹰ-﻿\u{1EE00}-\u{1EEFF}]/gu;
/** The first listed script a grapheme belongs to, if any. */
export function shapingScript(cluster: string): ShapingScript | undefined {
  const shaped = cluster.replace(preshaped, "");
  return shaped ? SHAPING_SCRIPTS.find((script) => script.pattern.test(shaped)) : undefined;
}
/** The script a shaper (HarfBuzz order) selects in GSUB: the script's own tags,
 * then the default and Latin systems. Why it cannot shape, or null. */
export function shapingGap(
  substitution: ReadonlyMap<string, ReadonlySet<string>>,
  script: ShapingScript,
): string | null {
  const selected = [...script.tags, "DFLT", "dflt", "latn"].find((tag) => substitution.has(tag));
  if (!selected) return `a fonte não declara o script ${script.name} no GSUB`;
  const features = substitution.get(selected);
  return script.features.some((feature) => features?.has(feature))
    ? null
    : `o GSUB ('${selected}') não aplica as substituições contextuais do script ${script.name} (${script.features.slice(0, 3).join("/")})`;
}

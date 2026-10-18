import { PT_WORDS } from "./ptWords.ts";

/**
 * Real Portuguese words, folded (lowercase, no accents): the 50,000 most frequent words of
 * Brazilian subtitles (ptWords.ts, CC BY-SA 4.0, see LICENSE-pt-words.txt) plus the vocabulary
 * of programming lessons for children. The glossary never swaps one of them for a name.
 */
const LESSON_WORDS =
  "bloco blocos clicar clica clique arrastar arrasta soltar personagem personagens comando comandos codigo programar programacao sensor sensores palco ator atores fantasia fantasias sprite sprites tecla teclas evento eventos repetir repita variavel variaveis condicao laco".split(
    " ",
  );

let words: Set<string> | null = null;

function load(): Set<string> {
  const out = new Set<string>(LESSON_WORDS);
  let previous = "";
  for (const entry of PT_WORDS.split(",")) {
    const shared = Number.parseInt(entry[0], 36);
    previous = previous.slice(0, shared) + entry.slice(1);
    out.add(previous);
  }
  return out;
}

/** `folded` (lowercase, no accents, letters only) is a word of the language. */
export function isPortugueseWord(folded: string): boolean {
  words ??= load();
  return words.has(folded);
}

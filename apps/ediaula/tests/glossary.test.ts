import assert from "node:assert/strict";
import { test } from "node:test";
import {
  correctWords,
  normalizeGlossary,
  promptTerms,
  scriptTerms,
  soundKey,
} from "../src/shared/glossary.ts";
import { isPortugueseWord } from "../src/shared/lexicon/index.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Word } from "../src/shared/types.ts";

const heard = (text: string, p = 0.6): Word[] =>
  text.split(/\s+/).map((t, i) => ({ text: t, start: i, end: i + 0.8, p }));
const say = (words: Word[]): string => words.map((w) => w.text).join(" ");

const GLOSSARY = ["Zappy", "Debinha", "Sistema Zero", "Chave do Farol", "Cassa"];

test("names come out the way the course writes them", () => {
  assert.equal(soundKey("Zappy"), soundKey("Zapi"));
  assert.equal(say(correctWords(heard("o Zapi pulou."), GLOSSARY)), "o Zappy pulou.");
  assert.equal(say(correctWords(heard("a Debina chegou"), GLOSSARY)), "a Debinha chegou");
  assert.equal(say(correctWords(heard("e a de binha, viu?"), GLOSSARY)), "e a Debinha, viu?");
  assert.equal(
    say(correctWords(heard("no sistema zero tem a chave do farol"), GLOSSARY)),
    "no Sistema Zero tem a Chave do Farol",
    "several real words spelling the term take its capitals",
  );
  assert.equal(
    say(correctWords(heard("tem a chave de farol"), GLOSSARY)),
    "tem a chave de farol",
    "real words that only look like the term stay as heard",
  );
});

test("a changed word keeps what was heard; a joined one spans and lists its parts", () => {
  const words: Word[] = [
    { text: "a", start: 0, end: 0.2, p: 0.9, i: 0 },
    { text: "de", start: 0.3, end: 0.5, p: 0.5, i: 1 },
    { text: "binha.", start: 0.5, end: 0.9, p: 0.7, i: 2 },
  ];
  assert.deepEqual(correctWords(words, GLOSSARY), [
    { text: "a", start: 0, end: 0.2, p: 0.9, i: 0 },
    {
      text: "Debinha.",
      start: 0.3,
      end: 0.9,
      p: 0.6,
      i: 1,
      heard: "de binha.",
      joined: [1, 2],
    },
  ]);
  const single = correctWords([{ text: "Zapi,", start: 2, end: 2.4, p: 0.42 }], GLOSSARY);
  assert.deepEqual(single, [{ text: "Zappy,", start: 2, end: 2.4, p: 0.42, heard: "Zapi," }]);
});

test("real Portuguese words are never swapped, however close or unsure", () => {
  const names = ["Julio", "Pedro", "Marcos", "Marta", "Farol"];
  for (const p of [0.95, 0.4])
    for (const sentence of [
      "a aula de julho",
      "a pedra caiu",
      "os barcos chegaram",
      "ela marca o gol",
      "o farol acendeu",
    ])
      assert.equal(say(correctWords(heard(sentence, p), names)), sentence, `${sentence} (p ${p})`);
  const sentence =
    "a casa do zap tem a chave do carro e o sistema de som da escola casa casou com o dedinho";
  assert.equal(say(correctWords(heard(sentence), GLOSSARY)), sentence);
  assert.ok(isPortugueseWord("julho") && isPortugueseWord("esta") && !isPortugueseWord("zapi"));
});

test("letters only change when whisper was unsure", () => {
  assert.equal(say(correctWords(heard("o Zapi pulou", 0.95), GLOSSARY)), "o Zapi pulou");
  assert.equal(say(correctWords(heard("Dabinho", 0.95), GLOSSARY)), "Dabinho");
  assert.equal(say(correctWords(heard("Dabinho", 0.4), GLOSSARY)), "Debinha");
  // Only the case or the accents: it is the name itself, sure or not.
  assert.equal(say(correctWords(heard("a debinha", 0.95), GLOSSARY)), "a Debinha");
});

test("correcting twice changes nothing more", () => {
  const once = correctWords(
    heard("o Zapi e a de binha no sistema zero com a Debina", 0.5),
    GLOSSARY,
  );
  assert.deepEqual(correctWords(once, GLOSSARY), once);
});

test("words corrected by hand are left alone", () => {
  const words = heard("o Zapi e o Zapi");
  const out = correctWords(words, GLOSSARY, { keep: new Set([1]) });
  assert.equal(say(out), "o Zapi e o Zappy");
});

test("the script gives its speakers, names of several words and words that are not Portuguese", () => {
  const doc = parseScript(
    [
      "# Aula 3",
      "## Seção 1. Abertura",
      "**Debinha (avatar):**",
      "> Oi! Hoje o Zappy vai usar a Chave do Farol no Sistema Zero.",
      "**Professora:**",
      "> Vamos lá. O Zappy anda. Clique em Salvar, depois em Executar e Iniciar.",
    ].join("\n"),
  );
  const terms = scriptTerms(doc);
  for (const t of ["Debinha", "Professora", "Zappy", "Chave do Farol", "Sistema Zero"])
    assert.ok(terms.includes(t), t);
  for (const t of ["Salvar", "Executar", "Iniciar", "Oi"]) assert.ok(!terms.includes(t), t);
});

test("the prompt carries the twenty terms the script mentions most", () => {
  const glossary = Array.from({ length: 30 }, (_, i) => `Termo${i}`);
  const ranked = promptTerms(["Raro", ...glossary, "Zappy"], "O Zappy e o Zappy com a Termo29.");
  assert.equal(ranked.length, 20);
  assert.deepEqual(ranked.slice(0, 3), ["Zappy", "Termo29", "Raro"]);
  assert.deepEqual(normalizeGlossary([" Zappy ", "zappy", "", "Chave  do Farol"]), [
    "Zappy",
    "Chave do Farol",
  ]);
});

test("a long transcript is corrected quickly", () => {
  // Thirty minutes of speech over a vocabulary of a few thousand words.
  const syllables = "ba ce di fo gu la me ni po ru sa te vi zo ca de bra tro".split(" ");
  let seed = 7;
  const next = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const vocabulary = Array.from({ length: 3000 }, () =>
    Array.from({ length: 1 + next(4) }, () => syllables[next(syllables.length)]).join(""),
  );
  const words: Word[] = Array.from({ length: 6000 }, (_, i) => ({
    text: vocabulary[next(vocabulary.length)],
    start: i * 0.4,
    end: i * 0.4 + 0.3,
    p: 0.5,
  }));
  const terms = [...GLOSSARY, ...Array.from({ length: 55 }, (_, i) => `Personagem Especial ${i}`)];
  isPortugueseWord("a");
  const t0 = performance.now();
  correctWords(words, terms);
  assert.ok(performance.now() - t0 < 1000, "under a second for 6000 words and 60 terms");
});

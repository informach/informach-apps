import assert from "node:assert/strict";
import { test } from "node:test";
import { correctWords, promptTerms, scriptTerms, soundKey } from "../src/shared/glossary.ts";
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
    say(correctWords(heard("no sistema zero tem a chave de farol"), GLOSSARY)),
    "no Sistema Zero tem a Chave do Farol",
  );
});

test("a joined name spans its parts and keeps their confidence", () => {
  const words: Word[] = [
    { text: "a", start: 0, end: 0.2, p: 0.9 },
    { text: "de", start: 0.3, end: 0.5, p: 0.5 },
    { text: "binha.", start: 0.5, end: 0.9, p: 0.7 },
  ];
  const out = correctWords(words, GLOSSARY);
  assert.deepEqual(out, [
    { text: "a", start: 0, end: 0.2, p: 0.9 },
    { text: "Debinha.", start: 0.3, end: 0.9, p: 0.6 },
  ]);
  const single = correctWords([{ text: "Zapi,", start: 2, end: 2.4, p: 0.42 }], GLOSSARY);
  assert.deepEqual(single, [{ text: "Zappy,", start: 2, end: 2.4, p: 0.42 }]);
});

test("frequent Portuguese words are never swapped for look-alikes", () => {
  const sentence =
    "a casa do zap tem a chave do carro e o sistema de som da escola casa casou com o dedinho";
  assert.equal(say(correctWords(heard(sentence), GLOSSARY)), sentence);
  // Two edits away only when whisper was unsure.
  assert.equal(say(correctWords(heard("Dabinho", 0.95), GLOSSARY)), "Dabinho");
  assert.equal(say(correctWords(heard("Dabinho", 0.4), GLOSSARY)), "Debinha");
});

test("words corrected by hand are left alone", () => {
  const words = heard("o Zapi e o Zapi");
  const out = correctWords(words, GLOSSARY, { keep: new Set([1]) });
  assert.equal(say(out), "o Zapi e o Zappy");
});

test("the script gives its speakers and proper names", () => {
  const doc = parseScript(
    [
      "# Aula 3",
      "## Seção 1. Abertura",
      "**Debinha (avatar):**",
      "> Oi! Hoje o Zappy vai usar a Chave do Farol no Sistema Zero.",
      "**Professora:**",
      "> Vamos lá. O Zappy anda para a direita.",
    ].join("\n"),
  );
  const terms = scriptTerms(doc);
  assert.ok(terms.includes("Debinha"));
  assert.ok(terms.includes("Zappy"));
  assert.ok(terms.includes("Chave do Farol"));
  assert.ok(terms.includes("Sistema Zero"));
  assert.ok(!terms.includes("Professora"), "a frequent word is not a name to correct");
  assert.ok(!terms.includes("Oi"), "a sentence start is not a name");
});

test("the prompt carries the twenty terms the script mentions most", () => {
  const glossary = Array.from({ length: 30 }, (_, i) => `Termo${i}`);
  const ranked = promptTerms(["Raro", ...glossary, "Zappy"], "O Zappy e o Zappy com a Termo29.");
  assert.equal(ranked.length, 20);
  assert.deepEqual(ranked.slice(0, 3), ["Zappy", "Termo29", "Raro"]);
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
    p: 0.9,
  }));
  const terms = [...GLOSSARY, ...Array.from({ length: 55 }, (_, i) => `Personagem Especial ${i}`)];
  const t0 = performance.now();
  correctWords(words, terms);
  assert.ok(performance.now() - t0 < 1000, "under a second for 6000 words and 60 terms");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import {
  correctWords,
  formatGlossary,
  normalizeGlossary,
  parseGlossaryText,
  readGlossary,
} from "../src/shared/glossary.ts";
import { compoundsOf, fuzzyEqual, tokenize } from "../src/shared/ptSpeech.ts";
import { parseScript, speechItems } from "../src/shared/script.ts";
import {
  alignSection,
  needsConfirmation,
  OFF_SCRIPT_LIMIT,
  offScriptShare,
  rankSections,
} from "../src/shared/scriptAlign.ts";
import type { Word } from "../src/shared/types.ts";

const md = readFileSync(new URL("./fixtures/roteiro-farol-dia1.md", import.meta.url), "utf8");
const doc = parseScript(md);
/** Seção 3, "Como o personagem anda". */
const s3 = doc.sections[2];
const lines3 = speechItems(s3).map((i) => i.text);

const toks = (text: string): string =>
  tokenize(text)
    .map((t) => t.tok)
    .join(" ");

let keySeq = 0;
/** Words of a text as said: 0.3 s each, 0.1 s apart, starting at `from`. */
function speak(text: string, from: number): TimelineWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({
      key: `voz:${keySeq++}`,
      clipId: "c",
      text: t,
      start: from + i * 0.4,
      end: from + i * 0.4 + 0.3,
      p: 0.9,
      source: "voz",
      role: "teacher" as const,
    }));
}
const after = (w: TimelineWord[], pause = 1): number => w[w.length - 1].end + pause;

test("spoken Portuguese normalizes the way the script is written", () => {
  assert.equal(toks("pra gente"), "para gente");
  assert.equal(toks("pro personagem"), "para o personagem");
  assert.equal(toks("tá vendo? tô aqui, cê viu"), "esta vendo estou aqui voce viu");
  assert.equal(toks("num jogo dum amigo, vamo lá"), "em 1 jogo de 1 amigo vamos la");
  assert.equal(toks("x 208"), toks("xis duzentos e oito"));
  assert.equal(toks("25%"), toks("vinte e cinco por cento"));
  assert.equal(toks("2026"), toks("dois mil e vinte e seis"));
  assert.equal(toks("2.300.004"), toks("dois milhões trezentos mil e quatro"));
  assert.equal(toks("o 3º quadro"), toks("o terceiro quadro"));
  assert.equal(toks("dois, três"), "2 3", "punctuation ends a number");
  assert.equal(toks("dois e três"), "2 e 3", "two numbers joined by e");
  assert.equal(toks("o arquivo PDF"), toks("o arquivo P D F"));
  assert.equal(toks("o arquivo PDF"), toks("o arquivo pê dê efe"));
  assert.equal(toks("o x aumenta"), "o x aumenta", "a letter alone is not an acronym");
  const compounds = compoundsOf(["Desenhar o cenário praia-tropical"]);
  assert.equal(toks("praia-tropical"), "praia tropical");
  assert.equal(
    tokenize("praiatropical", { compounds })
      .map((t) => t.tok)
      .join(" "),
    "praia tropical",
  );
  // Every token points back at the words it came from.
  assert.deepEqual(
    tokenize("o xis duzentos e oito pra ver").map((t) => [t.tok, t.src]),
    [
      ["o", [0]],
      ["x", [1]],
      ["208", [2, 3, 4]],
      ["para", [5]],
      ["ver", [6]],
    ],
  );
  assert.ok(
    tokenize("pro").every((t) => t.stop),
    "articles and prepositions are marked",
  );
});

test("names close in sound match; short words and numbers only exactly", () => {
  assert.ok(fuzzyEqual("zapi", "zappy"));
  assert.ok(fuzzyEqual("debina", "debinha"));
  assert.ok(fuzzyEqual("personagen", "personagem"));
  assert.ok(!fuzzyEqual("ele", "ela"), "under 4 letters only exact");
  assert.ok(fuzzyEqual("ele", "ela", new Set(["ela"])), "unless a glossary term");
  assert.ok(!fuzzyEqual("208", "209"));
});

test('the Farol script lines match "pra", spoken numbers and a paraphrase', () => {
  const words = [
    ...speak(
      "Esta é uma experiência pra gente entender os quadros do jogo e como o personagem anda.",
      0,
    ),
  ];
  words.push(
    ...speak(
      "Olha aqui, viu: com Segurar a seta pra direita desligado, eu clico em Avançar um quadro. Tá vendo? O quadro passou de zero pra um, mas o xis não muda, porque, sem a seta, o personagem fica parado.",
      after(words),
    ),
  );
  const a = alignSection(s3, words);
  const [first, , third] = a.lines;
  assert.ok(
    first.matched / first.total > 0.9,
    `"pra gente" matches (${first.matched}/${first.total})`,
  );
  assert.ok(
    third.matched / third.total > 0.9,
    `numbers and "pra" (${third.matched}/${third.total})`,
  );
  assert.deepEqual(a.offScript, [], "the word slipped in is a paraphrase, not a cut");
});

test('"vinte e cinco", "x 208" and "Zapi" match the script as written', () => {
  const extra = parseScript(
    [
      "## Seção 1. Teste",
      "**Professora:**",
      '> "O Zappy anda 25 passos até o x 208, ou seja, 25% do caminho até o farol-guia."',
    ].join("\n"),
  ).sections[0];
  const heard = speak(
    "o Zapi anda vinte e cinco passos até o xis duzentos e oito, ou seja, vinte e cinco por cento do caminho até o farol guia.",
    0,
  );
  const line = alignSection(extra, heard, { glossary: ["Zappy"] }).lines[0];
  assert.equal(line.matched, line.total);
  // The glossary corrects the transcript first; whatever it leaves, the alignment still matches.
  const corrected = correctWords(
    heard.map((w): Word => ({ text: w.text, start: w.start, end: w.end, p: 0.5 })),
    ["Zappy"],
  );
  assert.equal(corrected[1].text, "Zappy");
});

test("a line said twice: the earlier take is an off-script block named after the line", () => {
  const false1 = speak("Esta é uma experiência pra gente entender,", 0);
  const take = speak(lines3[0], after(false1, 1));
  const a = alignSection(s3, [...false1, ...take]);
  assert.equal(a.lines[0].matched, a.lines[0].total, "the last take is the one kept");
  assert.equal(a.offScript.length, 1);
  assert.equal(a.offScript[0].retakeOf, 0, "tomada anterior da linha 1");
  assert.equal(a.offScript[0].keys.length, false1.length);
});

test("off the script only whole blocks are proposed, never the middle of a sentence", () => {
  const before = speak("Olha aqui: com Segurar a seta para a direita desligado", 0);
  // An aside said in one breath, with no pause or punctuation around it.
  const aside = speak("nossa ficou bem bonito isso", after(before, 0.1));
  const rest = speak("eu clico em Avançar 1 quadro.", after(aside, 0.1));
  const fluent = alignSection(s3, [...before, ...aside, ...rest]);
  assert.deepEqual(fluent.offScript, []);
  // The same aside between pauses is a block of its own.
  const asideApart = speak("nossa ficou bem bonito isso", after(before, 0.6));
  const restApart = speak("eu clico em Avançar 1 quadro.", after(asideApart, 0.6));
  const apart = alignSection(s3, [...before, ...asideApart, ...restApart]);
  assert.equal(apart.offScript.length, 1);
  assert.equal(apart.offScript[0].text, "nossa ficou bem bonito isso");
});

test("the right section is confident; a weak or close match asks for confirmation", () => {
  // The whole of section 3 said.
  const full: TimelineWord[] = [];
  for (const text of lines3) full.push(...speak(text, full.length ? after(full) : 0));
  const sure = rankSections(doc, full);
  assert.equal(sure.index, 2);
  assert.ok(!needsConfirmation(sure), `coverage ${sure.coverage}, margin ${sure.margin}`);
  // Only the opening of section 5, which says nearly the same as the opening of section 3.
  const s5 = speechItems(doc.sections[4]).map((i) => i.text);
  const opening = speak(s5[0], 0);
  const unsure = rankSections(doc, opening);
  assert.ok(needsConfirmation(unsure), `coverage ${unsure.coverage}, margin ${unsure.margin}`);
  // Aligned with the wrong section, most of what was said falls outside the script.
  const wrong: TimelineWord[] = [];
  for (const item of speechItems(doc.sections[3]))
    wrong.push(...speak(item.text, wrong.length ? after(wrong) : 0));
  assert.ok(offScriptShare(alignSection(s3, wrong)) > OFF_SCRIPT_LIMIT);
  assert.equal(offScriptShare(alignSection(doc.sections[3], wrong)), 0);
});

test("insert ids anywhere in a direction go to the next avatar lines, in order", () => {
  const two = parseScript(
    [
      "## Seção 1. Teste",
      "**Na tela:** depois do clique, F1P2-D01 e em seguida **F1P2-D02**.",
      "**Professora:**",
      '> "Vamos ver."',
      "**Debinha (avatar):**",
      '> "E agora?"',
      "**Debinha:**",
      '> "E depois?"',
    ].join("\n"),
  ).sections[0];
  const screen = two.items[0];
  assert.ok(screen.kind === "screen");
  assert.deepEqual(screen.insertIds, ["F1P2-D01", "F1P2-D02"]);
  const speech = speechItems(two);
  assert.equal(speech[0].insertId, undefined, "the teacher's line takes no id");
  assert.deepEqual(
    speech.slice(1).map((i) => [i.avatar, i.insertId]),
    [
      [true, "F1P2-D01"],
      [true, "F1P2-D02"],
    ],
  );
});

test("glossaries of strings still read, and terms carry the ways they are heard", () => {
  assert.deepEqual(readGlossary(["Zappy", " Debinha "]), ["Zappy", "Debinha"]);
  const read = readGlossary(["Zappy", { term: "Zappy", aliases: ["Zapi"] }, { term: "Farol" }, 3]);
  assert.deepEqual(read, [{ term: "Zappy", aliases: ["Zapi"] }, "Farol"]);
  const text = formatGlossary(read);
  assert.equal(text, "Zappy (Zapi), Farol");
  assert.deepEqual(parseGlossaryText(text), read);
  assert.deepEqual(parseGlossaryText("Zappy (Zapi, Zapy); Chave do Farol\nDebinha"), [
    { term: "Zappy", aliases: ["Zapi", "Zapy"] },
    "Chave do Farol",
    "Debinha",
  ]);
  assert.deepEqual(normalizeGlossary(["zappy", { term: "Zappy", aliases: ["Sápi"] }]), [
    { term: "zappy", aliases: ["Sápi"] },
  ]);
  // A heard form named by the glossary is written as the term, sure or not.
  const words: Word[] = [{ text: "Sápi,", start: 0, end: 0.4, p: 0.99 }];
  assert.equal(correctWords(words, [{ term: "Zappy", aliases: ["Sápi"] }])[0].text, "Zappy,");
});

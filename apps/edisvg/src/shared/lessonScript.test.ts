import assert from "node:assert/strict";
import { test } from "node:test";
import { lessonScript, pickedScript } from "./lessonScript";
import { spokenScript } from "./pipelines";

/** A production script as EdiAula keeps it (the Sistema Zero format): two parts. */
const SCRIPT = [
  "# Roteiro de produção · desafio-dia-1",
  "",
  "A professora grava toda a fala principal.",
  "",
  "## Parte 1. A Chave do Farol",
  "",
  "**Clipe:** `video-intro-farol`",
  "",
  '**Na tela:** A tela mostra o título [na edição: título]. No "mas o farol", apontar o farol [apontar jogo 404 116].',
  "",
  "**Fala para ElevenLabs:**",
  "",
  "```text",
  "[upbeat, welcoming voice] Oi! Neste desafio, você vai programar o jogo A Chave do Farol. Mas o farol está apagado.",
  "```",
  "",
  "## Parte 2. Mantenha o personagem na tela",
  "",
  "**Clipe:** `video-d1-borda`",
  "",
  "**Na tela:** A parte começa com o Estúdio expandido [expandir estúdio].",
  "",
  "**Fala para ElevenLabs:**",
  "",
  "```text",
  "[engaging voice] Aqui no seu jogo, segure uma seta. Tá vendo? Ele passa da beirada.",
  "```",
].join("\n");

test("the lesson's section becomes its spoken sentences, with the directions between them", () => {
  const script = lessonScript(SCRIPT, 1);
  assert.ok(script);
  assert.equal(script.title, "Seção 2 · Mantenha o personagem na tela");
  assert.equal(script.phrases, 3);
  assert.deepEqual(
    script.rows.map((row) => (row.kind === "phrase" ? `${row.index}: ${row.text}` : "tela")),
    ["tela", "0: Aqui no seu jogo, segure uma seta.", "1: Tá vendo?", "2: Ele passa da beirada."],
  );
  // A section past the script's end is its first one (a lesson whose script was cut down).
  assert.equal(lessonScript(SCRIPT, 9)?.title, "Seção 1 · A Chave do Farol");
  assert.equal(lessonScript("# Só um título\n\nUma nota."), null);
});

test("the phrases picked make the roteiro; a direction goes before the first one picked after it", () => {
  const script = lessonScript(SCRIPT, 0);
  assert.ok(script);
  const all = pickedScript(script, new Set([0, 1, 2]));
  assert.equal(
    all,
    [
      '[Na tela: A tela mostra o título (na edição: título). No "mas o farol", apontar o farol (apontar jogo 404 116).] Oi!',
      "Neste desafio, você vai programar o jogo A Chave do Farol.",
      "Mas o farol está apagado.",
    ].join("\n"),
  );
  // Only the last phrase: the direction still goes with it.
  const last = pickedScript(script, new Set([2]));
  assert.match(last, /^\[Na tela: .*\] Mas o farol está apagado\.$/);
  // What the audio is searched for leaves the directions out, as for a pasted roteiro.
  assert.equal(spokenScript(last), "Mas o farol está apagado.");
  assert.equal(pickedScript(script, new Set()), "");
});

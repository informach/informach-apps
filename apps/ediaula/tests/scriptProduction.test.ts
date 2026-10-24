import assert from "node:assert/strict";
import { test } from "node:test";
import { recordedStretches, screenCueTimes, scriptGuide } from "../src/shared/screenCues.ts";
import { parseScript, screenCues, speechItems, withoutVoiceTags } from "../src/shared/script.ts";
import { alignSection } from "../src/shared/scriptAlign.ts";

/** A production script as the course writes them now (Cadê Todo Mundo, aula 1). */
const SCRIPT = `# Roteiro de produção · cade-todo-mundo-aula-1

A professora grava toda a fala principal. Na edição kids, substituir apenas os trechos da tabela.

## Parte 1. Bem-vindo ao jardim

**Clipe:** \`video-a1-abertura\`

**Na tela:** mostrar o jogo pronto nesta parte, com os três personagens escondidos. No "Olha aqui", tocar em UM esconderijo e deixar ver o personagem aparecer. No "repare", apontar o número Achados, que virou 1. Não tocar nos outros esconderijos. No "tem mais uma coisa", falar olhando para a câmera.

**Fala para ElevenLabs:**

\`\`\`text
[upbeat, welcoming voice] Oi! Você vai construir um jogo chamado Cadê Todo Mundo.

[engaging, energetic, conversational voice] Neste jardim, três personagens estão escondidos. [interested, animated voice] Olha aqui: quando eu toco num esconderijo, ele some e aparece quem estava atrás dele. Achei um! E repare no número Achados: ele mudou para 1.

[curious] E os outros dois?

[engaging, energetic, conversational voice] Ah, e tem mais uma coisa: no fim do curso tem uma surpresa esperando por você.
\`\`\`

**Substituições na edição kids:**

| ID | Personagem | Ocorrência | Âncora anterior | Fala exata substituída | Âncora posterior | Tags |
| --- | --- | --- | --- | --- | --- | --- |
| video-a1-abertura-K1 | Debinha | 1 | ele mudou para 1. | E os outros dois? | Ah, e tem mais uma coisa: | [curious] |

No adulto, manter toda a fala da professora. No kids, silenciar apenas o trecho marcado.

**Recado na página (não gravar):** Sua vez! Jogue a versão pronta.

## Parte 4. Faça alguém aparecer

**Clipe:** \`video-a1-programar\`

**Na tela:** abrir o Estúdio incorporado com o projeto inicial. No "Tá vendo?", mostrar que nada acontece.

**Fala para ElevenLabs:**

\`\`\`text
[engaging, energetic, conversational voice] Aqui no seu jogo, toque num esconderijo. Tá vendo? Nada acontece.

[curious] E como faz isso no jogo?

[thoughtful] Talvez você esteja pensando: “No meu jogo ainda não funcionou.”
\`\`\`

**Substituições na edição kids:**

| ID | Personagem | Ocorrência | Âncora anterior | Fala exata substituída | Âncora posterior | Tags |
| --- | --- | --- | --- | --- | --- | --- |
| video-a1-programar-K1 | Debinha | 1 | Nada acontece. | E como faz isso no jogo? | Talvez você | [curious] |
| video-a1-programar-K3 | Dedé | 2 | você esteja pensando: | No meu jogo ainda não funcionou. | Se aconteceu com você | [thoughtful] |
`;

test("as falas do bloco para a ferramenta de voz são da professora, sem as marcações de voz", () => {
  const doc = parseScript(SCRIPT);
  assert.equal(doc.sections.length, 2);
  const [one, four] = doc.sections;
  assert.deepEqual(
    speechItems(one).map((i) => [i.speaker, i.avatar, i.text]),
    [
      ["Professora", false, "Oi! Você vai construir um jogo chamado Cadê Todo Mundo."],
      [
        "Professora",
        false,
        "Neste jardim, três personagens estão escondidos. Olha aqui: quando eu toco num esconderijo, ele some e aparece quem estava atrás dele. Achei um! E repare no número Achados: ele mudou para 1.",
      ],
      ["Professora", false, "E os outros dois?"],
      [
        "Professora",
        false,
        "Ah, e tem mais uma coisa: no fim do curso tem uma surpresa esperando por você.",
      ],
    ],
  );
  assert.equal(speechItems(four).length, 3);
  // Nothing of the fenced block, the table or its labels became a note or a speaker.
  assert.ok(
    one.items.every((i) => i.kind !== "note" || !/upbeat|\| ID|Fala para|text/.test(i.text)),
  );
  assert.ok(
    one.items.some((i) => i.kind === "bridge" && i.text === "Sua vez! Jogue a versão pronta."),
  );
});

test("o clipe dá o código do vídeo da parte, e a tabela kids é lida linha a linha", () => {
  const [one, four] = parseScript(SCRIPT).sections;
  assert.equal(one.videoId, "video-a1-abertura");
  assert.equal(four.videoId, "video-a1-programar");
  assert.deepEqual(one.substitutions, [
    {
      id: "video-a1-abertura-K1",
      character: "Debinha",
      occurrence: 1,
      before: "ele mudou para 1.",
      text: "E os outros dois?",
      after: "Ah, e tem mais uma coisa:",
      tags: "[curious]",
    },
  ]);
  assert.deepEqual(
    four.substitutions?.map((s) => [s.id, s.character, s.occurrence, s.text]),
    [
      ["video-a1-programar-K1", "Debinha", 1, "E como faz isso no jogo?"],
      ["video-a1-programar-K3", "Dedé", 2, "No meu jogo ainda não funcionou."],
    ],
  );
});

test("o Na tela é dividido nas frases da fala que ele cita", () => {
  const [one] = parseScript(SCRIPT).sections;
  const screen = one.items.find((i) => i.kind === "screen");
  assert.ok(screen && screen.kind === "screen");
  assert.deepEqual(
    screen.cues?.map((c) => c.anchor ?? null),
    [null, "Olha aqui", "repare", "tem mais uma coisa"],
  );
  // A sentence without a quote stays with the piece before it.
  assert.equal(
    screen.cues?.[2].text,
    'No "repare", apontar o número Achados, que virou 1. Não tocar nos outros esconderijos.',
  );
  // An older script's direction quotes nothing: no pieces, as before.
  assert.equal(screenCues("Abrir a página de cadastro e preencher o nome.", "Vamos lá."), null);
  // A quote that is not said is a label on the screen, never a moment of the speech.
  assert.equal(screenCues('Clicar em "Cadastrar". Depois, salvar.', "Agora vamos salvar."), null);
  assert.equal(withoutVoiceTags("[curious] E os outros dois? [pause]"), "E os outros dois?");
});

test("no gravador cada pedaço do Na tela aparece quando a voz chega na frase dele", () => {
  const [one] = parseScript(SCRIPT).sections;
  // The voice said at one word every 0.4 s from second 2.
  const spoken = speechItems(one)
    .map((i) => i.text)
    .join(" ")
    .split(/\s+/);
  const words = spoken.map((text, k) => ({
    key: `w${k}`,
    clipId: "c",
    assetId: "a",
    start: 2 + k * 0.4,
    end: 2 + k * 0.4 + 0.3,
    text,
  }));
  const cues = screenCueTimes(one, alignSection(one, words).lines, words);
  const at = (word: string, from = 0) =>
    words.find((w, k) => k >= from && w.text.replace(/\W/g, "") === word)?.start ?? -1;
  const olha = spoken.indexOf("Olha");
  assert.deepEqual(
    cues.map((c) => Math.round(c.t * 10) / 10),
    [
      // The opening a moment before the first line.
      1.5,
      at("Olha") - 0.5,
      at("repare", olha) - 0.5,
      at("tem", olha) - 0.5,
    ].map((v) => Math.round(v * 10) / 10),
  );
});

test("o guia do gravador acha cada fala de todas as partes na voz, e onde já há tela gravada", () => {
  const doc = parseScript(SCRIPT);
  const spoken = doc.sections
    .flatMap((s) => speechItems(s).map((i) => i.text))
    .join(" ")
    .split(/\s+/);
  const words = spoken.map((text, k) => ({
    key: `w${k}`,
    clipId: "c",
    assetId: "a",
    start: k * 0.4,
    end: k * 0.4 + 0.3,
    p: 1,
    text,
  }));
  const guide = scriptGuide(doc, words);
  // Every line of both parts, in order, each with its part.
  assert.deepEqual(
    guide.places.map((l) => [l.part, l.text.slice(0, 12)]),
    [
      ["Parte 1 · Bem-vindo ao jardim", "Oi! Você vai"],
      ["Parte 1 · Bem-vindo ao jardim", "Neste jardim"],
      ["Parte 1 · Bem-vindo ao jardim", "E os outros "],
      ["Parte 1 · Bem-vindo ao jardim", "Ah, e tem ma"],
      ["Parte 4 · Faça alguém aparecer", "Aqui no seu "],
      ["Parte 4 · Faça alguém aparecer", "E como faz i"],
      ["Parte 4 · Faça alguém aparecer", "Talvez você "],
    ],
  );
  assert.ok(guide.places.every((l, i, all) => i === 0 || all[i - 1].t <= l.t));
  // The "Na tela" of part 4 comes too, after the ones of part 1.
  assert.ok(guide.cues.some((c) => c.text.includes("Tá vendo?")));
  assert.deepEqual(
    recordedStretches({
      tracks: [
        { id: "tv", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      ],
      assets: [
        { id: "s1", recording: { id: "a", role: "screen" } },
        { id: "s2", recording: { id: "b", role: "screen" } },
        { id: "img" },
      ] as never,
      clips: [
        { id: "1", assetId: "s1", trackId: "tv", start: 0, in: 0, duration: 10, volume: 1 },
        { id: "2", assetId: "s2", trackId: "tv", start: 10, in: 0, duration: 5, volume: 1 },
        { id: "3", assetId: "s1", trackId: "tv", start: 30, in: 0, duration: 2, volume: 1 },
        { id: "4", assetId: "img", trackId: "tv", start: 40, in: 0, duration: 2, volume: 1 },
      ],
    }),
    [
      [0, 15],
      [30, 32],
    ],
  );
});

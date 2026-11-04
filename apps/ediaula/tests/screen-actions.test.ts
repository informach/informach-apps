import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TEMPOS } from "../src/shared/guidedPlan.ts";
import { findPhrase } from "../src/shared/phrase.ts";
import {
  actionStep,
  editMarks,
  editNoteOf,
  followGap,
  heldFor,
  planFromScript,
  screenActions,
} from "../src/shared/screenActions.ts";

/** O plano da gravação guiada escrito no roteiro: as ações entre colchetes do "Na tela". */

const viewport = { width: 1920, height: 1080 };

test("os colchetes de um Na tela são as ações, em ordem", () => {
  assert.deepEqual(screenActions('No "Olha aqui", [ampliar jogo] e [achar  arbusto].'), [
    "ampliar jogo",
    "achar arbusto",
  ]);
  assert.deepEqual(screenActions("Tela da aula, sem ação."), []);
});

test("os verbos do EdiAula viram etapas; os outros vão para a plataforma", () => {
  const click = actionStep('clicar em "Começar"', "a", viewport);
  assert.equal(click.action, "click");
  assert.deepEqual(click.target?.locator?.strategies, [
    { by: "label", value: "Começar" },
    { by: "text", value: "Começar" },
  ]);
  assert.equal(actionStep("apontar “Baixar”", "b", viewport).action, "point");
  assert.equal(actionStep('clique duplo no "Bloco"', "c", viewport).action, "doubleClick");
  const typing = actionStep('digitar "Lia" no "Nome"', "d", viewport);
  assert.deepEqual([typing.action, typing.value], ["type", "Lia"]);
  assert.equal(typing.target?.locator?.fingerprint.text, "Nome");
  assert.deepEqual(actionStep("tecla ctrl+z", "e", viewport).chord, "Ctrl+Z");
  const drag = actionStep('arrastar "mover" para "quando começar"', "f", viewport);
  assert.equal(drag.action, "drag");
  assert.equal(drag.to?.target?.locator?.fingerprint.text, "quando começar");
  const wait = actionStep('esperar "Pronto" sumir', "g", viewport);
  assert.equal(wait.until?.state, "hidden");
  assert.deepEqual(actionStep("rolar para cima 200", "h", viewport).delta, { x: 0, y: -200 });
  assert.equal(actionStep('rolar até "Materiais"', "i", viewport).until?.state, "visible");
  // A key the app does not know, or a verb of the platform, is the platform's.
  for (const text of ["tecla Foo", "ampliar jogo", "categoria Jogo 2D > Sprites"]) {
    const step = actionStep(text, "x", viewport);
    assert.equal(step.action, "platform", text);
    assert.equal(step.platform, text);
  }
});

test("a mão sai quando a frase citada começa e age quando a voz termina de dizê-la", () => {
  const lines = ["Vamos começar. Olha aqui, o jogo pronto.", "Agora repare no arbusto."];
  const notes = [
    { before: 0, text: 'No "Olha aqui", [ampliar jogo] e [achar arbusto].' },
    { before: 1, text: "[voltar à aula]" },
    { before: 1, text: 'No "frase que ninguém diz", [clicar "Ok"].' },
  ];
  const spoken = lines.join(" ").split(/\s+/);
  const words = spoken.map((text, k) => ({ text, start: 1 + k * 0.5, end: 1.4 + k * 0.5 }));
  const said = (word: string) => words.find((w) => w.text.startsWith(word))?.start ?? -1;
  const ends = (word: string) => words.find((w) => w.text.startsWith(word))?.end ?? -1;
  const { steps, unsaid } = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.deepEqual(
    steps.map((s) => [s.action === "platform" ? s.platform : s.action, s.at]),
    [
      // "Olha aqui": the action after "aqui", not on "Olha".
      ["ampliar jogo", ends("aqui")],
      ["achar arbusto", Math.round((ends("aqui") + followGap(DEFAULT_TEMPOS)) * 100) / 100],
      // A plain direction: when its line starts.
      ["voltar à aula", said("Agora")],
      // The quote inside the bracket is a button, not a phrase: the one outside is never said,
      // so the direction is plain too.
      ["click", said("Agora")],
    ],
  );
  // The hand leaves when the phrase starts; for the next of the phrase, once the first acted.
  assert.equal(steps[0].speechAt, said("Olha"));
  assert.equal(steps[1].speechAt, steps[0].at);
  for (const s of steps.slice(2)) assert.equal(s.speechAt, s.at);
  assert.equal(unsaid, 0);
  // Every gesture is shown: one past the end of the voice goes right at its end (in sped up), and
  // the teacher is told how many. (The second of "Olha aqui" comes after the hand's time from the
  // end of the phrase: past it.)
  const short = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, ends("Agora"));
  assert.equal(short.steps.length, 4);
  assert.equal(short.afterVoice, 1);
  assert.equal(short.unsaid, 0);
  for (const s of short.steps) assert.ok(s.at < ends("Agora") && (s.speechAt ?? 0) <= s.at);
  // A phrase the voice only says after it ends is not said.
  const shorter = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, said("Agora"));
  assert.equal(shorter.steps.length, 2);
  assert.equal(shorter.unsaid, 2);
});

test("[na edição: …] não é gesto: vira lembrete no segundo da frase, para a edição trocar", () => {
  const lines = ["Você terminou! Olha só o que você programou."];
  const notes = [{ before: 0, text: 'No "Olha só", [na edição: jogo pronto sendo jogado].' }];
  const words = lines[0]
    .split(/\s+/)
    .map((text, k) => ({ text, start: 2 + k * 0.5, end: 2.4 + k * 0.5 }));
  const plan = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.notes, [{ at: 3, text: "jogo pronto sendo jogado" }]);
  assert.equal(editNoteOf("Na edição: vídeo"), "vídeo");
  assert.equal(editNoteOf("achar arbusto"), null);
  // A take placed at timeline 10 s, narration 0 at its 2.5 s: the note lands at 10 + 2.5 + 3.
  assert.deepEqual(editMarks(plan.notes, { at: 10, narrationOffset: 2.5, duration: 30 }), [
    { t: 15.5, text: "Na edição: jogo pronto sendo jogado" },
  ]);
  // A take that started later in the narration does not show notes from before it.
  assert.deepEqual(editMarks(plan.notes, { at: 0, narrationOffset: -10, duration: 30 }), []);
});

test("o que não cabe antes da frase seguinte fica na ordem do roteiro, sem se misturar com ela", () => {
  const lines = ["Aqui aparecem como blocos. Olha aqui: neste menu."];
  const notes = [
    {
      before: 0,
      text: 'No "como blocos", [apontar bloco "A"] e [apontar bloco "B"]. No "neste menu", [apontar paleta].',
    },
  ];
  const words = lines[0]
    .split(/\s+/)
    .map((text, k) => ({ text, start: 1 + k * 0.35, end: 1.3 + k * 0.35 }));
  const { steps } = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.deepEqual(
    steps.map((s) => s.platform),
    ['apontar bloco "A"', 'apontar bloco "B"', "apontar paleta"],
  );
  // The second gesture would fall after the next phrase: it keeps its place and runs late.
  assert.ok(steps[1].at > steps[2].at);
});

test("a citação acha a voz mesmo com uma palavra ouvida diferente, e a que não acha vem depois da anterior", () => {
  // The voice says "Toque num esconderijo"; the transcription heard "no", and "zero" as "0".
  const heard =
    "Clique no 50 e troque por 0. Agora vamos testar no seu jogo! Toque no esconderijo. Achados continua em 0 por enquanto.";
  const lines = [
    "Clique no 50 e troque por 0. Agora vamos testar no seu jogo! Toque num esconderijo. Achados continua em zero por enquanto. Que legal.",
  ];
  const notes = [
    {
      before: 0,
      text: 'No "Clique no 50 e troque por 0", [trocar "50" por "0"]. No "Agora vamos testar no seu jogo, toque num esconderijo", [tocar prévia arbusto]. No "Achados continua em zero", [apontar prévia 75 26]. No "Que legal", [tocar prévia pedras].',
    },
  ];
  const words = heard
    .split(/\s+/)
    .map((text, k) => ({ text, start: 1 + k * 0.4, end: 1.3 + k * 0.4 }));
  const ends = (word: string) => words.find((w) => w.text.startsWith(word))?.end ?? -1;
  const { steps, missed } = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.deepEqual(
    steps.map((s) => [s.platform, s.at]),
    [
      ['trocar "50" por "0"', ends("0.")],
      // The tap after "esconderijo", not on "Agora".
      ["tocar prévia arbusto", ends("esconderijo")],
      ["apontar prévia 75 26", words.filter((w) => w.text === "0")[0].end],
      // Not found: right after the gesture before, never before it.
      ["tocar prévia pedras", Math.round((steps[2].at + followGap(DEFAULT_TEMPOS)) * 100) / 100],
    ],
  );
  assert.equal(
    steps[1].speechAt,
    Math.round((words.find((w) => w.text === "Agora")?.start ?? -1) * 100) / 100,
  );
  assert.deepEqual(missed, ["Que legal"]);
  for (const [i, s] of steps.entries()) if (i) assert.ok(s.at >= steps[i - 1].at);
});

test("a palavra que a transcrição junta antes de um nome entre aspas conta como duas", () => {
  const words = [
    { text: "Quando", start: 43.2, end: 43.7 },
    { text: "terminar,", start: 43.8, end: 44.2 },
    { text: "clique", start: 44.3, end: 44.5 },
    { text: ' em "próxima', start: 44.5, end: 45.3 },
    { text: 'parte".', start: 45.4, end: 45.9 },
  ];
  const found = findPhrase(words, "Quando terminar, clique em Próxima");
  assert.ok(found);
  assert.equal(found.start, 43.2);
  // "em" takes its share of the joined word: "próxima" ends where it did.
  assert.equal(found.end, 45.3);
  assert.equal(findPhrase(words, "clique em")?.end, 44.5 + (0.8 * 2) / 10);
});

test("a citação acha a voz quando a transcrição pula ou junta uma palavra", () => {
  const words = "Aí é só clicar em outro bicho, como gato. Se não achar, role a lista."
    .split(" ")
    .map((text, k) => ({ text, start: k, end: k + 0.5 }));
  // "o" was left out of "como o gato": the place still ends on "gato".
  assert.equal(
    findPhrase(words, "Aí é só clicar em outro bicho, como o gato", { loose: true })?.end,
    8.5,
  );
  // Without loose, every word must be there.
  assert.equal(findPhrase(words, "Aí é só clicar em outro bicho, como o gato"), null);
  // The last word is never one left out.
  assert.equal(
    findPhrase(words, "Aí é só clicar em outro bicho, como o cachorro", { loose: true }),
    null,
  );
});

test("segurar prende o botão ou a tecla pelo tempo do colchete, e o gesto seguinte espera soltar", () => {
  const button = actionStep('segurar "Mover para a direita" por 1,5 s', "a", viewport);
  assert.deepEqual([button.action, button.hold], ["hold", 1.5]);
  assert.equal(button.target?.locator?.fingerprint.text, "Mover para a direita");
  const key = actionStep("segurar tecla ArrowRight por 2 segundos", "b", viewport);
  assert.deepEqual(
    [key.action, key.chord, key.hold, key.target],
    ["hold", "ArrowRight", 2, undefined],
  );
  assert.equal(actionStep("segurar tecla ArrowUp", "c", viewport).hold, undefined);
  // The platform's own "segurar" (its arrows on the game's screen) stays the platform's.
  assert.equal(actionStep("segurar seta da direita por 2 s", "d", viewport).action, "platform");
  assert.equal(heldFor("segurar seta da direita por 2 s"), 2);
  assert.equal(heldFor("segurar seta de cima"), 1);
  assert.equal(heldFor("apontar jogo"), 0);

  const lines = ["Agora segure cada seta até a beirada."];
  const notes = [
    {
      before: 0,
      text: 'No "Agora segure cada seta", [segurar seta de cima por 2 s] e [segurar seta da esquerda].',
    },
  ];
  const words = lines[0]
    .split(/\s+/)
    .map((text, k) => ({ text, start: 1 + k * 0.4, end: 1.3 + k * 0.4 }));
  const { steps } = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.equal(steps.length, 2);
  // The second one comes after the hand's time and the 2 s the first one holds.
  assert.equal(steps[1].at, Math.round((steps[0].at + followGap(DEFAULT_TEMPOS) + 2) * 100) / 100);
});

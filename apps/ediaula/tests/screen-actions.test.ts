import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TEMPOS } from "../src/shared/guidedPlan.ts";
import {
  actionStep,
  followGap,
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

test("cada colchete cai no segundo em que a voz diz a frase citada", () => {
  const lines = ["Vamos começar. Olha aqui, o jogo pronto.", "Agora repare no arbusto."];
  const notes = [
    { before: 0, text: 'No "Olha aqui", [ampliar jogo] e [achar arbusto].' },
    { before: 1, text: "[voltar à aula]" },
    { before: 1, text: 'No "frase que ninguém diz", [clicar "Ok"].' },
  ];
  const spoken = lines.join(" ").split(/\s+/);
  const words = spoken.map((text, k) => ({ text, start: 1 + k * 0.5, end: 1.4 + k * 0.5 }));
  const said = (word: string) => words.find((w) => w.text.startsWith(word))?.start ?? -1;
  const { steps, unplaced } = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, 60);
  assert.deepEqual(
    steps.map((s) => [s.action === "platform" ? s.platform : s.action, s.at]),
    [
      ["ampliar jogo", said("Olha")],
      ["achar arbusto", Math.round((said("Olha") + followGap(DEFAULT_TEMPOS)) * 100) / 100],
      // A plain direction: when its line starts.
      ["voltar à aula", said("Agora")],
      // The quote inside the bracket is a button, not a phrase: the one outside is never said,
      // so the direction is plain too.
      ["click", said("Agora")],
    ],
  );
  for (const s of steps) assert.equal(s.speechAt, s.at);
  assert.equal(unplaced, 0);
  // Past the end of the voice nothing is placed, and the teacher is told how many were left out.
  const short = planFromScript({ lines, notes }, words, viewport, DEFAULT_TEMPOS, said("Agora"));
  assert.equal(short.steps.length, 2);
  assert.equal(short.unplaced, 2);
});

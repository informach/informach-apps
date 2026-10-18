import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import {
  capPerMinute,
  ruleMatches,
  safeSpot,
  screenDirections,
} from "../src/shared/screenDirections.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Alignment } from "../src/shared/scriptAlign.ts";

const SCRIPT = `# Roteiro

## Seção 1: O farol

**Na tela:** o jogo pronto aberto, botão "Play" em destaque.

**Professora:**
> Vamos jogar a versão pronta.

**Na tela:** **F1P1-D01** · Debinha entra pela direita.

**Debinha (avatar):**
> Oi, eu sou a Debinha!

**Na tela:** pausar para a pessoa testar.

**Professora:**
> Agora é a sua vez de testar.

**Na tela:** o farol apagado no canto da tela.

**Professora:**
> O farol está apagado.
`;

const section = parseScript(SCRIPT).sections[0];
const lineAt = (text: string): number =>
  section.items.findIndex((it) => it.kind === "speech" && it.text.startsWith(text));

const alignment: Alignment = {
  lines: [
    { item: lineAt("Vamos"), matched: 5, total: 5, start: 2, end: 4 },
    { item: lineAt("Oi"), matched: 4, total: 4, start: 6, end: 8 },
    { item: lineAt("Agora"), matched: 6, total: 6, start: 12, end: 14 },
    { item: lineAt("O farol"), matched: 4, total: 4, start: 20, end: 22 },
  ],
  offScript: [],
  substitutions: [],
  coverage: 1,
  content: 1,
  spoken: 19,
  unaligned: 0,
};

const word = (key: string, start: number): TimelineWord => ({
  key,
  clipId: "c",
  text: "x",
  start,
  end: start + 0.3,
  p: 1,
});

test("each direction lands on the start of the line said after it, anchored on its first word", () => {
  const list = screenDirections(section, alignment, {
    words: [word("voz:0", 2), word("voz:9", 20.02)],
  });
  // The avatar's entrance (an insert) and the pause to test are left out.
  assert.equal(list.length, 2);
  assert.equal(list[0].at, 2);
  assert.equal(list[0].key, "voz:0");
  assert.equal(list[0].kind, "label");
  assert.equal(list[0].text, "Play");
  assert.equal(list[1].at, 20);
  assert.equal(list[1].key, "voz:9");
  assert.equal(list[1].kind, "note");
  assert.match(list[1].text ?? "", /farol apagado/);
  // Three seconds, or less when the next line comes sooner.
  assert.equal(list[0].duration, 3);
});

test("a direction whose next line was not said is left out", () => {
  const partial: Alignment = {
    ...alignment,
    lines: alignment.lines.map((l) =>
      l.start === 20 ? { ...l, matched: 1, start: undefined } : l,
    ),
  };
  assert.equal(screenDirections(section, partial).length, 1);
});

test("the place: the recording's target first, then the template's rule, then a safe spot", () => {
  const rules = [
    {
      when: { screenText: "farol apagado" },
      do: { annotation: { kind: "arrow" as const, x: 0.7, y: 0.3, color: "#FF4D4D" } },
    },
  ];
  const [play, farol] = screenDirections(section, alignment, {
    targets: [{ t: 3.1, x: 0.42, y: 0.61 }],
    rules,
  });
  assert.equal(play.from, "target");
  assert.equal(play.kind, "highlight");
  assert.equal(play.text, undefined);
  assert.deepEqual([play.x, play.y], [0.42, 0.61]);
  assert.equal(farol.from, "rule");
  assert.equal(farol.kind, "arrow");
  assert.deepEqual([farol.x, farol.y], [0.7, 0.3]);
  assert.equal(farol.style.color, "#FF4D4D");
  // A target long after the line is not this direction's.
  const far = screenDirections(section, alignment, { targets: [{ t: 9, x: 0.1, y: 0.1 }] });
  assert.equal(far[0].from, "safe");
});

test("a safe spot never covers the presenter while the annotation lasts", () => {
  const avatar = { start: 0, end: 30, x0: 0.3, y0: 0, x1: 0.7, y1: 0.3 };
  const [x, y] = safeSpot([avatar], 2, 5);
  assert.ok(x + 0.16 <= 0.3 || x - 0.16 >= 0.7 || y - 0.06 >= 0.3);
  const [play] = screenDirections(section, alignment, { avoid: [avatar] });
  assert.equal(play.from, "safe");
  assert.notDeepEqual([play.x, play.y], [0.5, 0.12]);
  // The presenter only later: the first spot is free.
  assert.deepEqual(safeSpot([{ ...avatar, start: 10 }], 2, 5), [0.5, 0.12]);
});

test("rules match every word of their screen text, and the template's limit per minute holds", () => {
  assert.ok(ruleMatches({ when: { screenText: "Farol apagado" } }, "o farol apagado no canto"));
  assert.ok(!ruleMatches({ when: { screenText: "farol aceso" } }, "o farol apagado no canto"));
  assert.ok(!ruleMatches({ when: {} }, "qualquer coisa"));
  const many = [0, 10, 20, 30, 70, 75].map((at) => ({ at }));
  assert.deepEqual(
    capPerMinute(many, 2).map((a) => a.at),
    [0, 10, 70, 75],
  );
  assert.equal(capPerMinute(many, 0).length, 6);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import {
  type AvoidBox,
  capPerMinute,
  directionId,
  inSafeArea,
  pointOnFrame,
  ruleMatches,
  safeSpot,
  screenDirections,
} from "../src/shared/screenDirections.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Alignment } from "../src/shared/scriptAlign.ts";
import type { Asset, Clip } from "../src/shared/types.ts";

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

const round = (v: readonly number[]): number[] => v.map((n) => Math.round(n * 1000) / 1000);

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
  // The real first word heard, a little after where the alignment says the line starts.
  assert.equal(list[1].at, 20.02);
  assert.equal(list[1].key, "voz:9");
  assert.equal(list[1].kind, "note");
  assert.match(list[1].text ?? "", /farol apagado/);
  // Three seconds, or less when the next line comes sooner.
  assert.equal(list[0].duration, 3);
  // Each one knows which direction of the script it came from, so it is never added twice.
  assert.equal(list[0].id, directionId(section, list[0].item, list[0].direction));
  assert.notEqual(list[0].id, list[1].id);
  // A word heard after the line is over is not its first word: the line's start counts.
  const late = screenDirections(section, alignment, { words: [word("voz:9", 25)] });
  assert.equal(late[1].at, 20);
  assert.equal(late[1].key, undefined);
});

test("only asking the recording to wait leaves a direction out", () => {
  const count = (direction: string): number => {
    const one = parseScript(
      `# Roteiro\n\n## Seção 1: A\n\n**Na tela:** ${direction}\n\n**Professora:**\n> Vamos jogar a versão pronta.\n`,
    ).sections[0];
    const item = one.items.findIndex((it) => it.kind === "speech");
    return screenDirections(one, {
      ...alignment,
      lines: [{ item, matched: 5, total: 5, start: 2, end: 4 }],
    }).length;
  };
  for (const wait of [
    "espere carregar o jogo",
    "Espera a fase abrir",
    "esperar o farol",
    "aguarde",
  ])
    assert.equal(count(wait), 0, wait);
  for (const shown of ["a esperança do farol", "o gato esperto pula", "o jogo esperado"])
    assert.equal(count(shown), 1, shown);
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
  // A click at the edge still puts the whole highlight inside the safe area.
  const [edge] = screenDirections(section, alignment, { targets: [{ t: 2.5, x: 0.99, y: 0.01 }] });
  assert.deepEqual(round([edge.x, edge.y]), [0.88, 0.12]);
  assert.deepEqual(round(inSafeArea(0.5, 0.97)), [0.5, 0.89]);
  // Where the point is when the annotation shows, not when the click happened.
  const [moved] = screenDirections(section, alignment, {
    targets: [{ t: 3.1, x: 0.42, y: 0.61, seenAt: (at) => (at === 2 ? [0.3, 0.4] : [0.42, 0.61]) }],
  });
  assert.deepEqual([moved.x, moved.y], [0.3, 0.4]);
});

test("a click is placed where the recording's zoom shows it at that moment", () => {
  const screen: Pick<Asset, "width" | "height" | "zooms"> = {
    width: 1920,
    height: 1080,
    zooms: [{ id: "z", start: 0, end: 10, scale: 2, focus: [{ t: 0, x: 0.25, y: 0.25 }] }],
  };
  const c: Clip = {
    id: "c",
    assetId: "tela",
    trackId: "v1",
    start: 0,
    in: 0,
    duration: 30,
    volume: 1,
  };
  const frame = { width: 1920, height: 1080, fps: 30 };
  // Zoomed in on the top left quarter: its middle is the middle of the frame, and twice as far.
  assert.deepEqual(round(pointOnFrame(c, screen, frame, 0.25, 0.25, 5)), [0.5, 0.5]);
  assert.deepEqual(round(pointOnFrame(c, screen, frame, 0.3, 0.25, 5)), [0.6, 0.5]);
  // Without the zoom (after it), the point is where it was recorded.
  assert.deepEqual(round(pointOnFrame(c, screen, frame, 0.3, 0.25, 20)), [0.3, 0.25]);
  // A clip that starts later on the timeline is read at its own source second.
  const later: Clip = { ...c, start: 100, in: 0 };
  assert.deepEqual(round(pointOnFrame(later, screen, frame, 0.25, 0.25, 105)), [0.5, 0.5]);
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

test("wherever the presenter stands, the safe spot is beside it; filling the frame, at the bottom", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): AvoidBox => ({
    start: 0,
    end: 30,
    x0,
    y0,
    x1,
    y1,
  });
  const places: Record<string, AvoidBox> = {
    "canto de cima à esquerda": box(0, 0, 0.35, 0.4),
    "canto de cima à direita": box(0.65, 0, 1, 0.4),
    "canto de baixo à esquerda": box(0, 0.6, 0.35, 1),
    "canto de baixo à direita": box(0.65, 0.6, 1, 1),
    "no meio": box(0.3, 0.2, 0.7, 0.8),
    "metade esquerda": box(0, 0, 0.5, 1),
    "metade direita": box(0.5, 0, 1, 1),
    "faixa de cima": box(0, 0, 1, 0.3),
  };
  for (const [where, b] of Object.entries(places)) {
    const [x, y] = safeSpot([b], 2, 5);
    const covers = x - 0.16 < b.x1 && x + 0.16 > b.x0 && y - 0.06 < b.y1 && y + 0.06 > b.y0;
    assert.ok(!covers, `${where}: ${x}, ${y}`);
  }
  // The presenter fills the frame: a bottom corner, away from the face.
  assert.deepEqual(safeSpot([box(0, 0, 1, 1)], 2, 5), [0.78, 0.84]);
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

import assert from "node:assert/strict";
import { test } from "node:test";
import { balloonTail, freeBalloonTip } from "../src/shared/annotation.ts";
import {
  aimBalloon,
  BALLOON_CHARS_PER_LINE,
  balancedWrap,
  loneLastWord,
  targetDrift,
  targetOnFrame,
} from "../src/shared/balloonAim.ts";
import type { Clip, Project, Track } from "../src/shared/types.ts";

const letters = (s: string): number => s.length;
const wrap20 = (text: string): string[] => balancedWrap(text, letters, BALLOON_CHARS_PER_LINE);

test("a quebra equilibrada: duas linhas parecidas, nunca uma palavra sozinha no fim", () => {
  // The balloon of Jardim Aula01: greedy wrapping left "parte" alone on the second line.
  const lines = wrap20("Clique para ir para a próxima parte");
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length <= BALLOON_CHARS_PER_LINE));
  assert.ok(Math.abs(lines[0]!.length - lines[1]!.length) <= 6, lines.join(" / "));
  assert.ok(!loneLastWord("Clique para ir para a próxima parte", lines));
  // Up to about 40 letters: two balanced lines.
  for (const text of [
    "Clique para voltar ao tamanho da aula",
    "Arraste o bloco para dentro do laço",
    "Aperte o botão verde para começar",
  ]) {
    const two = wrap20(text);
    assert.equal(two.length, 2, two.join(" / "));
    assert.ok(!loneLastWord(text, two), two.join(" / "));
  }
  // Short: one line.
  assert.deepEqual(wrap20("Olha aqui!"), ["Olha aqui!"]);
  // A line break typed by hand stays where it is.
  assert.deepEqual(wrap20("Clique para voltar\nao tamanho da aula"), [
    "Clique para voltar",
    "ao tamanho da aula",
  ]);
});

test("a quebra por largura de desenho também equilibra", () => {
  // Pixels of a wide font: 24 per letter, the balloon 450 px wide.
  const px = (s: string): number => s.length * 24;
  const lines = balancedWrap("Clique para ir para a próxima parte", px, 450);
  assert.ok(lines.every((l) => px(l) <= 450));
  assert.ok(!loneLastWord("Clique para ir para a próxima parte", lines), lines.join(" / "));
});

test("palavra sozinha na última linha: o que a verificação aponta", () => {
  const text = "Clique para ir para a próxima parte";
  assert.ok(loneLastWord(text, ["Clique para ir para a próxima", "parte"]));
  assert.ok(!loneLastWord(text, ["Clique para ir para", "a próxima parte"]));
  // Typed on purpose (one word per part) is not counted.
  assert.ok(!loneLastWord("Olá\nmundo", ["Olá", "mundo"]));
  // Several parts: each one is looked at.
  assert.ok(
    loneLastWord("Veja\nClique para ir para a próxima parte", [
      "Veja",
      "Clique para ir para a próxima",
      "parte",
    ]),
  );
});

const frame = { width: 1920, height: 1080 };
const aim = (
  body: { x: number; y: number; w: number; h: number },
  target: { x: number; y: number },
  place = false,
) => aimBalloon(body, { w: body.w, h: body.h }, target, frame, { place, gap: 70, margin: 24 });

/** The tip the balloon draws, in frame pixels, from where aimBalloon put it. */
function drawnTip(r: ReturnType<typeof aimBalloon>): { x: number; y: number } {
  const free = freeBalloonTip(r.tailPoint, r.tail);
  const { x, y, w, h } = r.body;
  const t = balloonTail(x, y, w, h, 20, 40, free.tail, {
    x: x + free.point.x * w,
    y: y + free.point.y * h,
  });
  return t.tip;
}

test("a ponta acerta o alvo, saindo do lado virado para ele", () => {
  // The item below the balloon: the tail leaves the bottom and ends on the item.
  const below = aim({ x: 700, y: 300, w: 400, h: 130 }, { x: 1000, y: 600 });
  assert.equal(below.tail, "bottom");
  const tip = drawnTip(below);
  assert.ok(Math.hypot(tip.x - 1000, tip.y - 600) <= frame.width * 0.01);
  // Above it: from the top.
  const above = aim({ x: 700, y: 500, w: 400, h: 130 }, { x: 760, y: 200 });
  assert.equal(above.tail, "top");
  assert.ok(Math.hypot(drawnTip(above).x - 760, drawnTip(above).y - 200) <= frame.width * 0.01);
  // Nothing moved: the body stays where it was.
  assert.deepEqual(below.move, { dx: 0, dy: 0 });
});

test("sem lugar dado, o balão vai logo acima do item; perto da borda ele desliza para dentro", () => {
  const placed = aim({ x: 760, y: 475, w: 400, h: 130 }, { x: 1700, y: 800 }, true);
  assert.equal(placed.tail, "bottom");
  // Inside the frame, with its margin.
  assert.ok(placed.body.x + placed.body.w <= frame.width - 24 + 1e-6);
  assert.ok(placed.body.y + placed.body.h <= 800 - 70 + 1e-6);
  const tip = drawnTip(placed);
  assert.ok(Math.hypot(tip.x - 1700, tip.y - 800) <= frame.width * 0.01);
  // An item at the top of the frame: the balloon goes below it, the tail leaves the top.
  const high = aim({ x: 760, y: 475, w: 400, h: 130 }, { x: 1830, y: 60 }, true);
  assert.equal(high.tail, "top");
  assert.ok(high.body.y >= 60 + 70 - 1e-6);
  const hTip = drawnTip(high);
  assert.ok(Math.hypot(hTip.x - 1830, hTip.y - 60) <= frame.width * 0.01);
});

test("um alvo em cima do balão o tira de cima do item", () => {
  const r = aim({ x: 700, y: 400, w: 400, h: 130 }, { x: 900, y: 460 });
  assert.ok(r.tail === "top" || r.tail === "bottom");
  assert.ok(460 < r.body.y || 460 > r.body.y + r.body.h);
});

const track = (id: string): Track =>
  ({ id, kind: "video", name: id, muted: false, hidden: false, locked: false }) as Track;

/** A balloon track over a zoom layer over the screen, as in Jardim Aula01 (zoom 1.6×). */
function zoomed(): Pick<Project, "clips" | "tracks" | "settings"> {
  return {
    settings: { width: 1920, height: 1080, fps: 30 } as Project["settings"],
    tracks: [track("marcacoes"), track("zoom"), track("tela")],
    clips: [
      {
        id: "z",
        assetId: "zoom",
        trackId: "zoom",
        start: 78.31,
        in: 0,
        duration: 3.41,
        volume: 1,
        zoomLayer: {
          scale: 1.6,
          x: 0.6875,
          y: 0.3125,
          zoomIn: true,
          zoomOut: true,
          easeIn: 0.6,
          easeOut: 0.6,
        },
      } as Clip,
    ],
  };
}

test("com zoom por baixo, o alvo vai para onde o item aparece ampliado", () => {
  const p = zoomed();
  // The zoom's center lands in the middle of the frame.
  const mid = targetOnFrame(p, "marcacoes", { x: 0.6875, y: 0.3125 }, 80);
  assert.ok(Math.abs(mid.x - 960) < 1e-6 && Math.abs(mid.y - 540) < 1e-6);
  // A point beside it moves 1.6× as far from the center.
  const off = targetOnFrame(p, "marcacoes", { x: 0.6875 + 0.05, y: 0.3125 }, 80);
  assert.ok(Math.abs(off.x - (960 + 0.05 * 1920 * 1.6)) < 1e-6);
  // A balloon below the zoom track is zoomed with the screen: nothing to convert.
  const under = targetOnFrame(p, "tela", { x: 0.2, y: 0.2 }, 80);
  assert.ok(Math.abs(under.x - 384) < 1e-6);
  // Without a zoom at that time: as given.
  const before = targetOnFrame(p, "marcacoes", { x: 0.2, y: 0.2 }, 70);
  assert.ok(Math.abs(before.x - 384) < 1e-6);
  // While the zoom holds, the item stays put; across its entrance it moves.
  assert.ok(targetDrift(p, "marcacoes", { x: 0.9, y: 0.6 }, 79.2, 81.12) < 1);
  assert.ok(targetDrift(p, "marcacoes", { x: 0.9, y: 0.6 }, 77.5, 79.5) > 50);
});

test("pontas centrais e ao longo do lado", () => {
  const center = balloonTail(0, 0, 400, 100, 20, 40, "bottom");
  assert.equal(center.base.x, 200);
  const offset = balloonTail(0, 0, 400, 100, 20, 40, "top", undefined, 0.8);
  assert.ok(Math.abs(offset.base.x - 320) < 1e-6);
  assert.ok(offset.tip.y < 0);
  // A tip below the body stays at the bottom even far to the side (aimed balloons say so).
  assert.equal(freeBalloonTip({ x: 1.6, y: 1.3 }, "bottom").tail, "bottom");
  assert.equal(freeBalloonTip({ x: 1.6, y: 1.3 }).tail, "right");
});

test("verificação antes de exportar: ponta longe do clique e palavra sozinha", async () => {
  const { preflight } = await import("../src/shared/preflight.ts");
  const balloon = {
    id: "b",
    assetId: "png",
    trackId: "marcacoes",
    start: 10,
    in: 0,
    duration: 2,
    volume: 1,
    // The picture shown at half its size (natural), centered.
    transform: { x: 0.5, y: 0.5, scale: 0.5 / Math.min(1920 / 800, 1080 / 400), opacity: 1 },
    annotation: {
      kind: "balloon",
      color: "#121A30",
      text: "Clique para ir para a próxima parte",
      textLines: ["Clique para ir para a próxima", "parte"],
      tail: "bottom",
      balloonGeometry: { x: 100, y: 60, w: 600, h: 240, tipX: 400, tipY: 360 },
      fill: "#E8A00E",
      textColor: "#0F1A33",
    },
  } as unknown as Clip;
  const project = {
    version: 1,
    id: "p",
    name: "Aula",
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [track("marcacoes"), track("tela")],
    assets: [
      {
        id: "png",
        name: "Balão",
        kind: "image",
        duration: 0,
        width: 800,
        height: 400,
        generated: "annotation",
      },
    ],
    clips: [balloon],
  } as unknown as Project;
  // The tip on the frame: (400 − 400)·0.5 + 960 = 960, (360 − 200)·0.5 + 540 = 620.
  const at = (x: number, y: number) => [{ t: 11, x: x / 1920, y: y / 1080 }];
  const missed = preflight(project, { clicks: at(1040, 620) });
  const tip = missed.find((f) => f.kind === "balloon-tip");
  assert.ok(tip, "a ponta a 80 px do clique é apontada");
  assert.match(tip.message, /80 px do item clicado/);
  assert.equal(tip.fix?.action, "balloon-aim");
  // On the item: nothing to say. Far from any click: not meant for it.
  assert.ok(!preflight(project, { clicks: at(970, 625) }).some((f) => f.kind === "balloon-tip"));
  assert.ok(!preflight(project, { clicks: at(200, 100) }).some((f) => f.kind === "balloon-tip"));
  // A click outside the balloon's time does not count.
  assert.ok(
    !preflight(project, { clicks: [{ t: 30, x: 1040 / 1920, y: 620 / 1080 }] }).some(
      (f) => f.kind === "balloon-tip",
    ),
  );
  const lone = missed.find((f) => f.kind === "balloon-lone-word");
  assert.ok(lone);
  assert.match(lone.message, /palavra sozinha na última linha/);
  // Lines as the picture now shows them.
  const fine = preflight(project, {
    balloonLines: new Map([["b", ["Clique para ir para", "a próxima parte"]]]),
  });
  assert.ok(!fine.some((f) => f.kind === "balloon-lone-word"));
});

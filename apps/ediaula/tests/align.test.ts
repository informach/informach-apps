import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignShifts,
  type Box,
  currentGap,
  distributeShifts,
  moveClipBy,
  unionBox,
} from "../src/shared/align.ts";
import type { Clip } from "../src/shared/types.ts";

const moved = (boxes: Box[], shifts: { dx: number; dy: number }[]): Box[] =>
  boxes.map((b, i) => ({ ...b, x: b.x + shifts[i].dx, y: b.y + shifts[i].dy }));

// Three strips of a lesson opening: "Aula 1 · Parte 1", the title and a subtitle.
const strips: Box[] = [
  { x: 300, y: 200, w: 400, h: 60 },
  { x: 120, y: 300, w: 900, h: 120 },
  { x: 500, y: 460, w: 600, h: 80 },
];

test("alinhar entre eles: pela caixa em volta, só no eixo pedido", () => {
  const all = unionBox(strips);
  assert.deepEqual(all, { x: 120, y: 200, w: 980, h: 340 });
  const left = moved(strips, alignShifts(strips, "left", all));
  assert.deepEqual(
    left.map((b) => b.x),
    [120, 120, 120],
  );
  assert.deepEqual(
    left.map((b) => b.y),
    [200, 300, 460],
    "the other axis stays",
  );
  const right = moved(strips, alignShifts(strips, "right", all));
  assert.deepEqual(
    right.map((b) => b.x + b.w),
    [1100, 1100, 1100],
  );
  const center = moved(strips, alignShifts(strips, "center", all));
  assert.deepEqual(
    center.map((b) => b.x + b.w / 2),
    [610, 610, 610],
  );
  const middle = moved(strips, alignShifts(strips, "middle", all));
  assert.deepEqual(
    middle.map((b) => b.y + b.h / 2),
    [370, 370, 370],
  );
});

test("alinhar ao vídeo: nas bordas e no centro do quadro", () => {
  const frame = { x: 0, y: 0, w: 1920, h: 1080 };
  const centered = moved(strips, alignShifts(strips, "center", frame));
  assert.deepEqual(
    centered.map((b) => b.x + b.w / 2),
    [960, 960, 960],
  );
  const bottom = moved(strips, alignShifts(strips, "bottom", frame));
  assert.deepEqual(
    bottom.map((b) => b.y + b.h),
    [1080, 1080, 1080],
  );
});

test("espaço igual: o primeiro e o último ficam, o espaço entre vizinhos é o mesmo", () => {
  // Given out of order: the order on screen counts, not the order of the selection.
  const boxes = [strips[2], strips[0], strips[1]];
  const result = moved(boxes, distributeShifts(boxes, "vertical"));
  const [sub, kicker, title] = result;
  assert.equal(kicker.y, 200);
  assert.equal(sub.y + sub.h, 540);
  assert.equal(title.y - (kicker.y + kicker.h), sub.y - (title.y + title.h));
  assert.equal(currentGap(result, "vertical"), 40);
  // Two clips have nothing to share.
  assert.deepEqual(distributeShifts(strips.slice(0, 2), "vertical"), [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]);
});

test("espaço fixo: o primeiro fica e cada próximo começa N px depois do anterior", () => {
  const result = moved(strips, distributeShifts(strips, "vertical", 24));
  assert.deepEqual(
    result.map((b) => b.y),
    [200, 284, 428],
  );
  assert.equal(currentGap(result, "vertical"), 24);
  const two = moved(strips.slice(0, 2), distributeShifts(strips.slice(0, 2), "horizontal", 10));
  // The title starts further left, so it comes first and the kicker goes after it.
  assert.equal(two[1].x, 120);
  assert.equal(two[0].x, 120 + 900 + 10);
  assert.deepEqual(
    result.map((b) => b.x),
    strips.map((b) => b.x),
    "only the axis asked moves",
  );
});

test("mover um clipe leva o centro e todo o trajeto dos keyframes", () => {
  const frame = { width: 1920, height: 1080 };
  const still: Clip = {
    id: "t",
    assetId: "a",
    trackId: "v",
    start: 0,
    in: 0,
    duration: 5,
    volume: 1,
  };
  const a = moveClipBy(still, { dx: 192, dy: -108 }, frame);
  assert.deepEqual(
    { x: a.transform?.x, y: a.transform?.y, scale: a.transform?.scale },
    { x: 0.6, y: 0.4, scale: 1 },
  );
  const travel = moveClipBy(
    {
      ...still,
      transform: { x: 0.2, y: 0.5, scale: 0.5, opacity: 1 },
      keyframes: [
        { t: 0, x: 0.2, y: 0.5, scale: 0.5 },
        { t: 2, x: 0.4, y: 0.5, scale: 0.5 },
      ],
    },
    { dx: 96, dy: 0 },
    frame,
  );
  assert.deepEqual(
    travel.keyframes?.map((k) => Math.round(k.x * 1000) / 1000),
    [0.25, 0.45],
  );
  assert.equal(moveClipBy(still, { dx: 0, dy: 0 }, frame), still);
});

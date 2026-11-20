import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentColumn,
  fittedVideo,
  LECTURE_FRAME,
  LECTURE_GUIDES,
  lightGradient,
  PRESENTER_PLACEMENTS,
  parsePlacements,
  personBox,
  placementBox,
  placementOf,
  planShots,
  shotsReport,
} from "./presenterFraming";

const board = LECTURE_FRAME;
/** The approved lesson's video: Helena standing, recorded in portrait. */
const portrait = { width: 1080, height: 1920 };
const landscape = { width: 3840, height: 2160 };
const round = (v: number) => Math.round(v * 10) / 10;

test("only medium shots and medium close-ups, on one side, as in the approved lesson", () => {
  assert.deepEqual(
    PRESENTER_PLACEMENTS.map((p) => [p.id, p.label, p.side, p.scale]),
    [
      ["medium-right", "Médio à direita", "right", 1.8],
      ["medium-left", "Médio à esquerda", "left", 1.8],
      ["close-right", "Médio curto à direita", "right", 2.3],
      ["close-left", "Médio curto à esquerda", "left", 2.3],
    ],
  );
  assert.deepEqual(fittedVideo(landscape, board), board);
  assert.deepEqual(fittedVideo(portrait, board), { width: 607.5, height: 1080 });
  assert.throws(() => fittedVideo({ width: 0, height: 1 }, board), /inválido/);
});

test("her spot lands where the approved lesson keyed it: the top of the video on the top", () => {
  // The lesson's keys (its spot was 608 wide): x 932.8 / -107.2 at 1.8, 801 / -279.2 at 2.3.
  const lesson: Record<string, number> = {
    "medium-right": 932.8,
    "medium-left": -107.2,
    "close-right": 801,
    "close-left": -279.2,
  };
  for (const p of PRESENTER_PLACEMENTS) {
    const box = placementBox(p, portrait, board);
    assert.ok(Math.abs(box.x - (lesson[p.id] ?? 0)) < 1, `${p.id}: ${box.x}`);
    assert.equal(round(box.y), 0, p.id);
    assert.equal(round(box.height), round(1080 * p.scale));
  }
  // The light behind her follows each cut, as in the lesson.
  assert.deepEqual(
    PRESENTER_PLACEMENTS.map((p) => [p.light.x, p.light.y, p.light.scale]),
    [
      [1486, 560, 1.2],
      [446, 560, 1.2],
      [1506, 520, 1.5],
      [426, 520, 1.5],
    ],
  );
  assert.deepEqual(
    lightGradient("#ffc23c").fill.stops.map((s) => s.opacity),
    [0.42, 0.16, 0],
  );
});

test("the content goes centred in the column away from her, between the guides", () => {
  assert.deepEqual(LECTURE_GUIDES, { left: 84, center: 960, right: 1836, top: 92, bottom: 1008 });
  assert.deepEqual(contentColumn("right"), {
    left: 84,
    right: 960,
    top: 92,
    bottom: 1008,
    centerX: 522,
    centerY: 550,
  });
  assert.equal(contentColumn("left").centerX, 1398);
  // Standing in the middle of her video, she stays out of the column in every shot.
  const person = { left: 0.25, top: 0.05, right: 0.75, bottom: 1 };
  for (const p of PRESENTER_PLACEMENTS) {
    const box = personBox(p, portrait, board, person);
    assert.ok(box);
    const column = contentColumn(p.side);
    if (p.side === "right") assert.ok(box.x >= column.right, `${p.id} ${box.x}`);
    else assert.ok(box.x + box.width <= column.left, `${p.id} ${box.x + box.width}`);
  }
});

test("shots cut halfway through the pause, and a short one goes on in the shot before", () => {
  const fps = 30;
  const lines = [
    { from: 12, to: 150 },
    { from: 160, to: 300 },
    { from: 310, to: 350 }, // 1.3 s: too short a shot alone
    { from: 360, to: 600 },
    { from: 610, to: 900 },
  ];
  const shots = planShots(
    lines,
    ["close-right", "medium-left", "medium-right", "medium-left", "medium-right"],
    fps,
    930,
  );
  assert.deepEqual(shots, [
    { from: 0, to: 155, placement: "close-right", lines: [0] },
    { from: 155, to: 605, placement: "medium-left", lines: [1, 2, 3] },
    { from: 605, to: 930, placement: "medium-right", lines: [4] },
  ]);
  // The first shot too short: it takes the next one's placement.
  assert.deepEqual(
    planShots(
      [
        { from: 0, to: 30 },
        { from: 40, to: 400 },
      ],
      ["close-right", "medium-left"],
      fps,
      420,
    ),
    [{ from: 0, to: 420, placement: "medium-left", lines: [0, 1] }],
  );
  assert.throws(() => planShots(lines, ["medium-left"], fps, 930), /uma posição por frase/);
});

test("the assistant's placements are read by id or by name, one per sentence", () => {
  assert.deepEqual(
    parsePlacements(
      '```json\n{"posicoes": ["medium-right", "Médio à esquerda", " medio curto a direita ", "close-left"]}\n```',
      4,
    ),
    ["medium-right", "medium-left", "close-right", "close-left"],
  );
  assert.throws(() => parsePlacements("Não sei.", 2), /não devolveu/);
  assert.throws(
    () => parsePlacements('{"posicoes": ["medium-right"]}', 2),
    /1 posições .* para 2 frases/,
  );
  // The shots the person ruled out are refused.
  assert.throws(
    () => parsePlacements('{"posicoes": ["medium-right", "full"]}', 2),
    /frase 2: full/,
  );
});

test("the report says each shot as set on the presenter's clip in EdiAula, on her video's clock", () => {
  assert.deepEqual(
    shotsReport(
      [
        { from: 0, to: 155, placement: "close-right", lines: [0] },
        { from: 155, to: 930, placement: "medium-left", lines: [1] },
      ],
      30,
      62.5,
    ),
    [
      "1:02.5–1:07.7 do vídeo: Médio curto à direita (x 0.781, y 1.15, escala 2.3)",
      "1:07.7–1:33.5 do vídeo: Médio à esquerda (x 0.229, y 0.9, escala 1.8)",
    ],
  );
  assert.equal(placementOf("medium-right").x, 1480 / 1920);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIAULA_PALETTE, SISTEMA_ZERO_PALETTE } from "../src/shared/palettes.ts";
import {
  FRAME_1080,
  frameUnits,
  placeLayers,
  stackY,
  TEMPLATES,
  type TemplateLayer,
  templateById,
  templateDefaults,
  templateLayers,
} from "../src/shared/templates.ts";

test("stacked layers are centered as a block and never overlap", () => {
  const ys = stackY([0.1, 0.2, 0.1], 0.5, 0.02);
  assert.deepEqual(
    ys.map((y) => Math.round(y * 1000) / 1000),
    [0.33, 0.5, 0.67],
  );
  assert.deepEqual(stackY([0.3], 0.4), [0.4]);
});

test("every template builds layers that start inside it and come in one after the other", () => {
  for (const t of TEMPLATES) {
    const layers = templateLayers(
      t,
      templateDefaults(t, { course: "A Chave do Farol", title: "O farol que pisca", section: "2" }),
    );
    assert.ok(layers.length >= 2, t.id);
    for (const l of layers)
      assert.ok(l.at >= 0 && l.at < t.duration - 0.5, `${t.id}: layer at ${l.at}`);
    const ats = layers.map((l) => l.at);
    assert.deepEqual(
      [...ats].sort((a, b) => a - b),
      ats,
      `${t.id}: layers in order`,
    );
    // A layer beside another one names an earlier layer.
    layers.forEach((l, i) => {
      if (l.beside) assert.ok(l.beside.layer < i, `${t.id}: beside an earlier layer`);
    });
  }
});

test("defaults come from the course and the script; list fields make one layer per line", () => {
  const opening = templateById("opening")!;
  const v = templateDefaults(opening, {
    course: "A Chave do Farol",
    title: "O farol que pisca",
    section: "2",
  });
  assert.deepEqual(v, {
    kicker: "A Chave do Farol",
    title: "O farol que pisca",
    subtitle: "Seção 2",
  });
  const texts = templateLayers(opening, v).map((l) => l.spec.text);
  assert.deepEqual(texts, [undefined, "A CHAVE DO FAROL", "O farol que pisca", "Seção 2"]);
  const q = templateById("question")!;
  const opts = templateLayers(q, {
    question: "Qual bloco?",
    options: "Repetir\n\n Esperar \nAcender",
  }).filter((l) => l.spec.kind === "item");
  assert.deepEqual(
    opts.map((l) => [l.spec.badge, l.spec.text]),
    [
      ["A", "Repetir"],
      ["B", "Esperar"],
      ["C", "Acender"],
    ],
  );
  // Empty optional lines are left out instead of drawing empty boxes.
  assert.equal(
    templateLayers(templateById("closing")!, { title: "Tchau", subtitle: "", call: "" }).length,
    2,
  );
  // An empty list shows the kit's example lines, so the thumbnail shows the layout.
  assert.equal(
    templateLayers(templateById("objective")!, { title: "Hoje" }).filter(
      (l) => l.spec.kind === "item",
    ).length,
    3,
  );
});

test("your-turn steps split their detail after the colon; the time goes beside the title", () => {
  const layers = templateLayers(templateById("challenge")!, {
    title: "Agora é com você!",
    time: "5 minutos",
    steps: "Abra o projeto Farol: No Estúdio, em Meus jogos.\nTeste o jogo",
  });
  const steps = layers.filter((l) => l.spec.kind === "item");
  assert.deepEqual(
    steps.map((l) => [l.spec.badge, l.spec.text, l.spec.subtitle]),
    [
      ["1", "Abra o projeto Farol", "No Estúdio, em Meus jogos."],
      ["2", "Teste o jogo", undefined],
    ],
  );
  const time = layers.find((l) => l.spec.kind === "label")!;
  assert.equal(time.spec.icon, "flame");
  assert.equal(layers[time.beside!.layer].spec.text, "Agora é com você!");
});

test("templates take the colors of the palette roles and the slide colors", () => {
  const layers = templateLayers(
    templateById("question")!,
    { question: "Qual?", options: "A\nB" },
    SISTEMA_ZERO_PALETTE,
  );
  // Pause and think: a pale yellow page, a dark tag, options in the accent yellow.
  assert.equal(layers[0].spec.color, "#FFEDC4");
  assert.equal(layers[1].spec.color, "#121A30");
  assert.deepEqual(
    layers.filter((l) => l.spec.kind === "item").map((l) => l.spec.color),
    ["#FFC02E", "#FFC02E"],
  );
  assert.ok(layers.filter((l) => l.spec.kind !== "panel").every((l) => l.spec.ink === "#0F1A33"));
  // The kit's light page and its softer text.
  const recap = templateLayers(
    templateById("objective")!,
    { title: "Hoje", items: "Uma", note: "Fim" },
    SISTEMA_ZERO_PALETTE,
  );
  assert.equal(recap[0].spec.color, "#E9EEF6");
  assert.equal(recap.at(-1)!.spec.color, "#46536E");
  // The reaction box keeps the accent text only where it can be read.
  const reaction = (p = SISTEMA_ZERO_PALETTE) =>
    templateLayers(templateById("concept")!, { second: "Reação" }, p).find(
      (l) => l.spec.text === "Reação",
    )!.spec;
  assert.equal(reaction().textColor, "#FFC02E");
  assert.equal(reaction(EDIAULA_PALETTE).textColor, "#FFFFFF");
});

test("templates use the theme fonts by role; an item's line below takes the text font", () => {
  const layers = templateLayers(
    templateById("challenge")!,
    { title: "Sua vez", steps: "Abra: o projeto" },
    SISTEMA_ZERO_PALETTE,
    SISTEMA_ZERO_PALETTE.fonts,
  );
  const item = layers.find((l) => l.spec.kind === "item")!.spec;
  assert.equal(item.fontFamily, "Baloo 2");
  assert.equal(item.bodyFont, "Nunito");
  const note = templateLayers(
    templateById("objective")!,
    { note: "No fim, um jogo." },
    SISTEMA_ZERO_PALETTE,
    SISTEMA_ZERO_PALETTE.fonts,
  ).at(-1)!.spec;
  // A line of running text drawn as a title takes the body font.
  assert.equal(note.kind, "title");
  assert.equal(note.fontFamily, "Nunito");
});

test("layers are placed by the edges of what they draw, flowing down with their gaps", () => {
  const layers: TemplateLayer[] = [
    {
      spec: { kind: "panel", color: "#000000" },
      at: 0,
      enter: "fade",
      exit: "fade",
      x: 0.5,
      y: 0.5,
    },
    {
      spec: { kind: "title", color: "#000000" },
      at: 0,
      enter: "fade",
      exit: "fade",
      left: 96,
      top: 66,
    },
    { spec: { kind: "item", color: "#000000" }, at: 0, enter: "fade", exit: "fade", left: 96 },
    {
      spec: { kind: "item", color: "#000000" },
      at: 0,
      enter: "fade",
      exit: "fade",
      left: 96,
      gap: 30,
    },
    {
      spec: { kind: "label", color: "#000000" },
      at: 0,
      enter: "fade",
      exit: "fade",
      beside: { layer: 1, gap: 60 },
    },
  ];
  const sizes = [
    { w: 1920, h: 1080, margin: 0 },
    { w: 600, h: 200, margin: 48 },
    { w: 1188, h: 222, margin: 24 },
    { w: 1188, h: 222, margin: 24 },
    { w: 300, h: 110, margin: 24 },
  ];
  const at = placeLayers({ flowTop: 255 }, layers, sizes, FRAME_1080);
  const px = at.map((p) => ({ x: Math.round(p.x * 1920), y: Math.round(p.y * 1080) }));
  assert.deepEqual(px[0], { x: 960, y: 540 });
  // The title's letters start at the margin and its top at 66.
  assert.equal(px[1].x - (600 - 96) / 2, 96);
  assert.equal(px[1].y - (200 - 96) / 2, 66);
  // The cards: the first one's top at 255, the second 30 below the first one's bottom.
  assert.equal(px[2].y - 87, 255);
  assert.equal(px[3].y - 87, 255 + 174 + 30);
  assert.equal(px[2].x - 570, 96);
  // The tag starts 60 to the right of the title's letters, on the same middle line.
  assert.equal(px[4].x - 126, 96 + 504 + 60);
  assert.equal(px[4].y, px[1].y);
});

test("a vertical frame narrows the content to fit between the margins", () => {
  const frame = frameUnits({ width: 1080, height: 1920 });
  assert.equal(Math.round(frame.w), 608);
  const layers = templateLayers(
    templateById("objective")!,
    { items: "Uma meta" },
    EDIAULA_PALETTE,
    undefined,
    frame,
  );
  const item = layers.find((l) => l.spec.kind === "item")!;
  assert.ok((item.spec.width ?? 0) <= frame.w - 96 * 2);
});

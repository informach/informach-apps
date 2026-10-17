import assert from "node:assert/strict";
import { test } from "node:test";
import { SISTEMA_ZERO_PALETTE } from "../src/shared/palettes.ts";
import {
  stackY,
  TEMPLATES,
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
  }).filter((l) => l.spec.kind === "note");
  assert.deepEqual(
    opts.map((l) => l.spec.text),
    ["A)  Repetir", "B)  Esperar", "C)  Acender"],
  );
  // Empty optional lines are left out instead of drawing empty boxes.
  assert.equal(
    templateLayers(templateById("closing")!, { title: "Tchau", subtitle: "", call: "" }).length,
    2,
  );
});

test("templates take the colors of the palette roles", () => {
  const layers = templateLayers(
    templateById("question")!,
    { question: "Qual?", options: "A\nB" },
    SISTEMA_ZERO_PALETTE.roles,
  );
  assert.equal(layers[0].spec.color, "#121A30");
  assert.deepEqual(
    layers.filter((l) => l.spec.kind === "note").map((l) => l.spec.color),
    ["#FFC02E", "#E8A317"],
  );
  assert.ok(layers.filter((l) => l.spec.kind !== "panel").every((l) => l.spec.ink === "#0F1A33"));
});

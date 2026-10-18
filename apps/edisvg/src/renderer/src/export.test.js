import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { offlineBundle } from "../../../tests/offlineBundle";
import { newProject, PROJECT_VERSION } from "../../shared/project.js";
import { buildExport } from "./export.js";

let runtimeSource;
before(async () => {
  runtimeSource = await offlineBundle();
});

test("exports retain the selected preset/mode and declare the SVG sampling profile", () => {
  for (const animation of ["Parado", "Acenar", "Pular"])
    for (const mode of ["loop", "ping-pong", "once"]) {
      const state = {
        ...newProject(),
        animation,
        modes: { Parado: mode, Acenar: mode, Pular: mode },
      };
      const options = { alt: '<unsafe>"', reduced: true, offscreen: true };
      const svg = buildExport(state, { ...options, format: "svg" }).content;
      assert.match(svg, /amostrado a 60 Hz/);
      assert.ok(
        svg.includes(
          mode === "once"
            ? "linear 1 normal both"
            : mode === "loop"
              ? "linear infinite normal both"
              : "linear infinite alternate both",
        ),
      );
      assert.match(svg, /&lt;unsafe&gt;/);
      const html = buildExport(state, { ...options, format: "html" }, "", runtimeSource).content;
      assert.ok(html.includes(`"name":"${animation}"`));
      assert.ok(html.includes(`"mode":"${mode}"`));
      assert.ok(html.includes('"interactive":false'));
      assert.doesNotMatch(html, /set\('Parado'\)/);
    }
});

test("exports standalone HTML, SVG and complete project data", async () => {
  const svg = await readFile(new URL("../public/assets/zeze.svg", import.meta.url), "utf8");
  const state = {
    name: "Zezé",
    animation: "Acenar",
    transforms: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    keys: [0, 72],
    humor: 0.6,
    waving: false,
  };
  for (const format of ["html", "svg", "json"]) {
    const { content: text } = buildExport(
      state,
      {
        format,
        alt: 'Zezé <teste> "seguro"',
        reduced: true,
        offscreen: true,
      },
      svg,
      runtimeSource,
    );
    if (format === "html") {
      assert.match(text, /IntersectionObserver/);
      assert.match(text, /prefers-reduced-motion/);
      assert.match(text, /&lt;teste&gt;/);
      assert.doesNotMatch(text, /<teste>/);
      assert.match(text, /<path/);
    }
    if (format === "svg") {
      assert.match(text, /^<svg/);
      assert.match(text, /class="motion Acenar"/);
    }
    if (format === "json") {
      const data = JSON.parse(text);
      assert.equal(data.version, PROJECT_VERSION);
      assert.deepEqual(data.keys, [0, 72]);
      assert.equal(data.svg, undefined);
      assert.deepEqual(data.artboards, []);
    }
  }
  state.scene = {
    viewBox: [0, 0, 200, 100],
    nodes: [
      {
        id: "node-test",
        tag: "rect",
        name: "Box",
        attrs: { width: "20", height: "30", fill: "red" },
        children: [],
      },
    ],
  };
  const imported = buildExport(
    state,
    {
      format: "svg",
      alt: "Box",
      reduced: true,
      offscreen: false,
    },
    "",
    runtimeSource,
  ).content;
  assert.match(imported, /viewBox="0 0 200 100"/);
  assert.match(imported, /<rect/);
  assert.doesNotMatch(imported, /<path/);
  state.scene.nodes = [];
  const empty = buildExport(
    state,
    {
      format: "html",
      alt: "Empty",
      reduced: true,
      offscreen: false,
    },
    "",
    runtimeSource,
  ).content;
  assert.doesNotMatch(empty, /<path|<rect/);
});

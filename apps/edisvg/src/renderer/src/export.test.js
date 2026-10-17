import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { exportProject } from "./export.js";

test("exports standalone HTML, SVG and complete project data", async () => {
  const original = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    timeout: globalThis.setTimeout,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  const svg = await readFile(new URL("../public/assets/zeze.svg", import.meta.url), "utf8");
  let blob, link;
  globalThis.fetch = async () => ({ ok: true, text: async () => svg });
  globalThis.document = {
    createElement: () =>
      (link = {
        click() {
          this.clicked = true;
        },
        remove() {},
      }),
    body: { append() {} },
  };
  globalThis.setTimeout = (callback) => callback();
  URL.createObjectURL = (value) => {
    blob = value;
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  const state = {
    name: "Zezé",
    animation: "Acenar",
    transforms: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    keys: [0, 72],
    humor: 0.6,
    waving: false,
  };
  try {
    for (const format of ["html", "svg", "json"]) {
      await exportProject(state, {
        format,
        alt: 'Zezé <teste> "seguro"',
        reduced: true,
        offscreen: true,
      });
      const text = await blob.text();
      assert.equal(link.clicked, true);
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
        assert.equal(data.version, 2);
        assert.deepEqual(data.keys, [0, 72]);
        assert.match(data.svg, /<path/);
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
    await exportProject(state, { format: "svg", alt: "Box", reduced: true, offscreen: false });
    const imported = await blob.text();
    assert.match(imported, /viewBox="0 0 200 100"/);
    assert.match(imported, /<rect/);
    assert.doesNotMatch(imported, /<path/);
    state.scene.nodes = [];
    await exportProject(state, { format: "html", alt: "Empty", reduced: true, offscreen: false });
    assert.doesNotMatch(await blob.text(), /<path|<rect/);
  } finally {
    globalThis.fetch = original.fetch;
    globalThis.document = original.document;
    globalThis.setTimeout = original.timeout;
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  }
});

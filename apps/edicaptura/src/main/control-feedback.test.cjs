const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("som e confirmação só ocorrem quando aumenta o número de fotos", async () => {
  const elements = new Map();
  let update,
    plays = 0,
    manualCut;
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "",
        textContent: "",
        hidden: false,
        classList: { remove() {}, add() {} },
        after() {},
      });
    return elements.get(id);
  };
  const api = {
    controlState: async () => ({
      mode: "scroll",
      count: 1,
      height: 200,
      width: 300,
      monitor: "Monitor 2",
    }),
    onControl: (fn) => (update = fn),
    onControlError() {},
    cancel() {},
    nextSegment: async (cut) => (manualCut = cut),
  };
  const source = fs
    .readFileSync(path.join(__dirname, "../recording/control.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  await vm.runInNewContext(`(async()=>{${source}})()`, {
    window: { edi: api, ediSuite: { onRecovery() {} } },
    document: {
      getElementById: element,
      createElement: () => ({}),
      querySelector: () => element("header"),
    },
    hydrateIcons() {},
    setupRecording() {},
    setInterval() {},
    Audio: class {
      play() {
        plays++;
        return Promise.resolve();
      }
    },
  });
  assert.equal(plays, 1);
  update({ mode: "scroll", count: 1, height: 200 });
  assert.equal(plays, 1);
  update({ mode: "scroll", count: 2, height: 200, feedback: "Foto capturada. Pode rolar." });
  assert.equal(plays, 2);
  assert.match(element("capture-feedback").textContent, /Pode rolar/);
  update({ mode: "scroll", count: 2, height: 200 });
  assert.equal(plays, 2);
  element("overlap").value = "25";
  await element("next").onclick();
  assert.equal(manualCut, 25);
});

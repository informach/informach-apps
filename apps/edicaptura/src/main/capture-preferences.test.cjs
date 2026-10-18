const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CapturePreferences } = require("./capture-preferences.ts");
test("persisted presets register only owned shortcuts, rollback conflicts and survive reload", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-preset-test-"));
  const registered = new Map([["Control+Alt+X", () => {}]]);
  const shortcuts = {
    register(key, callback) {
      if (registered.has(key)) return false;
      registered.set(key, callback);
      return true;
    },
    unregister(key) {
      registered.delete(key);
    },
  };
  const intents = [];
  const store = new CapturePreferences(path.join(root, "profile.json"), shortcuts, (id) =>
    intents.push(id),
  );
  try {
    await store.load();
    const options = store.read().defaults;
    const preset = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Own",
      mode: "all",
      options,
      shortcut: "Ctrl+Alt+K",
    };
    await store.update({ defaults: options, presets: [preset] });
    registered.get("Control+Alt+K")();
    assert.deepEqual(intents, [preset.id]);
    await assert.rejects(
      store.update({ defaults: options, presets: [{ ...preset, shortcut: "Ctrl+Alt+X" }] }),
      /atalho/i,
    );
    assert(registered.has("Control+Alt+K"));
    assert(registered.has("Control+Alt+X"));
    const before = await fs.readFile(path.join(root, "profile.json"), "utf8");
    await fs.rename(root, root + "-moved");
    try {
      await assert.rejects(
        store.update({ defaults: options, presets: [{ ...preset, shortcut: "Ctrl+Alt+J" }] }),
      );
    } finally {
      await fs.rename(root + "-moved", root);
    }
    assert(!registered.has("Control+Alt+J"));
    assert(registered.has("Control+Alt+K"));
    assert.equal(await fs.readFile(path.join(root, "profile.json"), "utf8"), before);
    store.dispose();
    assert(registered.has("Control+Alt+X"));
    const reload = new CapturePreferences(path.join(root, "profile.json"), shortcuts, () => {});
    await reload.load();
    assert.equal(reload.read().presets[0].name, "Own");
    reload.dispose();
  } finally {
    store.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("corrupt profiles are preserved and startup conflicts remain explicit without stealing shortcuts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-preset-invalid-"));
  const file = path.join(root, "profile.json"),
    shortcuts = new Map([["Control+Alt+K", () => {}]]);
  const adapter = {
    register: (key, fn) => {
      if (shortcuts.has(key)) return false;
      shortcuts.set(key, fn);
      return true;
    },
    unregister: (key) => shortcuts.delete(key),
  };
  const store = new CapturePreferences(file, adapter, () => {});
  try {
    await fs.writeFile(file, '{"version":99}');
    await assert.rejects(store.load());
    await assert.rejects(store.update({ defaults: store.read().defaults, presets: [] }));
    assert.equal(await fs.readFile(file, "utf8"), '{"version":99}');
    await fs.writeFile(
      file,
      JSON.stringify({
        version: 1,
        defaults: store.read().defaults,
        presets: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Conflict",
            mode: "window",
            options: store.read().defaults,
            shortcut: "Control+Alt+K",
          },
        ],
      }),
    );
    await store.load();
    assert.equal(store.activate().shortcutErrors.length, 1);
    store.dispose();
    assert(shortcuts.has("Control+Alt+K"));
  } finally {
    store.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("actual renderer capture save barrier rejects cancellation, workspace changes and failed saves", async () => {
  const vm = require("node:vm");
  const source = await fs.readFile(path.join(__dirname, "../editor/editor.js"), "utf8");
  const start = source.indexOf("async function preparePhoto()"),
    end = source.indexOf("const photoPresets", start);
  let resolve, reject;
  const context = vm.createContext({
    photoIntent: 0,
    workspaceGeneration: 0,
    workspaceTransition: false,
    Error,
    persist: () =>
      new Promise((a, b) => {
        resolve = a;
        reject = b;
      }),
  });
  vm.runInContext(source.slice(start, end), context);
  for (const event of ["cancel", "root", "transition", "failed"]) {
    context.workspaceTransition = false;
    const pending = vm.runInContext("preparePhoto()", context);
    if (event === "cancel") context.photoIntent++;
    if (event === "root") context.workspaceGeneration++;
    if (event === "transition") context.workspaceTransition = true;
    if (event === "failed") reject(new Error("disk"));
    else resolve();
    await assert.rejects(pending, /encerrada|disk/);
  }
});

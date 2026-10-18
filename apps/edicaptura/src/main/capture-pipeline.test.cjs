const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PhotoCapture } = require("./capture-pipeline.ts");
const { setImmediate: tick } = require("node:timers/promises");
const { topologyKey } = require("../domain/capture-geometry.ts");
function image(width, height, value = 20, pixels = Buffer.alloc(width * height * 4, value)) {
  return {
    getSize: () => ({ width, height }),
    isEmpty: () => false,
    toBitmap: () => Buffer.from(pixels),
    toDataURL: () => "data:image/png;base64,fixture",
    crop: (r) => {
      const bytes = Buffer.alloc(r.width * r.height * 4);
      for (let y = 0; y < r.height; y++)
        pixels.copy(
          bytes,
          y * r.width * 4,
          ((r.y + y) * width + r.x) * 4,
          ((r.y + y) * width + r.x + r.width) * 4,
        );
      return image(r.width, r.height, 0, bytes);
    },
  };
}
function setup(options = {}) {
  const states = [],
    saved = [],
    published = [];
  let displays = options.displays ?? [
      { id: 1, bounds: { x: -4, y: 0, width: 4, height: 2 }, scaleFactor: 1, rotation: 0 },
    ],
    access = true,
    calls = 0,
    stop;
  const deps = {
    sources: {
      getSources: async () => {
        calls++;
        return displays.map((d) => ({
          id: `screen:${d.id}:0`,
          display_id: String(d.id),
          thumbnail: image(
            d.bounds.width * d.scaleFactor,
            d.bounds.height * d.scaleFactor,
            calls * 20,
          ),
        }));
      },
    },
    screen: { getAllDisplays: () => displays, screenToDipRect: (_w, r) => r },
    images: { createFromBitmap: (bytes, size) => image(size.width, size.height, 0, bytes) },
    assertAccess: () => {
      if (!access) throw Error("license");
    },
    allowed: () => true,
    beginJob: (fn) => {
      stop = fn;
      return { finish() {} };
    },
    hide() {},
    show() {},
    select: options.select ?? (() => {}),
    state: (s) => states.push(s),
    save: async (i) => {
      saved.push(i);
      return "saved";
    },
    publish: async (id, current) => {
      if (current()) published.push(id);
    },
    ...options,
  };
  const flow = new PhotoCapture(deps);
  return {
    flow,
    deps,
    states,
    saved,
    published,
    get calls() {
      return calls;
    },
    revoke: () => {
      access = false;
      stop();
    },
    topology: () => {
      displays = [{ ...displays[0], rotation: 90 }];
    },
  };
}
test("real pipeline composites negative mixed-scale geometry into saved pixels", async () => {
  const f = setup({
    displays: [
      { id: 1, bounds: { x: -4, y: 0, width: 4, height: 2 }, scaleFactor: 1, rotation: 0 },
      { id: 2, bounds: { x: 0, y: 0, width: 2, height: 2 }, scaleFactor: 2, rotation: 0 },
    ],
  });
  await f.flow.start({ mode: "all" }, "1");
  assert.deepEqual(f.saved[0].getSize(), { width: 12, height: 4 });
  assert.equal(f.saved[0].toBitmap()[0], 20);
  assert.equal(f.published.length, 1);
});
test("fresh region obtains a second bitmap while frozen region preserves the initial pixels", async () => {
  for (const timing of ["fresh", "frozen"]) {
    const f = setup();
    await f.flow.start({ mode: "region", timing }, "1");
    await f.flow.selected({ x: -3, y: 0, width: 2, height: 2 });
    assert.equal(f.saved[0].toBitmap()[0], timing === "fresh" ? 40 : 20);
    assert.equal(f.calls, timing === "fresh" ? 2 : 1);
  }
});
test("selection bounds reject even tiny outside extents and invalid dimensions before persistence", async () => {
  for (const timing of ["fresh", "frozen"]) {
    const remembered = [];
    const f = setup({
      displays: [
        {
          id: 1,
          bounds: { x: -160, y: -80, width: 160, height: 80 },
          scaleFactor: 1.25,
          rotation: 0,
        },
        { id: 2, bounds: { x: 0, y: -80, width: 160, height: 80 }, scaleFactor: 1.25, rotation: 0 },
      ],
      remember: async (region) => remembered.push(region),
    });
    await f.flow.start({ mode: "region", timing }, "1");
    const valid = { x: -80, y: -72, width: 1.5999999999999999, height: 1.5999999999999999 };
    for (const rect of [
      { ...valid, x: -160 - 1e-8 },
      { ...valid, y: -80 - 1e-8 },
      { ...valid, x: -1, width: 1 + 1e-8 },
      { ...valid, y: -1, height: 1 + 1e-8 },
      { ...valid, x: 10 }, // Inside the topology, outside this selected monitor.
      { ...valid, x: 200 }, // Outside the entire topology.
      ...[0, -1, NaN, Infinity].flatMap((value) => [
        { ...valid, width: value },
        { ...valid, height: value },
      ]),
      { ...valid, x: NaN },
      { ...valid, y: Infinity },
    ]) {
      await assert.rejects(f.flow.selected(rect));
      assert.equal(remembered.length, 0);
      assert.equal(f.saved.length, 0);
      assert.equal(f.calls, 1);
    }
    await f.flow.selected(valid);
    assert.equal(remembered.length, 1);
    assert.deepEqual(remembered[0].rect, valid);
    assert.deepEqual(f.saved[0].getSize(), { width: 2, height: 2 });
    await assert.rejects(f.flow.selected(valid), /encerrada/);
    assert.equal(f.saved.length, 1);
  }
});
test("confirmed regions remember the actual composition scale and repeat without stale source tokens", async () => {
  const regions = [];
  const f = setup({ remember: async (region) => regions.push(region) });
  await f.flow.start({ mode: "region" }, "1");
  await f.flow.selected({ x: -3, y: 0, width: 2, height: 2 });
  assert.equal(regions[0].scale, 1);
  await f.flow.start({ mode: "region-all", savedRegion: regions[0] }, "1");
  assert.equal(f.calls, 3);
  assert.deepEqual(f.saved[1].getSize(), { width: 2, height: 2 });
  f.topology();
  await assert.rejects(
    f.flow.start({ mode: "region-all", savedRegion: regions[0] }, "1"),
    /topologia/i,
  );
  assert.equal(f.calls, 3);
});
test("repeated mixed-scale regions retain selected pixel scale even on the lower scale monitor", async () => {
  const displays = [
    { id: 1, bounds: { x: -4, y: 0, width: 4, height: 2 }, scaleFactor: 1, rotation: 0 },
    { id: 2, bounds: { x: 0, y: 0, width: 2, height: 2 }, scaleFactor: 2, rotation: 0 },
  ];
  const savedRegion = {
    rect: { x: -4, y: 0, width: 2, height: 2 },
    topology: topologyKey(displays.map((d) => ({ ...d, id: String(d.id) }))),
    scale: 2,
  };
  const f = setup({ displays });
  await f.flow.start({ mode: "region-all", savedRegion }, "1");
  assert.deepEqual(f.saved[0].getSize(), { width: 4, height: 4 });
});
test("cancel during region persistence prevents late capture and duplicate selection", async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const f = setup({ remember: () => pending });
  await f.flow.start({ mode: "region" }, "1");
  const selected = f.flow.selected({ x: -3, y: 0, width: 2, height: 2 });
  await assert.rejects(f.flow.selected({ x: -3, y: 0, width: 2, height: 2 }), /encerrada/);
  f.flow.interrupt();
  resolve();
  await assert.rejects(selected);
  assert.equal(f.calls, 1);
  assert.equal(f.saved.length, 0);
  assert.equal(f.published.length, 0);
});
test("countdown captures at or after deadline and cancellation never substitutes preview", async () => {
  const f = setup();
  await f.flow.start({ mode: "region", delay: 1 }, "1");
  const start = performance.now();
  await f.flow.selected({ x: -4, y: 0, width: 4, height: 2 });
  assert(performance.now() - start >= 990);
  assert.equal(f.calls, 2);
  const g = setup();
  const pending = g.flow.start({ mode: "monitor", delay: 1 }, "1");
  await tick();
  g.flow.interrupt();
  await assert.rejects(pending);
  assert.equal(g.calls, 0);
  assert.equal(g.saved.length, 0);
});
test("late sources and topology/license invalidation do not save or activate", async () => {
  for (const invalidate of [(f) => f.flow.interrupt(), (f) => f.revoke(), (f) => f.topology()]) {
    const f = setup();
    const original = f.deps.sources.getSources;
    let release;
    f.deps.sources.getSources = async () => {
      await new Promise((r) => {
        release = r;
      });
      return original();
    };
    const pending = f.flow.start({ mode: "monitor" }, "1");
    while (!release) await tick();
    invalidate(f);
    release();
    await assert.rejects(pending);
    assert.equal(f.saved.length, 0);
    assert.equal(f.published.length, 0);
  }
});
test("disk failure retains pixels for retry without reacquisition; canceled save does not activate", async () => {
  const f = setup();
  const original = f.deps.save;
  f.deps.save = async () => {
    throw Error("disk");
  };
  await assert.rejects(f.flow.start({ mode: "monitor" }, "1"), /disk/);
  assert(f.flow.busy);
  assert.equal(f.states.at(-1).phase, "retained");
  f.deps.save = original;
  await f.flow.retry();
  assert.equal(f.calls, 1);
  assert.equal(f.saved.length, 1);
  const g = setup();
  let release;
  g.deps.save = () =>
    new Promise((r) => {
      release = r;
    });
  const pending = g.flow.start({ mode: "monitor" }, "1");
  while (!release) await tick();
  g.flow.interrupt();
  release("saved");
  await pending;
  assert.equal(g.published.length, 0);
  assert.equal(g.flow.busy, false);
});
test("composition yields and rejects cancellation before publication", async () => {
  const f = setup({
    displays: [
      { id: 1, bounds: { x: 0, y: 0, width: 1024, height: 1024 }, scaleFactor: 1, rotation: 0 },
    ],
  });
  const pending = f.flow.start({ mode: "all" }, "1");
  await tick();
  f.flow.interrupt();
  await assert.rejects(pending);
  assert.equal(f.saved.length, 0);
});
test("renderer cannot supply arbitrary handles or expired source tokens", async () => {
  const f = setup();
  await assert.rejects(f.flow.start({ mode: "window", source: "window:123:0" }, "1"), /fonte/);
  await assert.rejects(f.flow.start({ mode: "window", handle: "123" }, "1"));
  assert.equal(f.calls, 0);
});

test("paired cursor uses native hotspot before Windows DIP conversion", async () => {
  const f = setup(),
    mapped = [];
  f.deps.screen.screenToDipRect = (_window, r) => {
    mapped.push(r);
    return { x: r.x / 2, y: r.y / 2, width: r.width / 2, height: r.height / 2 };
  };
  f.deps.images.createFromBuffer = () =>
    image(
      2,
      2,
      0,
      Buffer.from([200, 100, 50, 255, 200, 100, 50, 255, 200, 100, 50, 255, 200, 100, 50, 255]),
    );
  f.deps.prepare = async () => ({
    close() {},
    preparationMs: 0,
    query: async () => ({
      visible: true,
      x: -6,
      y: 1,
      hotspotX: 1,
      hotspotY: 1,
      width: 2,
      height: 2,
      blackPng: "YQ==",
      whitePng: "Yg==",
    }),
  });
  await f.flow.start({ mode: "monitor", cursor: true }, "1");
  assert.deepEqual(mapped, [{ x: -7, y: 0, width: 2, height: 2 }]);
  assert.deepEqual([...f.saved[0].toBitmap().subarray(4, 7)], [200, 100, 50]);
  assert.equal(f.saved[0].toBitmap()[0], 20);
});
test("source listing cancellation discards late previews and tokens", async () => {
  const f = setup();
  let release;
  f.deps.sources.getSources = () =>
    new Promise((r) => {
      release = r;
    });
  const pending = f.flow.sources();
  f.flow.interrupt();
  release([]);
  await assert.rejects(pending);
  assert.equal(f.flow.busy, false);
});
test("foreground unavailable stops safely without obtaining pixels", async () => {
  const f = setup();
  f.deps.prepare = async () => ({
    close() {},
    preparationMs: 0,
    query: async () => {
      throw Error("WINDOW_UNAVAILABLE");
    },
  });
  await assert.rejects(f.flow.start({ mode: "active" }, "1"), /WINDOW_UNAVAILABLE/);
  assert.equal(f.calls, 0);
  assert.equal(f.saved.length, 0);
  assert.equal(f.flow.busy, false);
});
test("license loss after acquired pixels preserves save retry without activating", async () => {
  const f = setup();
  f.deps.save = async () => {
    f.revoke();
    throw Error("disk");
  };
  await assert.rejects(f.flow.start({ mode: "monitor" }, "1"), /disk/);
  assert(f.flow.busy);
  f.deps.save = async (i) => {
    f.saved.push(i);
    return "saved";
  };
  await f.flow.retry();
  assert.equal(f.calls, 1);
  assert.equal(f.saved.length, 1);
  assert.equal(f.published.length, 0);
  assert.equal(f.flow.busy, false);
});

test("main handler denies sibling roles, subframes, stale URLs and switching roots", async () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const handleCode = source.slice(
    source.indexOf("function handle("),
    source.indexOf("function send("),
  );
  const frame = { url: "file:///fixture/editor.html" },
    sender = { mainFrame: frame },
    win = { role: "editor", trustedURL: frame.url };
  let registered,
    called = 0;
  const context = vm.createContext({
    BrowserWindow: { fromWebContents: () => win },
    windows: new Set([win]),
    librarySwitch: false,
    ipcMain: {
      handle: (_channel, fn) => {
        registered = fn;
      },
    },
    fn: () => {
      called++;
    },
  });
  vm.runInContext(handleCode + ';handle("photo:start",["editor"],fn);', context);
  await registered({ sender, senderFrame: frame });
  assert.equal(called, 1);
  win.role = "overlay";
  await assert.rejects(registered({ sender, senderFrame: frame }), /Origem/);
  win.role = "editor";
  await assert.rejects(registered({ sender, senderFrame: { url: frame.url } }), /Origem/);
  frame.url = "file:///untrusted.html";
  await assert.rejects(registered({ sender, senderFrame: frame }), /Origem/);
  frame.url = win.trustedURL;
  context.librarySwitch = true;
  await assert.rejects(registered({ sender, senderFrame: frame }), /transferência/);
  assert.equal(called, 1);
});

test("closing the application requires saving or discarding retained capture work", async () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf('handle("app:close"');
  const end = source.indexOf('  handle(\n    "capture:init"', start);
  assert(start > 0 && end > start);
  let close,
    closed = false;
  const context = vm.createContext({
    handle: (_name, _roles, fn) => {
      close = fn;
    },
    photoCapture: { busy: true },
    quickVideo: { close: async () => {} },
    library: { queue: Promise.resolve() },
    closing: false,
    editor: {
      close() {
        closed = true;
      },
    },
  });
  vm.runInContext(source.slice(start, end), context);
  await assert.rejects(close(), /preservada/);
  assert.equal(closed, false);
  context.photoCapture.busy = false;
  await close();
  assert.equal(closed, true);
});

test("photo editor cancel cannot destroy active or failed-save video; recorder cancellation preserves chunks", async () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  const editorSource = fs.readFileSync(path.join(__dirname, "../editor/editor.js"), "utf8");
  const method = editorSource.match(
    /\$\("photo-cancel"\)\.onclick = safe\(\(\) => \{\s*photoIntent\+\+;\s*return api\.(\w+)\(\);\s*\}\)/,
  )[1];
  const channel = preload.match(new RegExp(`${method}: invoke\\("([^"]+)"\\)`))[1];
  const handlers = new Map(),
    frame = { url: "file:///owned" },
    sender = { mainFrame: frame };
  const win = { role: "editor", trustedURL: frame.url },
    messages = [];
  let destroyed = 0,
    interrupted = 0;
  const context = vm.createContext({
    BrowserWindow: { fromWebContents: () => win },
    windows: new Set([win]),
    librarySwitch: false,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    capture: null,
    overlay: null,
    captureFrames: [],
    editor: null,
    controller: {
      isDestroyed: () => false,
      destroy: () => {
        destroyed++;
      },
      webContents: { send: (name) => messages.push(name) },
    },
    clearTimeout,
    controlState: () => ({}),
    ScrollSession: require("./scroll-session.ts").ScrollSession,
    ScrollAutomation: require("./scroll-automation.ts").ScrollAutomation,
    scrollWorkerEntry: path.join(__dirname, "scroll-worker.ts"),
    photoCapture: {
      busy: false,
      interrupt: () => {
        interrupted++;
      },
    },
  });
  vm.runInContext(
    source.slice(source.indexOf("function handle("), source.indexOf("function completeCapture(")),
    context,
  );
  const registrationStart = source.indexOf('  handle("capture:cancel"');
  vm.runInContext(
    source.slice(registrationStart, source.indexOf("  const applyPreferences", registrationStart)),
    context,
  );
  vm.runInContext(
    source.slice(
      source.indexOf("async function finishCapture("),
      source.indexOf("async function finishScrollCapture("),
    ),
    context,
  );
  const finishStart = source.indexOf('  handle("control:finish"');
  vm.runInContext(
    source.slice(finishStart, source.indexOf('  handle("scroll:review"', finishStart)),
    context,
  );
  vm.runInContext(
    source.slice(
      source.indexOf("function ensureScroll("),
      source.indexOf("function scheduleScroll("),
    ),
    context,
  );
  const invoke = (name) => handlers.get(name)({ sender, senderFrame: frame });
  for (const recordingState of ["recording", "failed"]) {
    const retained = {
      mode: "video",
      recordStarted: true,
      recordingState,
      chunks: [Buffer.from("owned-video")],
    };
    context.capture = retained;
    await invoke(channel);
    assert.equal(context.capture, retained);
    assert.equal(destroyed, 0);
    assert.equal(messages.length, 0);
    assert.equal(retained.chunks[0].toString(), "owned-video");
    await assert.rejects(invoke("capture:cancel"), /Origem/);
    win.role = "controller";
    await invoke("capture:cancel");
    assert.equal(messages.at(-1), "record-stop");
    assert.equal(context.capture, retained);
    assert.equal(destroyed, 0);
    await invoke("control:finish");
    assert.equal(messages.at(-1), "record-stop");
    assert.equal(context.capture, retained);
    messages.length = 0;
    win.role = "editor";
  }
  context.capture = null;
  for (const busy of [true, true, false]) {
    context.photoCapture.busy = busy;
    await invoke(channel);
  }
  assert.equal(interrupted, 2);
  assert.equal(destroyed, 0);
  win.role = "controller";
  const retainedScroll = {
    mode: "scroll",
    segments: [{ getSize: () => ({ width: 2, height: 2 }), toBitmap: () => Buffer.alloc(16) }],
  };
  context.capture = retainedScroll;
  win.role = "editor";
  await invoke(channel);
  assert.equal(context.capture, retainedScroll);
  win.role = "controller";
  await invoke("capture:cancel");
  assert.equal(context.capture, retainedScroll);
  assert.equal(retainedScroll.scroll.paused, true);
  assert.equal(retainedScroll.segments.length, 1);
  assert.equal(destroyed, 0);
  retainedScroll.scroll.dispose();
  context.windows.delete(win);
  await assert.rejects(invoke("capture:cancel"), /Origem/);
});

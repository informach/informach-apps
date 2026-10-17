const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

function harness() {
  const created = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = { setWindowOpenHandler() {}, on() {} };
      created.push(this);
    }
    removeMenu() {}
    loadURL(value) {
      this.query = Object.fromEntries(new URL(value).searchParams);
      queueMicrotask(() => this.emit("ready-to-show"));
    }
    setBounds(bounds) {
      this.bounds = bounds;
    }
    setIgnoreMouseEvents(value) {
      this.clickThrough = value;
    }
    setContentProtection(value) {
      this.protected = value;
    }
    setAlwaysOnTop(value) {
      this.onTop = value;
    }
    showInactive() {
      this.visible = true;
    }
    isDestroyed() {
      return !!this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.visible = false;
      this.emit("closed");
    }
  }
  const electron = {
    BrowserWindow: Window,
    app: {
      getPath: () => "C:/edi-tests/app-data",
      setPath() {},
      setAppUserModelId() {},
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
  };
  const context = vm.createContext({
    require: (id) =>
      id === "electron"
        ? electron
        : id === "@informach/edi-desktop/main"
          ? {
              createEdiDesktop: () => ({
                assertAccess() {
                  throw new Error("Unauthorized capture in geometry fixture");
                },
              }),
              desktopIpc: { handle() {}, on() {} },
            }
          : require(id),
    __dirname,
    process: { env: {} },
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    console,
    Buffer,
    clearTimeout,
    URL,
  });
  const code = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  vm.runInContext(
    code +
      `;globalThis.testing={start:async()=>{capture={mode:'scroll',rect:{x:100,y:80,width:500,height:300},display:{bounds:{x:-1280,y:0,width:1280,height:720}}};await showCaptureFrames();},cleanup,frames:()=>captureFrames};`,
    context,
  );
  return { api: context.testing, created };
}
test("moldura cria quatro janelas visíveis sem foco, protegidas e com passagem de cliques", async () => {
  const { api, created } = harness();
  await api.start();
  assert.equal(created.length, 4);
  for (const win of created) {
    assert.equal(win.visible, true);
    assert.equal(win.clickThrough, true);
    assert.equal(win.protected, true);
    assert.equal(win.onTop, true);
    assert.equal(win.options.transparent, true);
    assert.equal(win.options.backgroundColor, "#00000000");
    assert.ok(win.bounds.width >= 32 && win.bounds.height >= 32);
    assert.ok(Number(win.query.width) === 1 || Number(win.query.height) === 1);
    assert.equal(win.options.focusable, false);
    assert.equal(win.options.frame, false);
    assert.equal(win.options.skipTaskbar, true);
  }
});
test("encerrar a captura remove todas as janelas da moldura", async () => {
  const { api, created } = harness();
  await api.start();
  api.cleanup();
  assert.equal(api.frames().length, 0);
  assert.ok(created.every((win) => win.destroyed && !win.visible));
});
test("uma nova moldura não deixa bordas antigas na tela", async () => {
  const { api, created } = harness();
  await api.start();
  await api.start();
  assert.equal(api.frames().length, 4);
  assert.ok(created.slice(0, 4).every((win) => win.destroyed));
  assert.ok(created.slice(4).every((win) => win.visible));
});

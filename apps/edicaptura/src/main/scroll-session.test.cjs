const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { signature } = require("../capture/scroll.cjs");
function harness() {
  const width = 60,
    height = 100,
    full = Buffer.alloc(width * 180 * 4);
  let seed = 29;
  for (let i = 0; i < full.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    full[i] = seed >>> 24;
  }
  function image(y) {
    const bitmap = full.subarray(y * width * 4, (y + height) * width * 4);
    return {
      getSize: () => ({ width, height }),
      toBitmap: () => bitmap,
      crop() {
        return this;
      },
    };
  }
  let current = image(40),
    unblock,
    fail = false;
  const saved = [],
    messages = [];
  const electron = {
    app: {
      getPath: () => "C:/edi-tests/app-data",
      setPath() {},
      setAppUserModelId() {},
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
    nativeImage: { createFromBitmap: (bitmap, size) => ({ toPNG: () => ({ bitmap, ...size }) }) },
  };
  const context = vm.createContext({
    require: (id) =>
      id === "electron"
        ? electron
        : id === "@informach/edi-desktop/main"
          ? {
              createEdiDesktop: () => ({
                assertAccess() {
                  throw new Error("Unauthorized capture in scroll fixture");
                },
              }),
              desktopIpc: { handle() {}, on() {} },
            }
          : require(id),
    __dirname,
    process: { env: {} },
    console,
    Buffer,
    setTimeout: () => 1,
    clearTimeout() {},
  });
  context.initial = {
    mode: "scroll",
    rect: { x: 0, y: 0, width, height },
    crop: { width, height },
    display: { id: 1, size: { width, height } },
    segments: [image(0)],
    overlaps: [0],
    lastSignature: signature(image(0).toBitmap(), width, height),
  };
  context.load = () =>
    unblock
      ? new Promise((resolve) => {
          unblock = () => resolve({ image: current });
        })
      : Promise.resolve({ image: current });
  context.storage = {
    save: async (_meta, bytes) => {
      if (fail) throw Error("disk full");
      saved.push(bytes);
      return { id: "saved" };
    },
    read: async () => ({ id: "saved" }),
  };
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8") +
      `
    capture=initial;library=storage;getScreen=load;
    controller={isDestroyed:()=>false,destroy(){},hide(){},webContents:{send(){}}};
    monitorState=()=>({displays:[]});send=(name,data)=>{};
    globalThis.api={next:nextSegment,finish:finishCapture,cleanup,preserve:()=>preserveCapture(capture),state:()=>capture};`,
    context,
  );
  return {
    api: context.api,
    saved,
    messages,
    setFail: (value) => (fail = value),
    unrelated: () => {
      current = {
        getSize: () => ({ width, height }),
        toBitmap: () => Buffer.alloc(width * height * 4, 19),
        crop() {
          return this;
        },
      };
    },
    hold: () => {
      unblock = () => {};
    },
    release: () => unblock(),
    full,
    width,
    height,
  };
}
test("captura automática espera estabilidade e salva imagem única com tamanho correto", async () => {
  const h = harness();
  await h.api.next(true);
  assert.equal(h.api.state().segments.length, 1);
  await h.api.next(true);
  assert.equal(h.api.state().segments.length, 2);
  await h.api.finish(null);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].height, 140);
  assert.deepEqual(h.saved[0].bitmap, h.full.subarray(0, 140 * h.width * 4));
  assert.equal(h.api.state(), null);
});
test("finalização espera trecho em andamento antes de unir", async () => {
  const h = harness();
  h.hold();
  const next = h.api.next(false),
    finish = h.api.finish(null);
  assert.equal(h.saved.length, 0);
  h.release();
  await Promise.all([next, finish]);
  assert.equal(h.saved[0].height, 140);
});
test("cancelar durante captura descarta resposta tardia sem recriar sessão", async () => {
  const h = harness();
  h.hold();
  const next = h.api.next(false);
  h.api.cleanup();
  h.release();
  await next;
  assert.equal(h.api.state(), null);
  assert.equal(h.saved.length, 0);
});
test("erro ao salvar preserva trechos para tentar novamente", async () => {
  const h = harness();
  await h.api.next(false);
  h.setFail(true);
  await assert.rejects(h.api.finish(null), /disk full/);
  assert.equal(h.api.state().segments.length, 2);
  assert.equal(h.api.state().finishing, false);
  h.setFail(false);
  await h.api.finish(null);
  assert.equal(h.saved[0].height, 140);
});
test("foto manual registra trecho mesmo sem alinhamento e deixa aviso explícito", async () => {
  const h = harness();
  h.unrelated();
  await h.api.next(false);
  assert.equal(h.api.state().segments.length, 2);
  assert.equal(h.api.state().overlaps[1], 0);
  assert.match(h.api.state().feedback, /sem alinhamento/);
  await h.api.finish(null);
  assert.equal(h.saved[0].height, 200);
});
test("foto manual sem alinhamento respeita corte informado", async () => {
  const h = harness();
  h.unrelated();
  await h.api.next(false, 25);
  assert.equal(h.api.state().overlaps[1], 25);
  await h.api.finish(null);
  assert.equal(h.saved[0].height, 175);
});
test("automático não confirma nem acrescenta imagem sem correspondência", async () => {
  const h = harness();
  h.unrelated();
  await h.api.next(true);
  await h.api.next(true);
  assert.equal(h.api.state().segments.length, 1);
});

test("expiração finaliza os trechos autorizados e não captura novos após falha de salvamento", async () => {
  const h = harness();
  await h.api.next(false);
  h.setFail(true);
  await assert.rejects(h.api.preserve(), /disk full/);
  assert.equal(h.api.state().restricted, true);
  const count = h.api.state().segments.length;
  await h.api.next(false);
  await h.api.next(true);
  assert.equal(h.api.state().segments.length, count);
  h.setFail(false);
  await h.api.finish(null);
  assert.equal(h.saved[0].height, 140);
  assert.equal(h.api.state(), null);
});

test("recuperação concorrente aguarda a finalização da rolagem e salva uma única imagem", async () => {
  const h = harness();
  h.hold();
  const next = h.api.next(false);
  const preservation = h.api.preserve();
  let recovered = false;
  const recovery = h.api.finish(null).then(() => {
    recovered = true;
  });
  await new Promise(setImmediate);
  assert.equal(recovered, false);
  assert.equal(h.saved.length, 0);
  h.release();
  await Promise.all([next, preservation, recovery]);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].height, 140);
  assert.equal(h.api.state(), null);
});

test("falha da finalização concorrente chega a todos os pedidos e permite repetir", async () => {
  const h = harness();
  h.hold();
  h.setFail(true);
  const next = h.api.next(false);
  const preservation = assert.rejects(h.api.preserve(), /disk full/);
  const recovery = assert.rejects(h.api.finish(null), /disk full/);
  h.release();
  await Promise.all([next, preservation, recovery]);
  assert.equal(h.saved.length, 0);
  assert.equal(h.api.state().finishing, false);
  assert.equal(h.api.state().restricted, true);
  h.setFail(false);
  await h.api.finish(null);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].height, 140);
  assert.equal(h.api.state(), null);
});

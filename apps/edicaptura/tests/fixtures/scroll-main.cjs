const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const main = path.resolve(__dirname, "../../src/main/main.cjs");
const localRequire = createRequire(main);
function scrollMain(options = {}) {
  const pixels = Buffer.alloc(60 * 180 * 4);
  let seed = 29;
  for (let i = 0; i < pixels.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24;
  }
  const image = (offset = 0) => ({
    getSize: () => ({ width: 60, height: 100 }),
    toBitmap: () => Buffer.from(pixels.subarray(offset * 240, (offset + 100) * 240)),
    crop: () => image(offset),
  });
  const messages = [],
    saved = [];
  const electron = {
    protocol: { registerSchemesAsPrivileged() {} },
    app: {
      getPath: () => "C:/edi-tests/scroll-main",
      setPath() {},
      setAppUserModelId() {},
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
    screen: {
      getAllDisplays: () =>
        options.displays?.() ?? [
          {
            id: 1,
            bounds: { x: 0, y: 0, width: 60, height: 100 },
            size: { width: 60, height: 100 },
            scaleFactor: 1,
            rotation: 0,
          },
        ],
    },
    desktopCapturer: { getSources: (...args) => options.sources(...args) },
    nativeImage: {
      createFromBuffer: (...args) => options.normalize(...args),
      createFromBitmap: (bitmap, size) => ({
        getSize: () => size,
        toPNG: () => ({ bitmap, ...size, length: bitmap.length }),
        toDataURL: () => options.preview?.({ bitmap, ...size }) ?? "data:image/png;base64,fixture",
        resize: () => ({ toDataURL: () => "data:image/png;base64,fixture" }),
      }),
    },
  };
  const context = vm.createContext({
    require: (id) =>
      id === "electron"
        ? electron
        : id === "@informach/edi-desktop/main"
          ? {
              createEdiDesktop: () => ({ assertAccess() {} }),
              desktopIpc: { handle() {}, on() {} },
            }
          : localRequire(id),
    __dirname: path.dirname(main),
    process: { env: {} },
    console,
    Buffer,
    setTimeout: () => 1,
    clearTimeout() {},
    initial: {
      mode: "scroll",
      rect: { x: 0, y: 0, width: 60, height: 100 },
      crop: { width: 60, height: 100 },
      display: electron.screen.getAllDisplays()[0],
      segments: [image()],
      overlaps: [0],
    },
    freshImage: () => image(),
    fakeScreen: () => Promise.resolve({ image: image(40) }),
    record: (name, value) => {
      messages.push({ name, value });
      options.onControl?.(name, value);
    },
    storage: {
      save: async (_meta, bytes) => {
        saved.push(bytes);
        return { id: "saved" };
      },
      read: async () => ({ id: "saved" }),
    },
  });
  vm.runInContext(
    fs.readFileSync(main, "utf8") +
      `
    capture=initial;library=storage;
    ${options.sources ? "" : "getScreen=fakeScreen;"}
    controller={isDestroyed:()=>false,destroy(){},hide(){},webContents:{send:record}};
    monitorState=()=>({displays:[]});send=()=>{};
    globalThis.api={next:nextSegment,finish:finishCapture,review:reviewScroll,pause:pauseScroll,control:controlState,state:()=>capture,cleanup,
      acquire:()=>getScreen(capture.display),replace:()=>{const old=capture;capture={mode:'scroll',rect:initial.rect,crop:initial.crop,display:initial.display,segments:[freshImage()],overlaps:[0]};return old;},
      replaceController:()=>{controller={isDestroyed:()=>false,destroy(){},hide(){},webContents:{send:record}};},
      initialCrop:(size)=>{capture={mode:'select',display:initial.display,image:{getSize:()=>size,crop(){throw Error('crop reached');}}};return selectRegion({mode:'scroll',rect:{x:0,y:0,width:60,height:100}});}};
  `,
    context,
  );
  return { api: context.api, messages, saved, image };
}
module.exports = { scrollMain };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness({ holdPermission = false, failSave = false, deferStopEvents = false } = {}) {
  let begin, stop, recover, grantPermission, completeStop;
  let failedSave = failSave;
  const saved = [],
    errors = [],
    notices = [];
  const stream = { getTracks: () => [{ stop() {} }], getVideoTracks: () => [{}] };
  const permission = holdPermission
    ? new Promise((resolve) => {
        grantPermission = () => resolve(stream);
      })
    : Promise.resolve(stream);
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    start() {
      this.state = "recording";
      if (deferStopEvents) this.ondataavailable({ data: new Blob(["first frames;"]) });
    }
    stop() {
      this.state = "inactive";
      completeStop = async () => {
        this.ondataavailable({ data: new Blob(["recoverable frames"]) });
        await this.onstop();
      };
      if (!deferStopEvents) void completeStop();
    }
  }
  const context = {
    window: {
      addEventListener(_name, callback) {
        begin = callback;
      },
      ediSuite: {
        onRecovery(callback) {
          recover = callback;
        },
      },
    },
    navigator: { mediaDevices: { getDisplayMedia: () => permission } },
    document: {
      createElement(kind) {
        return kind === "video"
          ? { muted: false, videoWidth: 100, videoHeight: 100, async play() {}, remove() {} }
          : { getContext: () => ({ drawImage() {} }), captureStream: () => stream };
      },
    },
    MediaRecorder: Recorder,
    Blob,
    Uint8Array,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    api: {
      onStop(callback) {
        stop = callback;
      },
      async recordReady() {},
      async recordSave(bytes) {
        if (failedSave) {
          failedSave = false;
          throw new Error("disk full");
        }
        saved.push(Buffer.from(bytes).toString());
      },
      async recordFailed(message) {
        errors.push(message);
      },
    },
    toast(message) {
      notices.push(message);
    },
  };
  vm.runInNewContext(
    fs
      .readFileSync(path.join(__dirname, "../recording/recorder.js"), "utf8")
      .replace("export function", "function") +
      "\nwindow.ediSuite.onRecovery(setupRecording(api, toast));",
    context,
  );
  return {
    start: () =>
      begin({
        detail: {
          rect: { x: 0, y: 0, width: 100, height: 100 },
          display: { width: 100, height: 100 },
        },
      }),
    stop: () => stop(),
    recover: () => recover(),
    completeStop: () => completeStop(),
    grant: () => grantPermission(),
    saved,
    errors,
    notices,
  };
}

test("encerramento por licença preserva os bytes e recuperação permite repetir falha de disco", async () => {
  const h = harness({ failSave: true });
  await h.start();
  await assert.rejects(h.recover(), /disk full/);
  assert.deepEqual(h.saved, []);
  assert.deepEqual(h.errors, []);
  await h.recover();
  assert.deepEqual(h.saved, ["recoverable frames"]);
  await h.recover();
  assert.equal(h.saved.length, 1);
});

test("bloqueio durante permissão pendente também encerra a gravação que iniciar depois", async () => {
  const h = harness({ holdPermission: true });
  const start = h.start();
  const recovery = h.recover();
  h.grant();
  await Promise.all([start, recovery]);
  assert.deepEqual(h.saved, ["recoverable frames"]);
  assert.deepEqual(h.errors, []);
});

test("bloqueio recebido antes do evento de início não abre uma nova captura", async () => {
  const h = harness();
  h.stop();
  await h.start();
  assert.deepEqual(h.saved, []);
  assert.match(h.errors[0], /antes do primeiro quadro/);
});

test("recuperação concorrente aguarda o último dataavailable e onstop antes de salvar", async () => {
  const h = harness({ deferStopEvents: true });
  await h.start();
  h.stop();
  let recovered = false;
  const recovery = h.recover().then(() => {
    recovered = true;
  });
  await new Promise(setImmediate);
  assert.deepEqual(h.saved, []);
  assert.equal(recovered, false);
  await h.completeStop();
  await recovery;
  assert.deepEqual(h.saved, ["first frames;recoverable frames"]);
  await h.recover();
  assert.equal(h.saved.length, 1);
});

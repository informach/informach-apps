const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function harness({
  holdPermission = false,
  failSave = false,
  deferStopEvents = false,
  holdResume = false,
  failFinalAppend = false,
  holdInitialFailure = false,
} = {}) {
  let begin, stop, recover, grantPermission, completeStop, automaticStop, stopCompletion;
  let failedSave = failSave;
  let resumeEntered,
    releaseResume,
    failedFinal = false,
    resumes = 0;
  const resumed = new Promise((resolve) => {
    resumeEntered = resolve;
  });
  const resumeBarrier = new Promise((resolve) => {
    releaseResume = resolve;
  });
  let failureEntered,
    releaseFailure,
    firstAppend = true;
  const failureEnteredPromise = new Promise((resolve) => {
    failureEntered = resolve;
  });
  const failureBarrier = new Promise((resolve) => {
    releaseFailure = resolve;
  });
  const chunks = [];
  const saved = [],
    errors = [],
    notices = [],
    phases = [];
  let stoppedTracks = 0,
    starts = 0;
  let activeRecorder;
  const stream = {
    getTracks: () => [
      {
        stop() {
          stoppedTracks++;
        },
      },
    ],
    getVideoTracks: () => [{}],
  };
  const permission = holdPermission
    ? new Promise((resolve) => {
        grantPermission = () => resolve(stream);
      })
    : Promise.resolve(stream);
  class Recorder {
    constructor() {
      activeRecorder = this;
    }
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    pause() {
      this.state = "paused";
    }
    resume() {
      resumes++;
      this.state = "recording";
    }
    start() {
      starts++;
      this.state = "recording";
      if (deferStopEvents) this.ondataavailable({ data: new Blob(["first frames;"]) });
    }
    stop() {
      this.state = "inactive";
      completeStop = async () => {
        this.ondataavailable({ data: new Blob(["recoverable frames"]) });
        await this.onstop();
      };
      if (!deferStopEvents) stopCompletion = Promise.resolve().then(completeStop);
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
    RecordingClock: (await import("../recording/clock.mjs")).RecordingClock,
    performance,
    crypto,
    MediaRecorder: Recorder,
    Blob,
    Uint8Array,
    setInterval: (callback, delay) => {
      if (delay === 250) automaticStop = callback;
      return 1;
    },
    clearInterval() {},
    setTimeout: (callback) => {
      automaticStop = callback;
      return 1;
    },
    clearTimeout() {},
    api: {
      onStop(callback) {
        stop = callback;
      },
      async recordReady() {},
      async recordPhase(phase) {
        phases.push(phase);
        if (holdInitialFailure && phase === "failed") {
          failureEntered();
          await failureBarrier;
        }
        if (holdResume && phase === "recording") {
          resumeEntered();
          await resumeBarrier;
        }
      },
      async recordAppend(packet) {
        if (holdInitialFailure && firstAppend) {
          firstAppend = false;
          throw Error("initial append unavailable");
        }
        if (failFinalAppend && activeRecorder.state === "inactive" && !failedFinal) {
          failedFinal = true;
          throw Error("final append unavailable");
        }
        assert.ok(packet.bytes.byteLength <= 1024 * 1024);
        assert.equal(packet.sequence, chunks.length);
        assert.equal(
          packet.sha256,
          require("node:crypto").createHash("sha256").update(packet.bytes).digest("hex"),
        );
        chunks.push(Buffer.from(packet.bytes));
        return { sequence: packet.sequence };
      },
      async recordSave(input) {
        assert.equal(input.sessionId, "11111111-1111-4111-8111-111111111111");
        if (failedSave) {
          failedSave = false;
          throw new Error("disk full");
        }
        saved.push(Buffer.concat(chunks).toString());
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
      .replace(/^import .*;\r?\n/gm, "")
      .replace("export function", "function")
      .replace("export const", "const") +
      "\nwindow.ediSuite.onRecovery(setupRecording(api, toast).finish);",
    context,
  );
  return {
    failureEntered: failureEnteredPromise,
    releaseFailure,
    stoppedTracks: () => stoppedTracks,
    resumed,
    releaseResume,
    resumes: () => resumes,
    starts: () => starts,
    chunk: (bytes) => activeRecorder.ondataavailable({ data: new Blob([bytes]) }),
    start: () =>
      begin({
        detail: {
          sessionId: "11111111-1111-4111-8111-111111111111",
          chunkBytes: 1024 * 1024,
          maxParts: 100_000,
          maxDurationMs: 0,
          maxBytes: 400_000_000,
          rect: { x: 0, y: 0, width: 100, height: 100 },
          display: { width: 100, height: 100 },
        },
      }),
    stop: () => stop(),
    recover: () => recover(),
    completeStop: () => completeStop(),
    autoStop: async () => {
      automaticStop();
      await stopCompletion;
    },
    grant: () => grantPermission(),
    saved,
    errors,
    notices,
    phases,
  };
}

test("encerramento por licença preserva os bytes e recuperação permite repetir falha de disco", async () => {
  const h = await harness({ failSave: true });
  await h.start();
  await assert.rejects(h.recover(), /disk full/);
  assert.deepEqual(h.phases, ["finalizing", "failed"]);
  assert.deepEqual(h.saved, []);
  assert.deepEqual(h.errors, []);
  await h.recover();
  assert.deepEqual(h.saved, ["recoverable frames"]);
  assert.deepEqual(h.phases, ["finalizing", "failed", "finalizing"]);
  await h.recover();
  assert.equal(h.saved.length, 1);
});

test("stop/expiry during resume-phase IPC durably drains every final admitted byte before success", async () => {
  for (const termination of ["finish", "stop-event", "automatic"]) {
    const h = await harness({ holdResume: true });
    await h.start();
    const initial = Buffer.alloc(4 * 1024 * 1024, 65);
    h.chunk(initial);
    await h.resumed;
    if (termination === "stop-event") h.stop();
    const completion = termination === "automatic" ? h.autoStop() : h.recover();
    await new Promise(setImmediate);
    assert.deepEqual(h.saved, []);
    h.releaseResume();
    await completion;
    const expected = Buffer.concat([initial, Buffer.from("recoverable frames")]);
    assert.equal(Buffer.byteLength(h.saved[0]), expected.length);
    assert.equal(
      require("node:crypto").createHash("sha256").update(h.saved[0]).digest("hex"),
      require("node:crypto").createHash("sha256").update(expected).digest("hex"),
    );
    assert.equal(h.resumes(), 1);
    assert.equal(
      h.notices.filter((notice) => notice === "Gravação salva na biblioteca.").length,
      1,
    );
  }
});

test("immediate stop and final append failure retain final bytes for explicit retry", async () => {
  for (const holdResume of [false, true]) {
    const h = await harness({ holdResume, failFinalAppend: true });
    await h.start();
    const initial = holdResume ? Buffer.alloc(4 * 1024 * 1024, 66) : Buffer.alloc(0);
    if (holdResume) {
      h.chunk(initial);
      await h.resumed;
    }
    const completion = h.recover();
    h.releaseResume();
    await assert.rejects(completion, /final append unavailable/);
    assert.deepEqual(h.saved, []);
    await h.recover();
    const expected = Buffer.concat([initial, Buffer.from("recoverable frames")]);
    assert.equal(Buffer.byteLength(h.saved[0]), expected.length);
    assert.equal(
      require("node:crypto").createHash("sha256").update(h.saved[0]).digest("hex"),
      require("node:crypto").createHash("sha256").update(expected).digest("hex"),
    );
    assert.ok(h.stoppedTracks() > 0);
  }
});
test("parada automática finaliza relógio, sinaliza falha e permite recuperar sem gravar novos quadros", async () => {
  const h = await harness({ failSave: true });
  await h.start();
  await h.autoStop();
  assert.deepEqual(h.phases, ["finalizing", "failed"]);
  assert.deepEqual(h.saved, []);
  await h.recover();
  assert.deepEqual(h.phases, ["finalizing", "failed", "finalizing"]);
  assert.deepEqual(h.saved, ["recoverable frames"]);
});

test("bloqueio durante permissão pendente também encerra a gravação que iniciar depois", async () => {
  const h = await harness({ holdPermission: true });
  const start = h.start();
  const recovery = h.recover();
  h.grant();
  await assert.rejects(recovery, /durante a permissão/);
  await start;
  assert.deepEqual(h.saved, []);
  assert.match(h.errors[0], /durante a permissão/);
  assert.equal(h.starts(), 0);
  assert.equal(h.stoppedTracks(), 1);
});

test("bloqueio recebido antes do evento de início não abre uma nova captura", async () => {
  const h = await harness();
  h.stop();
  await h.start();
  assert.deepEqual(h.saved, []);
  assert.match(h.errors[0], /antes do primeiro quadro/);
});

test("recuperação concorrente aguarda o último dataavailable e onstop antes de salvar", async () => {
  const h = await harness({ deferStopEvents: true });
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
test("large individual chunks are split into ordered one-MiB packets and oversize admission stops explicitly", async () => {
  const bounded = await harness();
  await bounded.start();
  bounded.chunk(new Uint8Array(2_500_000));
  await bounded.recover();
  assert.equal(bounded.saved[0].length, 2_500_000 + "recoverable frames".length);
  const oversized = await harness();
  await oversized.start();
  oversized.chunk(new Uint8Array(32 * 1024 * 1024 + 1));
  await assert.rejects(oversized.recover(), /32 MiB/);
  assert.deepEqual(oversized.saved, []);
  assert.ok(oversized.stoppedTracks() > 0);
  assert.ok(oversized.notices.some((notice) => notice.includes("não foi salva")));
});

test("retry while failed-phase IPC is pending waits for the failed drain and preserves final bytes", async () => {
  const h = await harness({ holdInitialFailure: true });
  await h.start();
  h.chunk(Buffer.from("initial frames;"));
  await h.failureEntered;
  const retried = h.recover();
  const completed = retried.then(
    () => ({ ok: true }),
    (error) => ({ error: error.message }),
  );
  await new Promise(setImmediate);
  assert.deepEqual(h.saved, []);
  h.releaseFailure();
  assert.deepEqual(await completed, { ok: true });
  assert.deepEqual(h.saved, ["initial frames;recoverable frames"]);
  assert.equal(h.notices.filter((notice) => notice === "Gravação salva na biblioteca.").length, 1);
});

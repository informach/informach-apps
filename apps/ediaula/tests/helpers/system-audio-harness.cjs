// Electron main for tests/systemAudioExclusion.test.ts: the recorder's way of capturing the
// computer's sound (the same display media handler as main/recorderWindow.ts and the constraints
// handed in, those of shared/systemAudio.ts). Tone A plays in the capturing window itself
// (--tone-window=same: the recorder window plays the lesson's voice and captures the computer's
// sound) or in another window of this app (--tone-window=other), and another process
// (PowerShell's SoundPlayer) plays the WAV of tone B on the default device. Writes the captured
// WebM and the track's settings, then quits.
const { app, BrowserWindow, desktopCapturer, ipcMain, session } = require("electron");
const { spawn } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const arg = (name) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!found) throw new Error(`missing --${name}`);
  return found.slice(name.length + 3);
};
const out = arg("out");
const toneB = arg("tone-b");
const frequencyA = Number(arg("frequency-a"));
const constraints = JSON.parse(arg("constraints"));
const seconds = Number(arg("seconds"));
const toneWindowKind = arg("tone-window");

/** Plays tone A until the app quits, in whichever window runs it. */
const playTone = `
  const context = new AudioContext();
  await context.resume();
  const tone = context.createOscillator();
  tone.frequency.value = ${frequencyA};
  const gain = context.createGain();
  gain.gain.value = 0.3;
  tone.connect(gain).connect(context.destination);
  tone.start();
  if (context.state !== "running") throw new Error("tone A is not playing: " + context.state);
`;

/** A window of its own that plays tone A. */
const tonePage = `<!doctype html><meta charset="utf-8"><script>
const { ipcRenderer } = require("electron");
(async () => {
  ${playTone}
  await ipcRenderer.invoke("tone-playing");
})().catch((error) => ipcRenderer.invoke("failed", String(error)));
</script>`;

/** The window that captures the computer's sound, as the recorder window does. */
const capturePage = `<!doctype html><meta charset="utf-8"><script>
const { ipcRenderer } = require("electron");
(async () => {
  ${toneWindowKind === "same" ? playTone : ""}
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: ${JSON.stringify(constraints)},
  });
  for (const track of stream.getVideoTracks()) track.stop();
  const [track] = stream.getAudioTracks();
  const recorder = new MediaRecorder(new MediaStream([track]), {
    mimeType: "audio/webm;codecs=opus",
  });
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.start(500);
  await ipcRenderer.invoke("play-b");
  await new Promise((resolve) => setTimeout(resolve, ${seconds * 1000}));
  await new Promise((resolve) => {
    recorder.onstop = resolve;
    recorder.stop();
  });
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  await ipcRenderer.invoke("done", bytes, track.getSettings());
})().catch((error) => ipcRenderer.invoke("failed", String(error)));
</script>`;

const page = (dir, name, html) => {
  const file = join(dir, name);
  writeFileSync(file, html);
  return file;
};

app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }));
  });
  const webPreferences = {
    nodeIntegration: true,
    contextIsolation: false,
    sandbox: false,
    autoplayPolicy: "no-user-gesture-required",
    backgroundThrottling: false,
  };
  const dir = mkdtempSync(join(tmpdir(), "ediaula-system-audio-"));
  ipcMain.handle("play-b", () => {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(New-Object Media.SoundPlayer '${toneB.replace(/'/g, "''")}').PlaySync()`,
      ],
      { stdio: "ignore", windowsHide: true },
    );
  });
  ipcMain.handle("done", (_event, bytes, settings) => {
    writeFileSync(out, Buffer.from(bytes));
    process.stdout.write(`SETTINGS ${JSON.stringify(settings)}\n`);
    app.exit(0);
  });
  ipcMain.handle("failed", (_event, message) => {
    process.stderr.write(`${message}\n`);
    app.exit(1);
  });
  // In another window, tone A plays first; the capture starts once it plays.
  if (toneWindowKind === "other") {
    const playing = new Promise((resolve) => {
      ipcMain.handleOnce("tone-playing", () => resolve());
    });
    const toneWindow = new BrowserWindow({ show: false, webPreferences });
    await toneWindow.loadFile(page(dir, "tone.html", tonePage));
    await playing;
  }
  const captureWindow = new BrowserWindow({ show: false, webPreferences });
  await captureWindow.loadFile(page(dir, "capture.html", capturePage));
});

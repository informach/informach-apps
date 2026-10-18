// Electron main for tests/systemAudioExclusion.test.ts: the recorder's way of capturing the
// computer's sound (the same display media handler as main/recorderWindow.ts and the constraints
// handed in, those of shared/systemAudio.ts), while this app plays tone A in its window and
// another process (PowerShell's SoundPlayer) plays the WAV of tone B on the default device.
// Writes the captured WebM and the track's settings, then quits.
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

const page = `<!doctype html><meta charset="utf-8"><script>
const { ipcRenderer } = require("electron");
(async () => {
  const context = new AudioContext();
  const tone = context.createOscillator();
  tone.frequency.value = ${frequencyA};
  const gain = context.createGain();
  gain.gain.value = 0.3;
  tone.connect(gain).connect(context.destination);
  tone.start();
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
  tone.stop();
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  await ipcRenderer.invoke("done", bytes, track.getSettings());
})().catch((error) => ipcRenderer.invoke("failed", String(error)));
</script>`;

app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }));
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
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
  const file = join(mkdtempSync(join(tmpdir(), "ediaula-system-audio-")), "page.html");
  writeFileSync(file, page);
  await window.loadFile(file);
});

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, session, type WebContents } from "electron";

/**
 * The sound of the lesson page during a guided take, recorded on its own ("Som da página"): a
 * hidden window of the app asks for the page's audio by getDisplayMedia, and the app's handler
 * gives it the lesson window's frame (Electron captures the sound of the webContents that holds
 * it). While captured, the page plays nothing on the speakers. The sound goes to a WebM file a
 * piece at a time; shared/pageSound.ts puts it on the video's time when the take is finished.
 */

/** The window of the capture: its own partition, so the lesson's never gets the handler. */
const PARTITION = "ediaula-page-sound";
/** Seconds of each piece MediaRecorder hands over. */
const PIECE_MS = 1000;

const PAGE = `<!doctype html><meta charset="utf-8"><title>Som da página</title>`;

const START = `(async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  for (const track of stream.getVideoTracks()) track.stop();
  const sound = stream.getAudioTracks();
  if (!sound.length) return false;
  const recorder = new MediaRecorder(new MediaStream(sound), { mimeType: "audio/webm;codecs=opus" });
  globalThis.__pieces = [];
  globalThis.__recorder = recorder;
  recorder.ondataavailable = (e) => { if (e.data.size) globalThis.__pieces.push(e.data); };
  await new Promise((resolve) => { recorder.onstart = resolve; recorder.start(${PIECE_MS}); });
  return true;
})()`;

/** What was recorded since the last call, as base64. */
const TAKE = `(async () => {
  const pieces = (globalThis.__pieces ?? []).splice(0);
  if (!pieces.length) return "";
  const url = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(new Blob(pieces));
  });
  return url.slice(url.indexOf(",") + 1);
})()`;

const STOP = `(async () => {
  const recorder = globalThis.__recorder;
  if (!recorder || recorder.state === "inactive") return;
  await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop(); });
})()`;

export class PageSoundCapture {
  private flushing: Promise<void> = Promise.resolve();
  private readonly timer: ReturnType<typeof setInterval>;
  private stopped = false;

  private constructor(
    private readonly helper: BrowserWindow,
    private readonly lesson: WebContents,
    readonly file: string,
    /** performance.now() when the recording started. */
    readonly startedAt: number,
  ) {
    this.timer = setInterval(() => this.flush(), 2000);
  }

  /** The page's sound recorded to `file`, or null when this page gives none. */
  static async start(lesson: WebContents, file: string): Promise<PageSoundCapture | null> {
    const ses = session.fromPartition(PARTITION);
    ses.setDisplayMediaRequestHandler((_request, callback) => {
      if (lesson.isDestroyed()) return callback(null);
      callback({ video: lesson.mainFrame, audio: lesson.mainFrame });
    });
    const helper = new BrowserWindow({
      show: false,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    try {
      // A file of the app's data: getDisplayMedia needs a secure page.
      const dir = join(app.getPath("userData"), "page-sound");
      await mkdir(dir, { recursive: true });
      const page = join(dir, "captura.html");
      await writeFile(page, PAGE);
      await helper.loadFile(page);
      const ok = (await helper.webContents.executeJavaScript(START, true)) === true;
      const startedAt = performance.now();
      if (!ok) throw new Error("A página não tem som para gravar.");
      await writeFile(file, "");
      // Captured, the page plays nothing on the speakers; it was muted until now.
      lesson.setAudioMuted(false);
      return new PageSoundCapture(helper, lesson, file, startedAt);
    } catch {
      helper.destroy();
      return null;
    }
  }

  private flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      if (this.helper.isDestroyed()) return;
      const piece = String(await this.helper.webContents.executeJavaScript(TAKE).catch(() => ""));
      if (piece) await appendFile(this.file, Buffer.from(piece, "base64"));
    });
    return this.flushing;
  }

  /** Ends the recording and writes what is left. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    if (!this.lesson.isDestroyed()) this.lesson.setAudioMuted(true);
    if (!this.helper.isDestroyed())
      await this.helper.webContents.executeJavaScript(STOP).catch(() => undefined);
    await this.flush().catch(() => undefined);
    if (!this.helper.isDestroyed()) this.helper.destroy();
  }
}

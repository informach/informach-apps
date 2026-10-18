import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { freemem } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { ElectronApplication, Locator, Page } from "playwright";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";
import { nativeMediaDirectory } from "./media-bundle.mts";
import { createNativeHarness, execute, nativeTooling, waitForStatus } from "./native-harness.mts";

/**
 * End-to-end visual check of EdiAula (pnpm edi:test:visual): builds the app with ephemeral
 * license keys, makes synthetic media with the bundled FFmpeg and the Windows speech
 * synthesizer, opens the licensed app with an isolated profile and walks through the screens
 * the recent batches changed, saving a PNG of each state to .cache/edi-visual-results with a
 * relatorio.md. Every page error, console error and failed IPC handler of every window fails the
 * run, except the known harmless messages listed in KNOWN_HARMLESS.
 *
 * Native file dialogs cannot be clicked: the test answers them by replacing Electron's dialog
 * functions in the test's own main process, so the app's real flow still runs (the dialog's
 * answer is granted by the desktop SDK exactly as a pick would be). Nothing touches the user's
 * profile, projects or recordings, and no recording is ever started.
 */

const { packageManager, electronPath } = nativeTooling();
const MIN_FREE_MB = 2000;
const results = resolve(".cache/edi-visual-results");
const ffmpeg = join(nativeMediaDirectory, "bin", "ffmpeg.exe");
const scriptFixture = resolve("apps/ediaula/tests/fixtures/roteiro-farol-dia1.md");
const lessonFixture = resolve("apps/ediaula/tests/fixtures/guided-blockly.html");
const LEASE_SECONDS = 1800;

/**
 * A seventh section with four speakers, after the fixture: the recorder's speaker chips at
 * 1366 × 768 (the fixture's sections have two).
 */
const SPEAKERS_SECTION = [
  "## Seção 7. Conversa com os amigos",
  "### Vídeo `video-conversa` · Conversa com os amigos",
  "**Duração alvo:** 30 a 40 segundos.",
  "**Professora:**",
  '> "Hoje três amigos vão ajudar a gente."',
  "**Debinha (avatar):**",
  '> "Eu cuido das setas."',
  "**Dedé (avatar):**",
  '> "E eu cuido do farol."',
  "**Narrador:**",
  '> "E assim começa a aventura."',
  "",
].join("\n");

/** Spoken by the Windows synthesizer: the start of the first section of the script fixture. */
const VOICE_TEXT =
  "Oi! Neste desafio, você vai programar o jogo A Chave do Farol. Antes de montar o seu, " +
  "você vai jogar a versão pronta, para ver como o jogo funciona. A história é assim: um " +
  "barco precisa chegar à costa, mas o farol está apagado, e sem a luz dele o barco não " +
  "acha o caminho.";

/**
 * Messages that are not defects of the app. Each one says why it is harmless and is pinned to
 * where it comes from (the window and, for renderer messages, the source line of the bundle);
 * anything else fails the run.
 */
const KNOWN_HARMLESS: { source: RegExp; text: RegExp; line?: RegExp; reason: string }[] = [];

/** The bundle line a console message points at (0-based, as Playwright reports it). */
const bundles = new Map<string, string[]>();
function sourceLine(where?: { url: string; lineNumber: number }): string {
  if (!where?.url.startsWith("file:")) return "";
  let lines = bundles.get(where.url);
  if (!lines) {
    lines = readFileSync(fileURLToPath(where.url), "utf8").split("\n");
    bundles.set(where.url, lines);
  }
  return lines[where.lineNumber] ?? "";
}

interface Problem {
  step: string;
  source: string;
  kind: string;
  text: string;
  allowed?: string;
}
interface Shot {
  step: string;
  title: string;
  file: string;
}
interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}
interface DialogCall {
  launch: string;
  kind: string;
  title: string;
  answered: boolean;
}

const problems: Problem[] = [];
const shots: Shot[] = [];
const steps: StepResult[] = [];
const dialogs: DialogCall[] = [];
const notes: string[] = [];
const mainLog: string[] = [];
let currentStep = "preparação";
let expected: { text: RegExp; reason: string }[] = [];
let lastPage: Page | null = null;
/** Launched and not closed yet: the run closes them whatever failed on the way. */
const running = new Map<ElectronApplication, string>();

const describe = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

function record(
  source: string,
  kind: string,
  text: string,
  where?: { url: string; lineNumber: number },
): void {
  const known = KNOWN_HARMLESS.find(
    (item) =>
      item.source.test(source) &&
      item.text.test(text) &&
      (!item.line || item.line.test(sourceLine(where))),
  );
  const scoped = expected.find((item) => item.text.test(text));
  problems.push({
    step: currentStep,
    source,
    kind,
    text: text.slice(0, 4000),
    ...(known
      ? { allowed: known.reason }
      : scoped
        ? { allowed: `Esperado neste passo: ${scoped.reason}` }
        : {}),
  });
  if (!known && !scoped) console.error(`[visual] ${kind} em ${source}: ${text.slice(0, 400)}`);
}

async function waitForMemory(before: string): Promise<void> {
  const deadline = Date.now() + 20 * 60_000;
  let told = false;
  while (freemem() / 1024 ** 2 < MIN_FREE_MB) {
    if (Date.now() > deadline)
      throw new Error(`Menos de ${MIN_FREE_MB} MB livres por 20 min antes de ${before}`);
    if (!told) {
      console.log(
        `[visual] aguardando ${MIN_FREE_MB} MB livres antes de ${before} (agora ${Math.round(freemem() / 1024 ** 2)} MB)`,
      );
      told = true;
    }
    await delay(15_000);
  }
}

let shotIndex = 0;
async function capture(target: Page | Locator, name: string, title: string): Promise<void> {
  const file = join(results, `${String(++shotIndex).padStart(2, "0")}-${name}.png`);
  await target.screenshot({ path: file, animations: "disabled" });
  shots.push({ step: currentStep, title, file });
}

/**
 * The recorder window is transparent over whatever is on the screen: its PNG keeps the alpha and
 * is laid over a dark and a light desktop (FFmpeg), so contrast can be judged on both.
 */
/**
 * The camera preview of the recorder shows a picture: the video has a size, or one of its pixels
 * is not black. A preview that stays empty (the device held, a stream lost) fails the step.
 */
async function cameraPreviewShows(overlay: Page, selector: string): Promise<void> {
  const shows = await overlay.locator(selector).evaluate(
    (video) =>
      new Promise<{ width: number; lit: boolean }>((done) => {
        if (!(video instanceof HTMLVideoElement)) return done({ width: 0, lit: false });
        const look = () => {
          const width = video.videoWidth;
          let lit = false;
          if (width) {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 36;
            const context = canvas.getContext("2d");
            context?.drawImage(video, 0, 0, 64, 36);
            const pixels = context?.getImageData(0, 0, 64, 36).data ?? new Uint8ClampedArray();
            for (let i = 0; i < pixels.length && !lit; i += 4)
              lit = (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 30;
          }
          return { width, lit };
        };
        const started = Date.now();
        const wait = () => {
          const seen = look();
          if (
            seen.lit ||
            (seen.width > 0 && Date.now() - started > 3000) ||
            Date.now() - started > 15_000
          )
            done(seen);
          else setTimeout(wait, 200);
        };
        wait();
      }),
  );
  assert.ok(shows.width > 0 || shows.lit, "A prévia da câmera ficou sem imagem.");
  if (!shows.lit) notes.push("A prévia da câmera abriu, mas a imagem da câmera estava escura.");
}

async function captureOverlay(
  target: Page | Locator,
  name: string,
  title: string,
  backgrounds: ("escuro" | "claro")[] = ["escuro", "claro"],
): Promise<void> {
  const raw = join(overlayShots, `${name}.png`);
  await target.screenshot({ path: raw, animations: "disabled", omitBackground: true });
  const header = await readFile(raw);
  const size = `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
  shotIndex++;
  for (const background of backgrounds) {
    const file = join(
      results,
      `${String(shotIndex).padStart(2, "0")}-${name}-fundo-${background}.png`,
    );
    const color = background === "escuro" ? "0x2B2D31" : "0xF3F3F3";
    await ff([
      ...["-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-i", raw],
      ...["-filter_complex", "[0:v][1:v]overlay=format=auto", "-frames:v", "1", file],
    ]);
    shots.push({ step: currentStep, title: `${title} (sobre fundo ${background})`, file });
  }
}

/** Playhead at `seconds`, by the keyboard (Home, then Shift+→ one second at a time). */
async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Home");
  for (let second = 0; second < seconds; second++) await page.keyboard.press("Shift+ArrowRight");
  await settle(page);
}

/** Autosave settles within a few seconds after an edit; a stuck pill is worth a note. */
async function savedSoon(page: Page): Promise<void> {
  const saved = await page
    .locator(".save-pill.save-saved")
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  if (!saved) notes.push(`O projeto não aparecia como salvo 10 s depois de "${currentStep}".`);
}

async function step(
  name: string,
  work: () => Promise<void>,
  allow: { text: RegExp; reason: string }[] = [],
): Promise<void> {
  currentStep = name;
  expected = allow;
  const started = Date.now();
  console.log(`[visual] ${name}`);
  try {
    await work();
    steps.push({ name, ok: true, ms: Date.now() - started });
  } catch (error) {
    steps.push({ name, ok: false, ms: Date.now() - started, error: describe(error) });
    console.error(`[visual] passo falhou: ${name}\n${describe(error)}`);
    if (lastPage && !lastPage.isClosed())
      await capture(
        lastPage,
        `falha-${shotIndex + 1}`,
        `Estado no momento da falha: ${name}`,
      ).catch((failure: unknown) =>
        notes.push(`Sem captura da falha em "${name}": ${describe(failure)}`),
      );
  } finally {
    // Late messages of this step (an IPC rejection that arrives after it) are judged by the next.
    expected = [];
  }
}

/** The lesson page of the guided mode, served on this machine only. */
function serveLesson(): Promise<{ url: string; close: () => void }> {
  const page = readFileSync(lessonFixture);
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/aula"))
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    else response.writeHead(204).end();
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      done({
        url: `http://127.0.0.1:${port}/aula?demora=0`,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    }),
  );
}

/**
 * Closes the guided mode's lesson window, found by its title (which keeps the way back to the
 * recorder whatever the page calls itself). Returns how many were closed.
 */
function closeLessonWindow(application: ElectronApplication): Promise<number> {
  return application.evaluate(({ BrowserWindow }) => {
    let closed = 0;
    for (const window of BrowserWindow.getAllWindows())
      if (window.getTitle().startsWith("EdiAula · Ambiente de aula")) {
        window.destroy();
        closed++;
      }
    return closed;
  });
}

/* ---------- synthetic media ---------- */

const ff = (args: string[]) =>
  execute(ffmpeg, ["-y", "-v", "error", "-nostdin", ...args], {
    windowsHide: true,
    timeout: 300_000,
    maxBuffer: 4 * 1024 ** 2,
  });

/** cursor.json version 2 of the screen video: a pointer that wanders over 20 s with clicks. */
function cursorData() {
  const at = (t: number): [number, number] => [
    Math.round(960 + 640 * Math.sin(t * 0.55)),
    Math.round(540 + 320 * Math.sin(t * 1.05 + 0.4)),
  ];
  const moves: [number, number, number, number][] = [];
  for (let frame = 0; frame <= 600; frame++) {
    const t = frame / 30;
    moves.push([Math.round(t * 1000) / 1000, ...at(t), 0]);
  }
  const clicks = [4, 9.5, 15].map((t): [number, number, number, number, number] => [
    t,
    ...at(t),
    0,
    0.12,
  ]);
  return {
    version: 2,
    width: 1920,
    height: 1080,
    shapes: [],
    moves,
    clicks,
    wheel: [],
    markers: [{ t: 8, kind: "marker" }],
    keys: [[12, "Ctrl+C"]],
    pauses: [],
    hidden: [],
    gaps: [],
  };
}

async function makeMedia(dir: string) {
  await mkdir(dir, { recursive: true });
  const screen = join(dir, "tela.mp4");
  await ff([
    ...["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=20"],
    ...["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=20"],
    ...["-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast"],
    ...["-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-b:a", "128k"],
    ...["-movflags", "+faststart", screen],
  ]);
  const text = join(dir, "fala.txt");
  await writeFile(text, VOICE_TEXT, "utf8");
  const spoken = join(dir, "fala-sintetizada.wav");
  await execute(
    "powershell.exe",
    [
      ...["-NoLogo", "-NoProfile", "-NonInteractive", "-File"],
      resolve("scripts/edi/speak-test-voice.ps1"),
      ...["-OutPath", spoken, "-TextPath", text],
    ],
    { windowsHide: true, timeout: 120_000, maxBuffer: 65536, env: windowsPowerShellEnvironment() },
  );
  const voice = join(dir, "voz.wav");
  await ff([
    ...["-i", spoken, "-af", "apad=whole_dur=20", "-t", "20"],
    ...["-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", voice],
  ]);
  // "HeyGen": a plain green screen with a face in the middle, saying seconds 5 to 15 of the voice.
  const face = [
    "drawbox=x=540:y=170:w=200:h=250:color=0xF1C27D:t=fill",
    "drawbox=x=580:y=250:w=30:h=22:color=0x3B2A1A:t=fill",
    "drawbox=x=670:y=250:w=30:h=22:color=0x3B2A1A:t=fill",
    "drawbox=x=595:y=350:w=90:h=16:color=0x8A3B3B:t=fill",
    "drawbox=x=490:y=430:w=300:h=290:color=0x2F4F8F:t=fill",
  ].join(",");
  const heygen = join(dir, "heygen.mp4");
  await ff([
    ...["-f", "lavfi", "-i", "color=c=0x00B140:s=1280x720:r=25:d=10"],
    ...["-ss", "5", "-t", "10", "-i", voice],
    ...["-filter_complex", `[0:v]${face}[v]`, "-map", "[v]", "-map", "1:a"],
    ...["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac"],
    ...["-shortest", heygen],
  ]);
  const cursor = join(dir, "cursor.json");
  await writeFile(cursor, JSON.stringify(cursorData()));
  return { screen, voice, heygen, cursor };
}

/* ---------- recordings folder (sessao.jsonl, src/shared/recordingJournal.ts) ---------- */

type Media = Awaited<ReturnType<typeof makeMedia>>;

const begin = (at: number) => ({
  k: "begin",
  v: 1,
  at,
  qpc: 1000,
  fps: 30,
  monitor: { x: 0, y: 0, width: 1920, height: 1080 },
  region: null,
  encoder: "libx264",
  sources: {
    screen: true,
    microphone: "Microfone (teste visual)",
    camera: null,
    system: false,
    keys: false,
  },
});
const jsonl = (lines: unknown[]): string => lines.map((line) => JSON.stringify(line)).join("\n");

/** A take that finished but never reached a project: gravacao.json plus a finalized journal. */
async function writeFinishedTake(recordings: string, media: Media): Promise<string> {
  const dir = join(recordings, "2026-10-18 09-30-00-visual1");
  await mkdir(dir, { recursive: true });
  const screen = join(dir, "tela.mp4");
  const microphone = join(dir, "microfone.wav");
  const cursor = join(dir, "cursor.json");
  await Promise.all([
    copyFile(media.screen, screen),
    copyFile(media.voice, microphone),
    copyFile(media.cursor, cursor),
  ]);
  await writeFile(
    join(dir, "sessao.jsonl"),
    `${jsonl([
      begin(Date.now() - 45 * 60_000),
      { k: "first", src: "screen", part: 0, qpc: 1500, file: "tela.mp4" },
      { k: "first", src: "mic", part: 0, qpc: 1500, file: "microfone.wav" },
      { k: "marker", qpc: 9500, kind: "marker" },
      { k: "stop", qpc: 21500 },
      { k: "finalized", qpc: 22000 },
    ])}\n`,
  );
  await writeFile(
    join(dir, "gravacao.json"),
    JSON.stringify({
      version: 2,
      dir,
      screen,
      cursor,
      microphone,
      duration: 20,
      pauses: [],
      markers: [{ t: 8, kind: "marker" }],
    }),
  );
  return dir;
}

/** A take cut short by a crash: no stop, no finalized, and a half-written last line. */
async function writeInterruptedTake(recordings: string, media: Media): Promise<string> {
  const dir = join(recordings, "2026-10-18 08-10-00-visual2");
  await mkdir(dir, { recursive: true });
  await Promise.all([
    copyFile(media.screen, join(dir, "tela-1.mp4")),
    copyFile(media.voice, join(dir, "microfone-1.wav")),
  ]);
  await writeFile(
    join(dir, "sessao.jsonl"),
    `${jsonl([
      begin(Date.now() - 2 * 3_600_000),
      { k: "first", src: "screen", part: 0, qpc: 1500, file: "tela-1.mp4" },
      { k: "first", src: "mic", part: 0, qpc: 1500, file: "microfone-1.wav" },
      { k: "health", qpc: 7500, note: "disco: 42 min livres" },
      { k: "health", qpc: 13500, note: "disco: 41 min livres" },
    ])}\n{"k":"health","qpc":14`,
  );
  return dir;
}

/* ---------- the app ---------- */

interface Session {
  application: ElectronApplication;
  editor: Page;
  launch: string;
}

function watch(application: ElectronApplication, launch: string): void {
  application.on("console", (message) => {
    if (message.type() === "error")
      record(`${launch} · processo principal`, "console.error", message.text());
  });
  const watchPage = (page: Page) => {
    const name = () => {
      const url = page.url();
      return url.startsWith("data:")
        ? "janela de acesso"
        : url.includes("#recorder")
          ? "gravador"
          : "editor";
    };
    page.on("pageerror", (error) =>
      record(`${launch} · ${name()}`, "pageerror", error.stack ?? error.message),
    );
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const where = message.location();
      record(
        `${launch} · ${name()}`,
        "console.error",
        `${message.text()}${where.url ? ` (${where.url}:${where.lineNumber})` : ""}`,
        where,
      );
    });
    page.on("crash", () => record(`${launch} · ${name()}`, "crash", "O renderer caiu."));
  };
  for (const page of application.windows()) watchPage(page);
  application.on("window", watchPage);
  application.process().stderr?.on("data", (chunk: Buffer) => {
    mainLog.push(chunk.toString("utf8"));
  });
}

/**
 * Electron's dialogs, answered from a queue the test fills before each action. Unanswered calls
 * return "canceled" and are reported: the test did not expect them.
 */
async function stubNativeDialogs(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ dialog }) => {
    const state: {
      answers: { kind: string; value: unknown }[];
      calls: { kind: string; title: string; answered: boolean }[];
    } = { answers: [], calls: [] };
    Reflect.set(globalThis, "__ediVisualDialogs", state);
    const options = (first: unknown, second: unknown): Record<string, unknown> => {
      // (window, options) or (options).
      const value = second ?? first;
      return value && typeof value === "object" ? { ...value } : {};
    };
    const take = (kind: string, opts: Record<string, unknown>): unknown => {
      const index = state.answers.findIndex((answer) => answer.kind === kind);
      const answer = index < 0 ? undefined : state.answers.splice(index, 1)[0];
      state.calls.push({
        kind,
        title: String(opts.title ?? opts.message ?? ""),
        answered: answer !== undefined,
      });
      return answer?.value;
    };
    const replace = (name: string, implementation: (...args: unknown[]) => unknown) => {
      Reflect.set(dialog, name, implementation);
      if (Reflect.get(dialog, name) !== implementation)
        throw new Error(`dialog.${name} could not be answered by the test`);
    };
    replace("showOpenDialog", async (first: unknown, second: unknown) => {
      const paths = take("open", options(first, second));
      return Array.isArray(paths)
        ? { canceled: false, filePaths: paths }
        : { canceled: true, filePaths: [] };
    });
    replace("showSaveDialog", async (first: unknown, second: unknown) => {
      const path = take("save", options(first, second));
      return typeof path === "string"
        ? { canceled: false, filePath: path }
        : { canceled: true, filePath: "" };
    });
    replace("showMessageBox", async (first: unknown, second: unknown) => {
      const opts = options(first, second);
      const response = take("message", opts);
      const cancel = typeof opts.cancelId === "number" ? opts.cancelId : 0;
      return { response: typeof response === "number" ? response : cancel, checkboxChecked: false };
    });
    replace("showErrorBox", (title: unknown, content: unknown) => {
      state.calls.push({
        kind: "error",
        title: `${String(title)}: ${String(content)}`,
        answered: false,
      });
    });
  });
}

async function answerDialog(
  session: Session,
  kind: "open" | "save" | "message",
  value: string[] | string | number,
): Promise<void> {
  await session.application.evaluate(
    (_electron, answer) => {
      const state: unknown = Reflect.get(globalThis, "__ediVisualDialogs");
      const answers: unknown =
        state && typeof state === "object" ? Reflect.get(state, "answers") : null;
      if (!Array.isArray(answers)) throw new Error("Dialog answers are not installed");
      answers.push(answer);
    },
    { kind, value },
  );
}

async function collectDialogCalls(session: Pick<Session, "application" | "launch">): Promise<void> {
  const calls = await session.application.evaluate(() => {
    const state: unknown = Reflect.get(globalThis, "__ediVisualDialogs");
    const list: unknown = state && typeof state === "object" ? Reflect.get(state, "calls") : [];
    return Array.isArray(list) ? list.map((call) => ({ ...call })) : [];
  });
  for (const call of calls) {
    const entry = {
      launch: session.launch,
      kind: String(call.kind),
      title: String(call.title),
      answered: call.answered === true,
    };
    dialogs.push(entry);
    if (!entry.answered)
      problems.push({
        step: "diálogos nativos",
        source: `${session.launch} · processo principal`,
        kind: "diálogo sem resposta",
        text: `${entry.kind}: ${entry.title}`,
      });
  }
}

/** The editor window: the file:// page that is not the recorder (the gate is a data: page). */
async function editorPage(application: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const page = application
      .windows()
      .find(
        (candidate) =>
          candidate.url().startsWith("file:") && !candidate.url().includes("#recorder"),
      );
    if (page) return page;
    if (Date.now() > deadline) throw new Error("A janela do editor não abriu em 60 s");
    await delay(250);
  }
}

async function openEditor(
  harness: Awaited<ReturnType<typeof createNativeHarness>>,
  profile: { userData: string; suiteData: string },
  launch: string,
  captureGate: boolean,
): Promise<Session> {
  await waitForMemory(`abrir o EdiAula (${launch})`);
  currentStep = `abertura do app (${launch})`;
  const application = await harness.launch("ediaula", profile);
  running.set(application, launch);
  watch(application, launch);
  await stubNativeDialogs(application);
  assert.equal(await application.evaluate(() => process.execPath), electronPath);
  const first = await application.firstWindow();
  lastPage = first;
  await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
  if ((await first.evaluate(async () => (await window.ediSuite.status()).state)) !== "licensed") {
    if (captureGate) await capture(first, "acesso-restrito", "Janela de acesso antes da licença");
    await harness.seedLease(application, LEASE_SECONDS);
  }
  const editor = await editorPage(application);
  lastPage = editor;
  await editor.waitForFunction(() => typeof window.ediSuite !== "undefined");
  await waitForStatus(editor, "licensed");
  await editor.locator("#root > *").first().waitFor();
  return { application, editor, launch };
}

async function closeApplication(application: ElectronApplication, launch: string): Promise<void> {
  running.delete(application);
  await collectDialogCalls({ application, launch }).catch((error: unknown) =>
    notes.push(`Sem a lista de diálogos nativos de ${launch}: ${describe(error)}`),
  );
  const closing = application.close().then(
    () => "closed" as const,
    (error: unknown) => {
      record(`${launch} · processo principal`, "close", describe(error));
      return "closed" as const;
    },
  );
  const outcome = await Promise.race([closing, delay(45_000).then(() => "timeout" as const)]);
  if (outcome === "timeout") {
    record(
      `${launch} · processo principal`,
      "close",
      "O EdiAula não fechou em 45 s; o teste encerrou o processo.",
    );
    application.process().kill();
    await closing;
  }
}

/** Background work done (status bar jobs), a frame on the preview and the fonts loaded. */
async function settle(page: Page, timeout = 240_000): Promise<void> {
  await page.locator(".statusbar .job").first().waitFor({ state: "detached", timeout });
  await page.waitForFunction(
    () => {
      const videos = [...document.querySelectorAll("video")].filter((video) => video.src);
      return !videos.length || videos.some((video) => video.readyState >= 2);
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

/** Toasts fade on their own; a screenshot of the panel underneath waits for them a little. */
async function withoutToasts(page: Page): Promise<void> {
  const gone = await page
    .locator(".toasts .toast")
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  if (!gone) notes.push(`Avisos ainda na tela depois de 15 s em "${currentStep}".`);
}

/* ---------- the run ---------- */

assert.ok((await stat(ffmpeg)).isFile(), "Pacote de mídia ausente: rode pnpm edi:media:build");
await rm(results, { recursive: true, force: true });
await mkdir(results, { recursive: true });
const harness = await createNativeHarness("edi-visual-", packageManager);
const overlayShots = join(harness.root, "gravador");
await mkdir(overlayShots, { recursive: true });
const runFailures: unknown[] = [];
try {
  const profile = {
    userData: join(harness.root, "user-data"),
    suiteData: join(harness.root, "suite"),
  };
  const documents = join(profile.userData, "documents");
  const recordings = join(documents, "EdiAula", "Gravações");
  const projects = join(documents, "EdiAula", "Projetos");
  const spare = join(harness.root, "reserva");
  const spareCursor = join(harness.root, "reserva-cursor");
  // The lesson packed in the first opening and opened in the second.
  const packed = join(harness.root, "exportacoes", "aula empacotada.zip");
  await mkdir(recordings, { recursive: true });
  await mkdir(spare, { recursive: true });
  await mkdir(spareCursor, { recursive: true });

  console.log("[visual] gerando mídia sintética");
  const media = await makeMedia(join(harness.root, "midia"));
  const take = await writeFinishedTake(recordings, media);

  await waitForMemory("o build do EdiAula");
  console.log("[visual] build do EdiAula com chaves efêmeras");
  await harness.build("ediaula");

  /* ----- first opening: the take, the editor, voice, HeyGen, script, export, settings,
     recorder and a failing save ----- */
  const first = await openEditor(harness, profile, "primeira abertura", true);
  const { editor } = first;
  const left = editor.locator("section.library");
  const side = editor.locator("aside.side");

  await step("Gravação que não entrou no projeto", async () => {
    const dialog = editor.getByRole("dialog", { name: "Gravação interrompida" });
    await dialog.waitFor({ state: "visible", timeout: 30_000 });
    await dialog.getByRole("heading", { name: "Gravação que não entrou no projeto" }).waitFor();
    await capture(editor, "gravacao-nao-importada", "Gravação terminada que não entrou no projeto");
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();
    await dialog.waitFor({ state: "detached", timeout: 60_000 });
    await editor.locator("fieldset.clip").nth(1).waitFor({ timeout: 60_000 });
    await settle(editor);
  });

  await step("Timeline com clipes e prévia", async () => {
    await capture(editor, "editor-gravacao-importada", "Editor logo depois de importar a gravação");
    await withoutToasts(editor);
    await capture(editor, "editor-timeline-previa", "Editor com a timeline e a prévia");
    await capture(editor.locator(".timeline-wrap"), "timeline", "Timeline com tela e voz");
    await capture(editor.locator("section.preview"), "previa", "Prévia com o cursor da gravação");
  });

  await step("Transcrição sem transcrição", async () => {
    await side.locator(".tab", { hasText: "Transcrição" }).click();
    await side.getByText("Verificando o motor de transcrição…").waitFor({ state: "detached" });
    await capture(editor, "transcricao-sem-motor", "Painel Transcrição sem transcrição");
    await capture(side, "transcricao-sem-motor-painel", "Painel Transcrição (recorte)");
  });

  await step("Áudio com a seção Voz", async () => {
    await editor.locator("nav.rail").getByRole("button", { name: "Áudio" }).click();
    await left.getByRole("heading", { name: "Voz" }).waitFor();
    await capture(editor, "audio-voz", "Painel Áudio com a seção Voz");
    await capture(left, "audio-voz-painel", "Seção Voz (recorte)");
    await left.getByRole("button", { name: "Tratar a voz" }).click();
    await left.getByText(/1 de 1 pronta/).waitFor({ timeout: 180_000 });
    await settle(editor);
    await withoutToasts(editor);
    await capture(left, "voz-tratada", "Voz tratada, com a comparação A/B desligada");
    await left.getByRole("switch", { name: "Ouvir o original" }).click();
    await capture(left, "voz-ab-original", "Comparação A/B: ouvindo o original");
    await left.getByRole("switch", { name: "Ouvir o original" }).click();
  });

  await step("Exportar a voz e importar o vídeo do apresentador", async () => {
    await left.getByRole("button", { name: "Exportar a voz" }).click();
    await left.getByText(/Última exportação: \d+ arquivo/).waitFor({ timeout: 180_000 });
    await answerDialog(first, "open", [media.heygen]);
    await left.getByRole("button", { name: "Importar vídeo do apresentador" }).click();
    await left.getByRole("button", { name: "Encaixando…" }).waitFor({ timeout: 30_000 });
    await left
      .getByRole("button", { name: "Encaixando…" })
      .waitFor({ state: "detached", timeout: 300_000 });
    await settle(editor);
    await capture(
      editor,
      "apresentador-importado",
      "Editor depois de importar o vídeo do apresentador",
    );
    await withoutToasts(editor);
    await capture(left, "apresentador-painel", "Seção Vídeo do apresentador depois da importação");
    // The import names the video after the piece of voice it matched ("Apresentador · ...").
    const presenterClips = await editor
      .locator("fieldset.clip")
      .evaluateAll((clips) => clips.map((clip) => clip.getAttribute("aria-label") ?? ""));
    assert.ok(
      presenterClips.some((label) => label.startsWith("Clipe Apresentador · ")),
      `Nenhum clipe se chama "Apresentador · ...": ${presenterClips.join(", ")}`,
    );
    // The media keeps that name and its thumbnail in the library.
    await editor.locator("nav.rail").getByRole("button", { name: "Mídia" }).click();
    await left
      .getByRole("group", { name: /^Apresentador · / })
      .locator("img")
      .waitFor({ timeout: 60_000 });
    await capture(
      left,
      "apresentador-biblioteca",
      "Biblioteca com o vídeo do apresentador, com nome e miniatura",
    );
    await editor.locator("nav.rail").getByRole("button", { name: "Áudio" }).click();
    await seek(editor, 9);
    await capture(editor, "apresentador-em-9s", "Prévia aos 9 s: tela, cursor e avatar sem fundo");
    await capture(
      editor.locator(".timeline-wrap"),
      "apresentador-timeline",
      "Timeline com o vídeo do apresentador",
    );
    await savedSoon(editor);
  });

  await step("Roteiro colado", async () => {
    await side.locator(".tab", { hasText: "Roteiro" }).click();
    await side.locator(".script-empty").waitFor();
    await capture(side, "roteiro-vazio", "Painel Roteiro antes de colar");
    await side
      .locator("textarea.script-paste")
      .fill(`${await readFile(scriptFixture, "utf8")}\n${SPEAKERS_SECTION}`);
    await side.getByRole("button", { name: "Usar roteiro" }).click();
    await side.locator(".script").waitFor();
    await settle(editor);
    await savedSoon(editor);
    await capture(editor, "roteiro-colado", "Editor com o roteiro colado");
    await capture(side, "roteiro-colado-painel", "Painel Roteiro (recorte)");
  });

  await step("Preparar aula e rascunhos", async () => {
    // A take came in: the editor offers "Preparar aula" above the timeline.
    const offer = editor.getByRole("region", { name: "Preparar aula" });
    if (await offer.isVisible())
      await capture(offer, "preparar-oferta", 'Faixa "Preparar aula" depois da gravação importada');
    else notes.push('A faixa "Preparar aula" não apareceu depois da gravação importada.');
    await editor
      .locator("header.topbar")
      .getByRole("button", { name: "Preparar aula", exact: true })
      .click();
    const panel = side.locator(".prepare");
    await panel.waitFor();
    // The test profile has no transcription engine: step 1 waits for it, and is skipped.
    await panel.getByText(/Instale o motor de transcrição/).waitFor({ timeout: 60_000 });
    await capture(editor, "preparar-inicio", "Preparar aula: as dez etapas, a primeira esperando");
    await capture(side, "preparar-painel", "Painel Preparar aula com a etapa de transcrição");
    await panel.getByRole("button", { name: "Pular", exact: true }).click();
    // Step 2: without a transcript the section is chosen by hand.
    await panel.getByRole("button", { name: /^Confirmar a seção/ }).click();
    // Step 3 is skipped (the voice went to the presenter's video before); zoom makes a draft.
    const draft = editor.getByRole("region", { name: "Rascunho para revisar" });
    await draft.waitFor({ timeout: 120_000 });
    await panel
      .getByText(/foi exportada e limpa antes de gerar o vídeo do apresentador/)
      .waitFor({ timeout: 10_000 });
    await settle(editor);
    await withoutToasts(editor);
    await capture(
      editor,
      "preparar-rascunho-zoom",
      "Rascunho do zoom automático na prévia, na timeline e na barra de revisão",
    );
    await capture(
      draft,
      "preparar-rascunho-zoom-barra",
      "Barra de revisão com os itens do rascunho",
    );
    await panel.locator(".prepare-step").nth(2).scrollIntoViewIfNeeded();
    await capture(
      side,
      "preparar-cortes-pulados",
      "Etapa de cortes pulada: a voz já foi limpa antes do vídeo do apresentador",
    );
    await draft.getByRole("button", { name: "Aplicar", exact: true }).click();
    // Annotations and captions need the transcript; the cards make the next draft.
    await draft.getByText(/Cartelas de abertura e encerramento/).waitFor({ timeout: 120_000 });
    await settle(editor);
    await capture(
      editor,
      "preparar-rascunho-cartelas",
      "Rascunho das cartelas de abertura e encerramento",
    );
    await draft.getByRole("button", { name: "Descartar", exact: true }).click();
    await draft.waitFor({ state: "detached", timeout: 30_000 });
    // Step 10: the check before exporting, with the volume measured.
    await panel
      .getByText(/para olhar antes de exportar|Nada a corrigir antes de exportar/)
      .first()
      .waitFor({ timeout: 300_000 });
    await settle(editor);
    await withoutToasts(editor);
    await capture(
      editor,
      "preparar-verificacao",
      "Preparar aula concluído, com a verificação antes de exportar",
    );
    await panel.locator(".prepare-step").last().scrollIntoViewIfNeeded();
    await capture(side, "preparar-verificacao-painel", "Etapas decididas e a lista da verificação");
    await savedSoon(editor);
  });

  await step("Seleção por retângulo", async () => {
    await withoutToasts(editor);
    const boxes = await editor.locator("fieldset.clip").evaluateAll((list) =>
      list.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const area = await editor.locator(".tl-scroll").boundingBox();
    assert.ok(area && boxes.length > 1, "a timeline with clips");
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    // From the empty background right of the clips, over all of them.
    await editor.mouse.move(Math.min(right + 60, area.x + area.width - 12), bottom + 1);
    await editor.mouse.down();
    await editor.mouse.move(area.x + 24, top + 4, { steps: 12 });
    await editor.locator(".tl-marquee").waitFor();
    await capture(
      editor.locator(".timeline-wrap"),
      "selecao-retangulo",
      "Seleção por retângulo na timeline",
    );
    await editor.mouse.up();
    assert.ok(
      (await editor.locator("fieldset.clip.is-selected").count()) > 1,
      "the rectangle selected the clips",
    );
    await side.locator(".tab", { hasText: "Propriedades" }).click();
    await side.getByText(/^Na tela:/).waitFor();
    await capture(side, "propriedades-em-lote", "Propriedades dos clipes selecionados juntos");
    await editor.keyboard.press("Escape");
  });

  await step("Propriedades numéricas, girar e espelhar", async () => {
    await editor.locator('fieldset.clip[aria-label^="Clipe Tela"]').first().click();
    await side.locator(".tab", { hasText: "Propriedades" }).click();
    const rotate = side.getByRole("textbox", { name: "Girar (°)" });
    await rotate.waitFor();
    await rotate.scrollIntoViewIfNeeded();
    await capture(side, "propriedades-numericas", "Posição e tamanho com valores digitáveis");
    await rotate.fill("12");
    await rotate.press("Enter");
    await side.getByRole("button", { name: "Espelhar na horizontal", pressed: false }).click();
    await side.getByRole("button", { name: "Espelhar na horizontal", pressed: true }).waitFor();
    assert.equal(await rotate.inputValue(), "12,0");
    await settle(editor);
    await capture(
      editor.locator("section.preview"),
      "previa-girada",
      "Prévia com o clipe girado 12° e espelhado",
    );
    await editor.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await editor.keyboard.press("Control+z");
    await editor.keyboard.press("Control+z");
    assert.equal(await rotate.inputValue(), "0,0", "both edits taken back");
    await editor.keyboard.press("Escape");
  });

  await step("Reordenar faixa", async () => {
    const order = (): Promise<string> =>
      editor
        .locator(".track-head .track-name")
        .evaluateAll((list) => list.map((el) => el.textContent).join("|"));
    const before = await order();
    const handle = editor.getByRole("button", { name: /^Mover a faixa / }).first();
    const box = await handle.boundingBox();
    assert.ok(box, "the label of the top track");
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await editor.mouse.down();
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 110, { steps: 10 });
    await editor.locator(".track-drop-line").waitFor();
    await capture(
      editor.locator(".timeline-wrap"),
      "reordenar-faixa-arrasto",
      "Arrastando o rótulo da faixa",
    );
    await editor.mouse.up();
    await editor.waitForFunction(
      (names) =>
        [...document.querySelectorAll(".track-head .track-name")]
          .map((el) => el.textContent)
          .join("|") !== names,
      before,
    );
    await capture(
      editor.locator(".timeline-wrap"),
      "reordenar-faixa",
      "Faixa no lugar novo da pilha",
    );
    // Only the move is taken back: without it, Ctrl+Z would undo an edit of an earlier step.
    await editor.keyboard.press("Control+z");
    assert.equal(await order(), before);
    // From the keyboard: Alt+↓ on the label, and the label keeps the focus for the next step.
    await handle.focus();
    await editor.keyboard.press("Alt+ArrowDown");
    await editor.waitForFunction(
      (names) =>
        [...document.querySelectorAll(".track-head .track-name")]
          .map((el) => el.textContent)
          .join("|") !== names,
      before,
    );
    assert.ok(
      await editor.evaluate(() => !!document.activeElement?.hasAttribute("data-track-tag")),
      "the moved label keeps the focus",
    );
    await editor.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await editor.keyboard.press("Control+z");
    assert.equal(await order(), before);
  });

  await step("Mudar formato", async () => {
    await editor.locator("header.topbar").getByRole("button", { name: "Arquivo" }).click();
    await editor.getByRole("menuitem", { name: "Mudar formato…" }).click();
    const dialog = editor.getByRole("dialog", { name: "Mudar formato" });
    await dialog.waitFor();
    await dialog.locator("select").selectOption("vertical30");
    await capture(dialog.locator(".modal"), "mudar-formato", "Diálogo Mudar formato");
    await dialog.getByRole("button", { name: "Mudar formato", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await settle(editor);
    await withoutToasts(editor);
    await capture(editor, "formato-vertical", "Aula levada ao formato vertical (Encaixar)");
    await editor.locator("section.preview .info-chip", { hasText: "1080×1920" }).waitFor();
    await editor.keyboard.press("Control+z");
    await editor.locator("section.preview .info-chip", { hasText: "1920×1080" }).waitFor();
    await settle(editor);
    await savedSoon(editor);
  });

  await step("Assistente, pacote da plataforma e tradução", async () => {
    // A turn of the assistant without any model: the test's main process answers assistant:send
    // with the events an engine sends, and calls a real tool of the editor (add_annotation) the
    // way the in-app engines do, so progress, cost and "O que mudou" come from the real panel.
    // ai:oneShot answers the quiz (and a translation) the same way: nothing reaches an AI.
    await first.application.evaluate(({ ipcMain }) => {
      const sim: {
        results: Map<string, (r: { ok: boolean; text: string }) => void>;
        go: (() => void) | null;
      } = { results: new Map(), go: null };
      Reflect.set(globalThis, "__ediVisualTurn", sim);
      ipcMain.removeHandler("ai:result");
      ipcMain.handle("ai:result", (_event, id: string, result: { ok: boolean; text: string }) => {
        sim.results.get(id)?.(result);
        sim.results.delete(id);
      });
      ipcMain.removeHandler("assistant:send");
      ipcMain.handle("assistant:send", async (event, conversationId: string) => {
        const send = (ev: unknown): void =>
          event.sender.send("assistant:event", conversationId, ev);
        send({ type: "text", delta: "Vou pôr um balão no farol e conferir a aula." });
        send({
          type: "tool",
          id: "t1",
          name: "mcp__ediaula__add_annotation",
          title: "Adicionar anotação",
          status: "running",
        });
        const id = crypto.randomUUID();
        const result = await new Promise<{ ok: boolean; text: string }>((resolve) => {
          sim.results.set(id, resolve);
          event.sender.send("ai:call", {
            id,
            name: "add_annotation",
            input: { kind: "balloon", text: "Olha o farol!", at: 3, duration: 4, x: 0.32, y: 0.3 },
            source: "assistant",
            projectId: conversationId,
          });
        });
        send({
          type: "tool",
          id: "t1",
          name: "",
          title: "",
          status: result.ok ? "done" : "error",
          summary: result.text.split("\n")[0],
        });
        send({
          type: "tool",
          id: "t2",
          name: "check_before_export",
          title: "Verificação antes de exportar",
          status: "running",
        });
        send({
          type: "progress",
          name: "check_before_export",
          step: "Medindo o volume da aula",
          ratio: 0.4,
        });
        await new Promise<void>((resolve) => {
          sim.go = resolve;
        });
        send({
          type: "tool",
          id: "t2",
          name: "",
          title: "",
          status: "done",
          summary: "Nada a corrigir antes de exportar.",
        });
        send({
          type: "text",
          delta: "\n\nPus um balão em 0:03 apontando para o farol e conferi a aula.",
        });
        send({ type: "usage", tokens: 18450, usd: 0.0731 });
        send({ type: "done" });
      });
      ipcMain.removeHandler("ai:oneShot");
      ipcMain.handle("ai:oneShot", async (_event, _job: string, prompt: string) => {
        if (/multiple-choice questions/.test(prompt)) {
          // Each question quotes the first words of its line, as the prompt asks.
          const lineOf = (n: number): string =>
            (new RegExp(`^${n}\\. (?:[^:]+: )?(.+)$`, "m").exec(prompt)?.[1] ?? "").replace(
              /[.,!?;:"“”]/g,
              "",
            );
          const quote = (n: number): string => lineOf(n).split(/\s+/).slice(0, 4).join(" ");
          return JSON.stringify({
            questions: [
              {
                question: "Como a aula começa?",
                options: [quote(1), "Com um mapa novo", "Com mais velocidade", "Com uma ponte"],
                correct: 0,
                line: 1,
                quote: quote(1),
              },
              {
                question: "O que vem logo depois?",
                options: [quote(2), "Desenhar o barco", "Apagar o farol", "Mudar as regras"],
                correct: 0,
                line: 2,
                quote: quote(2),
              },
            ],
          });
        }
        const data = JSON.parse(
          prompt.slice(prompt.lastIndexOf('{"cues"')).split("\n")[0] ?? "",
        ) as {
          cues: { i: number; text: string }[];
        };
        return JSON.stringify({ cues: data.cues.map((c) => ({ i: c.i, text: `EN ${c.text}` })) });
      });
    });

    await side.locator(".tab", { hasText: "Assistente" }).click();
    const panel = side.locator(".assistant");
    await panel.waitFor();
    await panel.locator(".composer-box textarea").fill("Ponha um balão no farol e confira a aula.");
    await panel.locator(".composer-box textarea").press("Enter");
    await panel.getByText("Medindo o volume da aula").waitFor({ timeout: 60_000 });
    await settle(editor);
    await capture(
      side,
      "assistente-progresso",
      "Assistente: ferramenta em andamento, com a etapa e a porcentagem",
    );
    await first.application.evaluate(() => {
      const sim: unknown = Reflect.get(globalThis, "__ediVisualTurn");
      const go: unknown = sim && typeof sim === "object" ? Reflect.get(sim, "go") : null;
      if (typeof go !== "function")
        throw new Error("O turno simulado não chegou à ferramenta lenta");
      go();
    });
    await panel.getByText("O que mudou").waitFor({ timeout: 60_000 });
    await settle(editor);
    await withoutToasts(editor);
    await capture(
      side,
      "assistente-o-que-mudou",
      'Assistente: custo do pedido e "O que mudou", com Ir até e Desfazer',
    );
    await capture(editor, "assistente-editor", "Editor com o balão que o pedido pôs na aula");

    // The platform: the quiz made by the (simulated) engine, the thumbnail and the translations.
    const card = panel.locator(".publish");
    if (!(await card.getByText("Quiz", { exact: true }).isVisible()))
      await card.locator(".publish-head").click();
    await card.getByRole("button", { name: "Gerar quiz" }).click();
    await card.locator(".quiz-list li").nth(1).waitFor({ timeout: 60_000 });
    // Only the reviewed question goes into the package.
    await card.locator(".quiz-list li").first().getByLabel("Revisada").check();
    await seek(editor, 6);
    await card.getByRole("button", { name: "Usar o quadro atual" }).click();
    await card.getByText(/Quadro de/).waitFor();
    await settle(editor);
    await withoutToasts(editor);
    // The card is taller than the panel: its top and its quiz and thumbnail, each in view.
    await card.locator(".publish-head").scrollIntoViewIfNeeded();
    await capture(
      side,
      "plataforma-cartao",
      "Publicação e plataforma: código do vídeo, título e capítulos",
    );
    await card.locator(".quiz-list").scrollIntoViewIfNeeded();
    await capture(side, "plataforma-quiz", "Quiz conferido, miniatura escolhida e traduções");
    await card.getByRole("button", { name: "Traduzir…" }).click();
    const translate = editor.getByRole("dialog", { name: "Traduzir as legendas" });
    await translate.waitFor();
    await translate
      .getByText("Contando as legendas…")
      .waitFor({ state: "detached", timeout: 30_000 });
    await capture(translate.locator(".modal"), "traducao-dialogo", "Diálogo Traduzir as legendas");
    await translate.getByRole("button", { name: "Cancelar" }).click();
    await translate.waitFor({ state: "detached" });
    await savedSoon(editor);
  });

  await step("Exportar e fila de exportação", async () => {
    await editor
      .locator("header.topbar")
      .getByRole("button", { name: "Exportar", exact: true })
      .click();
    const dialog = editor.getByRole("dialog", { name: "Exportar aula" });
    await dialog.waitFor();
    const check = dialog.locator(".export-check");
    await check.getByText("Conferindo a aula…").waitFor({ state: "detached", timeout: 60_000 });
    await capture(editor, "exportar", "Diálogo Exportar aula");
    await capture(dialog.locator(".modal"), "exportar-dialogo", "Diálogo Exportar aula (recorte)");
    await check.getByRole("button", { name: "Medir o volume" }).click();
    await check.getByRole("button", { name: "Medir de novo" }).waitFor({ timeout: 300_000 });
    await capture(
      check,
      "exportar-verificacao",
      "Verificação antes de exportar, com o volume medido",
    );
    await mkdir(join(harness.root, "exportacoes"), { recursive: true });
    await answerDialog(first, "save", join(harness.root, "exportacoes", "aula visual.mp4"));
    await dialog.getByRole("button", { name: /^Adicionar/ }).click();
    const queue = editor.getByRole("dialog", { name: "Fila de exportação" });
    await queue.waitFor();
    await capture(queue.locator(".modal"), "fila-exportando", "Fila de exportação em andamento");
    await queue.getByText("Concluído").waitFor({ timeout: 600_000 });
    await capture(queue.locator(".modal"), "fila-concluida", "Fila de exportação concluída");
    // The package for the platform went beside the video, with the hash of the file written.
    const exported = join(harness.root, "exportacoes");
    const pack = JSON.parse(
      await readFile(join(exported, "aula visual.plataforma.json"), "utf8"),
    ) as {
      videoId?: string;
      quiz: unknown[];
      thumbnail?: { file: string; time: number };
      captions: unknown[];
      video: { file: string; sha256: string };
    };
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256")
      .update(await readFile(join(exported, "aula visual.mp4")))
      .digest("hex");
    assert.equal(pack.video.sha256, hash, "o SHA-256 do pacote é o do vídeo exportado");
    assert.equal(pack.video.file, "aula visual.mp4");
    assert.equal(pack.quiz.length, 1, "só a pergunta revisada vai para o pacote");
    notes.push(
      `Pacote da plataforma: vídeo ${pack.videoId ?? "sem código"}, ${pack.quiz.length === 1 ? "1 pergunta revisada" : `${pack.quiz.length} perguntas revisadas`}, miniatura ${pack.thumbnail ? `${pack.thumbnail.file} em ${pack.thumbnail.time} s` : "ausente"}, ${pack.captions.length} conjuntos de legenda, SHA-256 conferido (${hash.slice(0, 12)}…).`,
    );
    await queue.getByRole("button", { name: "Fechar fila e continuar editando" }).click();
    await queue.waitFor({ state: "detached" });
  });

  await step("Revisar cortes", async () => {
    const clips = editor.locator("fieldset.clip");
    const playheadX = async (): Promise<number> => {
      const box = await editor.locator(".timeline-wrap .playhead").boundingBox();
      assert.ok(box, "Sem o indicador de reprodução na timeline");
      return box.x + box.width / 2;
    };
    /** A cut by hand on every track: split at both ends, delete the stretch, close the gap. */
    const cutByHand = async (from: number, to: number): Promise<void> => {
      await editor.keyboard.press("Escape");
      await seek(editor, from);
      const x0 = await playheadX();
      await editor.keyboard.press("s");
      await seek(editor, to);
      const x1 = await playheadX();
      await editor.keyboard.press("s");
      await settle(editor);
      const inside = await clips.evaluateAll(
        (list, { a, b }) =>
          list.flatMap((clip, i) => {
            const r = clip.getBoundingClientRect();
            return Math.abs(r.left - a) < 4 && Math.abs(r.right - b) < 4 ? [i] : [];
          }),
        { a: x0, b: x1 },
      );
      assert.ok(inside.length, `Nenhum pedaço entre ${from} s e ${to} s depois de dividir`);
      for (const [n, i] of inside.entries())
        await clips.nth(i).click({ modifiers: n ? ["Control"] : [] });
      await editor.keyboard.press("Delete");
      await editor
        .locator("header.topbar")
        .getByRole("button", { name: "Editar", exact: true })
        .click();
      await editor.getByRole("menuitem", { name: "Fechar todas as lacunas" }).click();
      await settle(editor);
    };
    // Two cuts where the presenter is not on screen (it plays from 5 s to 15 s, and from 3 s on
    // after the first cut).
    await cutByHand(1, 3);
    await cutByHand(14, 15);
    await editor.keyboard.press("Escape");
    await editor
      .locator("header.topbar")
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await editor.getByRole("menuitem", { name: "Revisar cortes" }).click();
    const bar = editor.getByRole("region", { name: "Revisar cortes" });
    await bar
      .getByText(/0 de 2 aprovados · corte em 0:01, tirou 2,0 s/)
      .waitFor({ timeout: 30_000 });
    await settle(editor);
    await capture(
      editor,
      "revisar-cortes",
      "Revisar cortes: o primeiro corte, com as emendas marcadas",
    );
    await capture(bar, "revisar-cortes-barra", "Barra de Revisar cortes no primeiro corte");
    await capture(
      editor.locator(".timeline-wrap"),
      "revisar-cortes-timeline",
      "Timeline com as emendas marcadas durante a revisão",
    );
    // Enter approves the first; the second is brought back with Backspace.
    await editor.keyboard.press("Enter");
    await bar
      .getByText(/1 de 2 aprovados · corte em 0:14, tirou 1,0 s/)
      .waitFor({ timeout: 30_000 });
    await capture(bar, "revisar-cortes-segundo", "O primeiro aprovado, o segundo esperando");
    await editor.keyboard.press("Backspace");
    await bar.getByText(/nenhum corte pendente/).waitFor({ timeout: 30_000 });
    await settle(editor);
    await capture(editor, "revisar-cortes-restaurado", "Trecho restaurado e revisão concluída");
    await capture(
      editor.locator(".timeline-wrap"),
      "revisar-cortes-restaurado-timeline",
      "Timeline depois de restaurar o segundo corte",
    );
    await bar.getByRole("button", { name: "Sair", exact: true }).click();
    await bar.waitFor({ state: "detached", timeout: 10_000 });
    await savedSoon(editor);
  });

  await step("Template e anotações com a letra de 36 px", async () => {
    // Templates and new annotations start at 36 px in 1080p (the check warns under 3,3%): how
    // they look with it.
    await seek(editor, 4);
    await editor.locator("nav.rail").getByRole("button", { name: "Templates" }).click();
    const question = left.locator(".tpl-card", { hasText: "Pergunta" });
    await question.locator(".tpl-head").click();
    await question
      .getByLabel("Alternativas (uma por linha)")
      .fill(["Repetir 3 vezes", "Se o farol estiver apagado", "Acender o farol"].join("\n"));
    const insert = question.getByRole("button", { name: "Inserir", exact: true });
    await insert.click();
    await insert.waitFor({ timeout: 60_000 });
    await settle(editor);
    await seek(editor, 7);
    await withoutToasts(editor);
    await capture(
      editor.locator("section.preview"),
      "template-pergunta",
      "Template Pergunta com as alternativas, letra de 36 px",
    );
    await seek(editor, 12);
    await editor.locator("nav.rail").getByRole("button", { name: "Anotações" }).click();
    await left.getByRole("button", { name: /^Balão/ }).click();
    await settle(editor);
    await seek(editor, 15);
    await left.getByRole("button", { name: /^Nota/ }).click();
    await settle(editor);
    await editor.keyboard.press("Escape");
    await seek(editor, 13);
    await withoutToasts(editor);
    await capture(
      editor.locator("section.preview"),
      "anotacao-balao-36",
      "Balão novo, com a letra de 36 px",
    );
    await seek(editor, 16);
    await capture(
      editor.locator("section.preview"),
      "anotacao-nota-36",
      "Nota nova, com a letra de 36 px",
    );
    await savedSoon(editor);
  });

  /* ----- Lote 13: groups, markers, region effects, envelope, library, range, frame, zip ----- */

  await step("Grupos", async () => {
    await withoutToasts(editor);
    // The template's layers came in as one group: one click picks all of them.
    const grouped = editor.locator("fieldset.clip.is-grouped");
    await grouped.first().waitFor();
    const count = await grouped.count();
    assert.ok(count > 1, "the template's layers are grouped");
    await grouped.first().click();
    assert.equal(await editor.locator("fieldset.clip.is-grouped.is-selected").count(), count);
    await capture(
      editor.locator(".timeline-wrap"),
      "grupos-template",
      "Camadas do template num grupo: um clique seleciona todas",
    );
    // Ctrl+Shift+G undoes the group and Ctrl+Z brings it back.
    await editor.keyboard.press("Control+Shift+G");
    await grouped.first().waitFor({ state: "detached" });
    await editor.keyboard.press("Control+z");
    await grouped.first().waitFor();
    await editor.keyboard.press("Escape");
    // Two clips of the take grouped by hand.
    await editor.locator('fieldset.clip[aria-label^="Clipe Tela"]').first().click();
    await editor
      .locator("fieldset.clip.clip-audio")
      .first()
      .click({ modifiers: ["Control"] });
    await editor.keyboard.press("Control+g");
    await editor.locator("fieldset.clip.clip-audio.is-grouped").first().waitFor();
    await settle(editor);
    await capture(
      editor.locator(".timeline-wrap"),
      "grupos-tela-e-voz",
      "Tela e voz agrupadas com Ctrl+G (borda verde e o ícone de corrente)",
    );
    await editor.keyboard.press("Control+z");
    await editor.keyboard.press("Escape");
  });

  await step("Marcadores", async () => {
    await seek(editor, 2);
    await editor.keyboard.press("m");
    await seek(editor, 9);
    await editor.keyboard.press("m");
    const flags = editor.locator(".marker-flag");
    await flags.nth(1).waitFor();
    await flags.nth(1).click({ button: "right" });
    await editor.getByRole("menuitem", { name: "Começar um capítulo aqui" }).click();
    await editor.locator(".marker-flag.is-chapter").waitFor();
    // Shift+M goes to the next marker.
    await editor.keyboard.press("Home");
    await editor.keyboard.press("Shift+M");
    await editor.keyboard.press("Escape");
    await side.locator(".tab", { hasText: "Propriedades" }).click();
    await side.getByRole("heading", { name: "Marcadores e capítulos" }).waitFor();
    await settle(editor);
    await capture(
      editor.locator(".timeline-wrap"),
      "marcadores-timeline",
      "Marcadores na régua; o segundo começa um capítulo",
    );
    await side.getByRole("heading", { name: "Marcadores e capítulos" }).scrollIntoViewIfNeeded();
    await capture(side, "marcadores-propriedades", "Marcadores e capítulos em Propriedades");
    await savedSoon(editor);
  });

  await step("Desfoque de região", async () => {
    await seek(editor, 6);
    await editor.locator("nav.rail").getByRole("button", { name: "Zoom" }).click();
    await editor
      .locator("section.rail-panel")
      .getByRole("button", { name: "Desfoque", exact: true })
      .click();
    await editor.locator(".region-target").waitFor();
    await side.getByRole("heading", { name: "Efeito de região" }).waitFor();
    await settle(editor);
    await withoutToasts(editor);
    await capture(
      editor.locator("section.preview"),
      "desfoque-regiao",
      "Desfoque de região na prévia, com o retângulo para mover",
    );
    await capture(side, "desfoque-regiao-propriedades", "Propriedades do efeito de região");
    await side.getByRole("button", { name: "Holofote", exact: true }).click();
    await settle(editor);
    await capture(
      editor.locator("section.preview"),
      "holofote-regiao",
      "Holofote: o resto da tela escurece em volta do retângulo",
    );
    await side.getByRole("button", { name: "Pixelado", exact: true }).click();
    await settle(editor);
    await capture(
      editor.locator("section.preview"),
      "pixelado-regiao",
      "Região pixelada na prévia",
    );
    // The blur stays in the lesson: the export of the interval below draws it too.
    await side.getByRole("button", { name: "Desfoque", exact: true }).click();
    await editor.keyboard.press("Escape");
    await editor.locator("nav.rail").getByRole("button", { name: "Mídia" }).click();
    await savedSoon(editor);
  });

  await step("Envelope de volume", async () => {
    // The piece of the voice under the playhead at 3 s (the cleanup cut it in pieces).
    await seek(editor, 3);
    const head = await editor.locator(".timeline-wrap .playhead").boundingBox();
    assert.ok(head, "the playhead");
    const x = head.x + head.width / 2;
    const voices = editor.locator("fieldset.clip.clip-audio");
    let picked = -1;
    let box: { x: number; y: number; width: number; height: number } | null = null;
    for (let i = 0; i < (await voices.count()) && picked < 0; i++) {
      box = await voices.nth(i).boundingBox();
      if (box && box.x < x - 16 && box.x + box.width > x + 30) picked = i;
    }
    assert.ok(picked >= 0 && box, "a piece of the voice under the playhead");
    // Beside the playhead, whose line takes the clicks on it.
    await voices.nth(picked).click({ position: { x: x - box.x - 12, y: 8 } });
    await side.locator(".tab", { hasText: "Propriedades" }).click();
    await side.getByRole("button", { name: "Ponto no cursor" }).click();
    // Half a second later, still inside the piece.
    for (let i = 0; i < 15; i++) await editor.keyboard.press("ArrowRight");
    await side.getByRole("button", { name: "Ponto no cursor" }).click();
    const points = editor.locator(".gain-envelope .gain-point");
    await points.nth(1).waitFor();
    // The second point dragged down: the voice gets softer after it. The playhead goes away
    // first: its line is over the point just made there.
    await editor.keyboard.press("Home");
    const point = await points.nth(1).boundingBox();
    assert.ok(point, "the envelope's second point");
    await editor.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
    await editor.mouse.down();
    await editor.mouse.move(point.x + point.width / 2, point.y + point.height / 2 + 18, {
      steps: 6,
    });
    await editor.mouse.up();
    await settle(editor);
    await capture(
      editor.locator(".timeline-wrap"),
      "envelope-volume",
      "Envelope de volume no clipe da voz, com dois pontos",
    );
    await capture(
      side.locator(".props-section", { hasText: "Volume ao longo do clipe" }),
      "envelope-volume-propriedades",
      "Volume ao longo do clipe e Separar áudio",
    );
    await editor.keyboard.press("Escape");
    await savedSoon(editor);
  });

  await step("Biblioteca entre projetos", async () => {
    // A favorite style: the pointer of the recording.
    await editor.locator('fieldset.clip[aria-label^="Clipe Tela"]').first().click();
    await side.locator(".tab", { hasText: "Propriedades" }).click();
    const cursor = side
      .locator(".props-section")
      .filter({ has: editor.getByRole("heading", { name: "Cursor", exact: true }) });
    await cursor.getByRole("button", { name: "Favoritar estilo" }).click();
    const name = side.getByRole("textbox", { name: "Nome do estilo favorito" });
    await name.fill("Cursor do curso");
    await name.press("Enter");
    await editor.keyboard.press("Escape");
    // A media kept for every lesson.
    const card = left.locator("fieldset.media-card").first();
    await card.hover();
    await card.getByRole("button", { name: /^Salvar .* na biblioteca$/ }).click();
    await left.getByRole("button", { name: "Todas as aulas", exact: true }).click();
    await left.locator(".shared-row").nth(1).waitFor();
    await withoutToasts(editor);
    await capture(
      left,
      "biblioteca-todas-as-aulas",
      "Biblioteca de todas as aulas: mídia e estilo favorito",
    );
    await left.getByRole("button", { name: "Desta aula", exact: true }).click();
  });

  await step("Exportar intervalo e quadro", async () => {
    await seek(editor, 2);
    const end = editor.getByRole("button", { name: "Fim do intervalo" });
    const box = await end.boundingBox();
    assert.ok(box, "the interval's end handle");
    // With no interval yet the handle sits under the playhead's line, which takes the clicks:
    // the press goes to the handle itself, and the drag is the real mouse.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await editor.mouse.move(cx, cy);
    await end.dispatchEvent("pointerdown", {
      button: 0,
      buttons: 1,
      clientX: cx,
      clientY: cy,
      pointerId: 1,
      isPrimary: true,
    });
    await editor.mouse.move(cx + 160, cy, { steps: 8 });
    await editor.mouse.up();
    await editor.locator(".tl-interval-info").waitFor();
    await editor
      .locator("header.topbar")
      .getByRole("button", { name: "Exportar", exact: true })
      .click();
    const dialog = editor.getByRole("dialog", { name: "Exportar aula" });
    await dialog.waitFor();
    await dialog.getByRole("switch", { name: "Só o intervalo marcado" }).click();
    await dialog.getByRole("switch", { name: "Só o intervalo marcado", checked: true }).waitFor();
    await dialog.getByText("Conferindo a aula…").waitFor({ state: "detached", timeout: 60_000 });
    await capture(
      dialog.locator(".modal"),
      "exportar-intervalo",
      "Exportar só o intervalo marcado",
    );
    // The current frame as a PNG.
    const frame = join(harness.root, "exportacoes", "quadro atual.png");
    await answerDialog(first, "save", frame);
    await dialog.getByRole("button", { name: "Quadro atual (PNG)" }).click();
    await editor.getByText(/^Quadro salvo em/).waitFor({ timeout: 120_000 });
    assert.ok((await stat(frame)).size > 1000, "the PNG of the frame");
    // The interval itself, through the queue.
    const stretch = join(harness.root, "exportacoes", "trecho.mp4");
    await answerDialog(first, "save", stretch);
    await dialog.getByRole("button", { name: /^Adicionar/ }).click();
    const queue = editor.getByRole("dialog", { name: "Fila de exportação" });
    await queue.waitFor();
    // The exports done before stay listed: this one is the next "Concluído".
    const done = await queue.getByText("Concluído").count();
    await queue.getByText("Concluído").nth(done).waitFor({ timeout: 600_000 });
    await queue.getByRole("button", { name: "Fechar fila e continuar editando" }).click();
    await queue.waitFor({ state: "detached" });
    const probe = await execute(
      join(nativeMediaDirectory, "bin", "ffprobe.exe"),
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", stretch],
      { windowsHide: true, timeout: 60_000, maxBuffer: 65536 },
    );
    const length = Number(String(probe.stdout).trim());
    notes.push(`Intervalo exportado: ${length.toFixed(2)} s em ${stretch}.`);
    await editor.getByTitle("Limpar intervalo").click();
  });

  await step("Projeto em zip", async () => {
    await answerDialog(first, "save", packed);
    await editor.locator("header.topbar").getByRole("button", { name: "Arquivo" }).click();
    await editor.getByRole("menuitem", { name: "Empacotar a aula com as mídias…" }).click();
    await editor.getByText(/^Aula empacotada com/).waitFor({ timeout: 120_000 });
    await capture(editor, "projeto-zip", "Aula empacotada com as mídias num .zip");
    assert.ok((await stat(packed)).size > 100_000, "the package holds the media");
    await withoutToasts(editor);
  });

  await step("Configurações e IA", async () => {
    await editor.getByRole("button", { name: "Configurações de IA" }).click();
    const dialog = editor.getByRole("dialog", { name: "Configurações" });
    await dialog.waitFor();
    await dialog.getByText("Procurando…").first().waitFor({ state: "detached", timeout: 60_000 });
    await capture(editor, "configuracoes-ia", "Configurações de IA");
    const pages = await dialog.evaluate((root) => {
      const scroller = [root, ...root.querySelectorAll("*")].find(
        (element) =>
          element.scrollHeight > element.clientHeight + 4 &&
          /auto|scroll/.test(getComputedStyle(element).overflowY),
      );
      if (!scroller) return 1;
      scroller.setAttribute("data-visual-scroller", "");
      return Math.min(6, Math.ceil(scroller.scrollHeight / (scroller.clientHeight * 0.9)));
    });
    for (let index = 0; index < pages; index++) {
      await dialog.evaluate((root, at) => {
        const scroller = root.querySelector("[data-visual-scroller]") ?? root;
        scroller.scrollTop = at * scroller.clientHeight * 0.9;
      }, index);
      await capture(
        dialog.locator(".modal"),
        `configuracoes-ia-parte-${index + 1}`,
        `Configurações de IA, parte ${index + 1} de ${pages}`,
      );
    }
    await editor.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
  });

  await step("Gravador nos quatro modos", async () => {
    const opened = first.application.waitForEvent("window");
    await editor.locator("header.topbar").getByRole("button", { name: "Gravar tela" }).click();
    const overlay = await opened;
    lastPage = overlay;
    await overlay.locator(".rec-dock").waitFor({ timeout: 30_000 });
    const encoderKnown = await overlay
      .getByText("Testando o codificador nesta tela…")
      .waitFor({ state: "detached", timeout: 60_000 })
      .then(
        () => true,
        () => false,
      );
    if (!encoderKnown) notes.push("O gravador ainda testava o codificador depois de 60 s.");
    const microphone = overlay.getByRole("group", { name: "Microfone" }).locator("select");
    const devices = await microphone
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option instanceof HTMLOptionElement ? option.value : "")),
      );
    const device = devices.find(Boolean);
    if (device) {
      await microphone.selectOption(device);
      await overlay.locator(".rec-meter").first().waitFor({ timeout: 15_000 });
    } else notes.push("Nenhum microfone listado: o medidor de nível não aparece no gravador.");
    await captureOverlay(overlay, "gravador-tela", "Gravador no modo Tela, com o teleprompter");
    await captureOverlay(
      overlay.locator(".rec-dock"),
      "gravador-tela-controles",
      "Controles e medidor do modo Tela",
      ["escuro"],
    );
    await captureOverlay(overlay.locator(".tp"), "gravador-teleprompter", "Teleprompter", [
      "escuro",
    ]);
    await overlay.getByTitle("Opções do gravador").click();
    await captureOverlay(overlay, "gravador-opcoes", "Gravador com o painel de opções");
    await overlay.getByTitle("Opções do gravador").click();
    // The modes in the order the teacher meets them.
    assert.deepEqual(
      await overlay
        .locator("#recording-mode option")
        .evaluateAll((options) =>
          options.map((option) => (option instanceof HTMLOptionElement ? option.value : "")),
        ),
      ["screen", "voice", "voicecam", "over", "guided"],
    );
    /** The sources each mode offers: shown, or not there at all. */
    const sourcesShown = async (expected: Record<string, boolean>): Promise<void> => {
      for (const [name, shown] of Object.entries(expected))
        assert.equal(
          await overlay.getByRole("group", { name, exact: true }).count(),
          shown ? 1 : 0,
          `${name} ${shown ? "deveria" : "não deveria"} aparecer no modo ${await overlay.locator("#recording-mode").inputValue()}`,
        );
    };
    const pcAudio = overlay
      .getByRole("group", { name: "Áudio do PC", exact: true })
      .locator("select");
    // Tela: microphone, camera and the computer's sound, turned on and off again without errors.
    await sourcesShown({ Microfone: true, Câmera: true, "Áudio do PC": true });
    await pcAudio.selectOption("on");
    await captureOverlay(
      overlay.locator(".rec-dock"),
      "gravador-tela-audio-do-pc",
      "Modo Tela com o áudio do PC ligado",
      ["escuro", "claro"],
    );
    await pcAudio.selectOption("off");
    await overlay.locator("#recording-mode").selectOption("voice");
    await overlay.locator(".vp-wrap").waitFor();
    await sourcesShown({ Microfone: true, Câmera: false, "Áudio do PC": false });
    await captureOverlay(overlay, "gravador-so-voz", "Gravador no modo Só voz");
    await captureOverlay(
      overlay.locator(".rec-dock"),
      "gravador-so-voz-controles",
      "Controles do modo Só voz, com o teste do microfone",
      ["escuro"],
    );
    await overlay.locator("#recording-mode").selectOption("voicecam");
    await overlay.locator(".vp-wrap").waitFor();
    await sourcesShown({ Microfone: true, Câmera: true, "Áudio do PC": false });
    await captureOverlay(
      overlay,
      "gravador-voz-e-camera",
      "Gravador no modo Voz e câmera, antes de escolher a câmera",
    );
    // With a camera of this machine, the preview shows where the presenter will be.
    const cameraSelect = overlay
      .getByRole("group", { name: "Câmera", exact: true })
      .locator("select")
      .first();
    const camera = (
      await cameraSelect
        .locator("option")
        .evaluateAll((options) =>
          options.map((option) => (option instanceof HTMLOptionElement ? option.value : "")),
        )
    ).find(Boolean);
    if (camera) {
      await cameraSelect.selectOption(camera);
      await cameraPreviewShows(overlay, ".rec-cam.is-presenter video");
      await captureOverlay(
        overlay,
        "gravador-voz-e-camera-previa",
        "Gravador no modo Voz e câmera, com a prévia da câmera",
        ["escuro"],
      );
      await cameraSelect.selectOption("");
    } else notes.push("Nenhuma câmera listada: a prévia do modo Voz e câmera não foi capturada.");
    await captureOverlay(
      overlay.locator(".rec-dock"),
      "gravador-voz-e-camera-controles",
      "Controles do modo Voz e câmera",
      ["escuro"],
    );
    await overlay.locator("#recording-mode").selectOption("over");
    await overlay.locator(".karaoke").waitFor();
    // Over the narration the microphone and the computer's sound start off.
    await sourcesShown({ Microfone: true, "Áudio do PC": true });
    assert.equal(
      await overlay
        .getByRole("group", { name: "Microfone", exact: true })
        .locator("select")
        .inputValue(),
      "",
    );
    assert.equal(await pcAudio.inputValue(), "off");
    await captureOverlay(
      overlay,
      "gravador-sobre-narracao",
      "Gravador no modo Tela sobre a narração",
    );
    await overlay.locator("#recording-mode").selectOption("screen");
    const closed = overlay.waitForEvent("close");
    await overlay.getByTitle("Fechar sem gravar").click();
    await closed;
    lastPage = editor;
  });

  await step("Gravador no modo guiado", async () => {
    const lessonSite = await serveLesson();
    let overlay: Page | null = null;
    try {
      const opened = first.application.waitForEvent("window");
      await editor.locator("header.topbar").getByRole("button", { name: "Gravar tela" }).click();
      overlay = await opened;
      lastPage = overlay;
      await overlay.locator(".rec-dock").waitFor({ timeout: 30_000 });
      await overlay.locator("#recording-mode").selectOption("guided");
      const setup = overlay.locator(".guided-setup");
      await setup.waitFor();
      const create = setup.getByRole("button", { name: "Criar um plano" });
      if (await create.isVisible()) await create.click();
      await setup
        .getByRole("combobox", { name: "Onde a demonstração acontece" })
        .selectOption("web");
      await setup.getByRole("textbox", { name: "Endereço da aula" }).fill(lessonSite.url);
      await setup
        .getByRole("textbox", { name: "Roteiro da demonstração" })
        .fill(
          [
            "Clique em Começar.",
            "Arraste o bloco mover para baixo do bloco amarelo.",
            "Dê um nome ao projeto e clique em Salvar.",
          ].join("\n"),
        );
      await setup.getByRole("button", { name: "Criar etapas do roteiro" }).click();
      await setup.getByRole("textbox", { name: "Fala da etapa 3" }).waitFor();
      await captureOverlay(
        overlay,
        "gravador-guiado",
        "Gravador no modo guiado, com o plano e as etapas",
      );
      await captureOverlay(setup, "gravador-guiado-plano", "Plano guiado (recorte)", ["escuro"]);
      const fps = setup.getByRole("combobox", { name: "Quadros por segundo" });
      await fps.selectOption("60");
      await setup.locator(".guided-warning").waitFor();
      await captureOverlay(
        setup,
        "gravador-guiado-60-quadros",
        "Plano a 60 quadros, com o aviso de custo",
        ["escuro"],
      );
      await fps.selectOption("30");
      const lessonOpened = first.application.waitForEvent("window");
      await setup.getByRole("button", { name: "Abrir janela da aula" }).click();
      const lesson = await lessonOpened;
      await lesson.getByRole("button", { name: "Começar" }).waitFor({ timeout: 30_000 });
      await capture(lesson, "janela-da-aula", "Janela da aula com a página local");
      await lesson.getByRole("button", { name: "Começar" }).click();
      await lesson.locator("#editor.open").waitFor({ timeout: 15_000 });
      await capture(lesson, "janela-da-aula-blocos", "Janela da aula com os blocos abertos");
      const lessonClosed = lesson.waitForEvent("close", { timeout: 15_000 });
      assert.equal(
        await closeLessonWindow(first.application),
        1,
        "A janela da aula perdeu o título com o atalho de volta ao gravador",
      );
      await lessonClosed;
      await setup.getByRole("combobox", { name: "Plano guiado" }).waitFor();
      await captureOverlay(
        overlay,
        "gravador-guiado-depois-da-aula",
        "Gravador no modo guiado depois de fechar a janela da aula",
        ["escuro"],
      );
      await overlay.locator("#recording-mode").selectOption("screen");
      const closed = overlay.waitForEvent("close");
      await overlay.getByTitle("Fechar sem gravar").click();
      await closed;
    } finally {
      lessonSite.close();
      // Whatever failed on the way, neither window is left over the editor.
      await closeLessonWindow(first.application).catch((error: unknown) =>
        notes.push(`A janela da aula não fechou: ${describe(error)}`),
      );
      if (overlay && !overlay.isClosed()) {
        const left = overlay;
        await (async () => {
          const closed = left.waitForEvent("close");
          await left.getByTitle("Fechar sem gravar").click();
          await closed;
        })().catch((error: unknown) =>
          notes.push(`O gravador não fechou depois do modo guiado: ${describe(error)}`),
        );
      }
      lastPage = editor;
    }
  });

  await step("Telas em 1366 × 768", async () => {
    // A common notebook: the editor window at 1366 × 768, and the recorder over a screen that size.
    const sizeWindows = (recorder: boolean, size: { width: number; height: number } | null) =>
      first.application.evaluate(
        ({ BrowserWindow }, { recorder, size }) => {
          for (const window of BrowserWindow.getAllWindows()) {
            const url = window.webContents.getURL();
            if (!url.startsWith("file:") || url.includes("#recorder") !== recorder) continue;
            if (!size) {
              window.maximize();
              continue;
            }
            window.unmaximize();
            const { x, y } = window.getBounds();
            window.setBounds({ x, y, ...size });
          }
        },
        { recorder, size },
      );
    const small = { width: 1366, height: 768 };
    /** Nothing in `scope` sticks out of its box (text cut off without an ellipsis, or a control
     *  past the edge of the window). */
    const overflow = (page: Page) =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>(
          "button, select, .rec-src, .badge, h2, h3, .modal, .rec-dock, .rec-keys",
        )) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (box.right > window.innerWidth + 1 || box.left < -1)
            out.push(
              `${element.tagName.toLowerCase()} "${element.textContent?.trim().slice(0, 40)}" sai da janela`,
            );
        }
        return out;
      });
    await sizeWindows(false, small);
    try {
      await editor.waitForFunction(() => window.innerWidth <= 1366);
      await settle(editor);
      await capture(editor, "1366-editor", "Editor com a timeline em 1366 × 768");
      await editor.locator("nav.rail").getByRole("button", { name: "Mídia" }).click();
      await capture(editor, "1366-biblioteca", "Biblioteca em 1366 × 768");
      await editor.locator("nav.rail").getByRole("button", { name: "Áudio" }).click();
      await left.getByRole("heading", { name: "Voz" }).waitFor();
      await capture(editor, "1366-voz", "Seção Voz em 1366 × 768");
      notes.push(...(await overflow(editor)).map((text) => `1366 × 768, editor: ${text}.`));
      await editor
        .locator("header.topbar")
        .getByRole("button", { name: "Exportar", exact: true })
        .click();
      const dialog = editor.getByRole("dialog", { name: "Exportar aula" });
      await dialog.waitFor();
      await dialog
        .locator(".export-check")
        .getByText("Conferindo a aula…")
        .waitFor({ state: "detached", timeout: 60_000 });
      await capture(editor, "1366-exportar", "Diálogo Exportar em 1366 × 768");
      notes.push(...(await overflow(editor)).map((text) => `1366 × 768, Exportar: ${text}.`));
      await editor.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // The section with four speakers goes to the recorder's teleprompter.
      await side.locator(".tab", { hasText: "Roteiro" }).click();
      const sections = side.locator(".script-head select");
      const sectionBefore = await sections.inputValue();
      await sections.selectOption({ label: "Seção 7 · Conversa com os amigos" });
      const opened = first.application.waitForEvent("window");
      await editor.locator("header.topbar").getByRole("button", { name: "Gravar tela" }).click();
      const overlay = await opened;
      lastPage = overlay;
      await overlay.locator(".rec-dock").waitFor({ timeout: 30_000 });
      await sizeWindows(true, small);
      await overlay.waitForFunction(() => window.innerWidth <= 1366);
      // The sources, the saved choices and the shortcuts have arrived (as in the first opening).
      await overlay
        .getByText("Testando o codificador nesta tela…")
        .waitFor({ state: "detached", timeout: 60_000 })
        .catch(() => notes.push("1366 × 768: o gravador ainda testava o codificador."));
      await overlay.waitForFunction(
        () =>
          !!document.querySelector(".rec-keys kbd")?.textContent?.trim() &&
          (document.querySelector(".rec-src select")?.querySelectorAll("option").length ?? 0) > 0,
        undefined,
        { timeout: 30_000 },
      );
      for (const [mode, name, title] of [
        ["screen", "1366-gravador-tela", "Gravador no modo Tela em 1366 × 768"],
        ["voice", "1366-gravador-so-voz", "Gravador no modo Só voz em 1366 × 768"],
        ["voicecam", "1366-gravador-voz-e-camera", "Gravador no modo Voz e câmera em 1366 × 768"],
        [
          "over",
          "1366-gravador-sobre-narracao",
          "Gravador no modo Tela sobre a narração em 1366 × 768",
        ],
      ] as const) {
        await overlay.locator("#recording-mode").selectOption(mode);
        await overlay.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        // "Voz e câmera" with a camera of this machine chosen: the longest bar of the recorder.
        const presenterCamera = overlay
          .getByRole("group", { name: "Câmera", exact: true })
          .locator("select")
          .first();
        const chosen =
          mode === "voicecam"
            ? (
                await presenterCamera
                  .locator("option")
                  .evaluateAll((options) =>
                    options.map((o) => (o instanceof HTMLOptionElement ? o.value : "")),
                  )
              ).find(Boolean)
            : undefined;
        if (chosen) {
          await presenterCamera.selectOption(chosen);
          await cameraPreviewShows(overlay, ".rec-cam.is-presenter video");
        }
        await captureOverlay(overlay, name, title);
        if (chosen) await presenterCamera.selectOption("");
        notes.push(
          ...(await overflow(overlay)).map((text) => `1366 × 768, gravador (${mode}): ${text}.`),
        );
      }
      await overlay.locator("#recording-mode").selectOption("screen");
      const closed = overlay.waitForEvent("close");
      await overlay.getByTitle("Fechar sem gravar").click();
      await closed;
      lastPage = editor;
      await sections.selectOption(sectionBefore);
    } finally {
      await sizeWindows(false, null);
    }
  });

  await step("Falha de salvamento", async () => {
    const [file] = (await readdir(projects)).filter((name) => name.endsWith(".ediaula"));
    assert.ok(file, "O projeto da gravação não foi salvo em Projetos");
    const projectFile = join(projects, file);
    await chmod(projectFile, 0o444);
    try {
      await editor.getByRole("button", { name: "Silenciar faixa" }).first().click();
      await editor.locator(".save-alert").waitFor({ timeout: 30_000 });
      await capture(editor, "salvamento-falhou-barra", "Aviso fixo de falha de salvamento");
      await capture(
        editor.locator("header.topbar"),
        "salvamento-falhou-topo",
        "Barra de cima com o aviso",
      );
      await editor.getByTitle("Voltar ao início").click();
      const dialog = editor.getByRole("dialog", { name: "Não foi possível salvar" });
      await dialog.waitFor({ timeout: 45_000 });
      await capture(editor, "salvamento-falhou-dialogo", "Diálogo de falha de salvamento");
      await capture(
        dialog.locator(".modal"),
        "salvamento-falhou-dialogo-recorte",
        "Diálogo (recorte)",
      );
    } finally {
      await chmod(projectFile, 0o644);
    }
    await editor
      .getByRole("dialog", { name: "Não foi possível salvar" })
      .getByRole("button", { name: "Tentar de novo" })
      .click();
    await editor.getByRole("heading", { name: "Suas aulas" }).waitFor({ timeout: 30_000 });
    await editor.locator(".project-card").first().waitFor();
    await capture(editor, "inicio-depois-de-salvar", "Início depois de salvar de novo");
  }, [
    {
      text: /project:save|EPERM|operation not permitted|permiss/i,
      reason: "o arquivo do projeto ficou somente leitura de propósito",
    },
  ]);
  await closeApplication(first.application, first.launch);

  /* ----- a media file and a cursor.json go missing, and a take is cut short ----- */
  await rename(media.heygen, join(spare, "heygen.mp4"));
  await rename(join(take, "cursor.json"), join(spareCursor, "cursor.json"));
  await writeInterruptedTake(recordings, media);

  /* ----- second opening: interrupted take, home, new project, relinking ----- */
  const second = await openEditor(harness, profile, "segunda abertura", false);
  const page = second.editor;

  await step("Gravação interrompida", async () => {
    const dialog = page.getByRole("dialog", { name: "Gravação interrompida" });
    await dialog.waitFor({ state: "visible", timeout: 30_000 });
    await dialog.getByRole("heading", { name: "Gravação interrompida" }).waitFor();
    await capture(page, "gravacao-interrompida", "Lista Gravação interrompida ao abrir o app");
    await capture(dialog.locator(".modal"), "gravacao-interrompida-recorte", "Lista (recorte)");
    await dialog.getByRole("button", { name: "Decidir depois" }).click();
    await dialog.waitFor({ state: "detached" });
  });

  await step("Início e novo projeto pela interface", async () => {
    await page.getByRole("heading", { name: "Suas aulas" }).waitFor();
    await page.locator(".project-card").first().waitFor();
    await capture(page, "inicio-com-projeto", "Início com a aula gravada");
    await page.locator(".home-sidebar").getByRole("button", { name: "Novo projeto" }).click();
    const dialog = page.getByRole("dialog", { name: "Novo projeto" });
    await dialog.waitFor();
    await capture(dialog.locator(".modal"), "novo-projeto", "Diálogo Novo projeto");
    // Each field is named by its label.
    await dialog.getByRole("textbox", { name: "Nome da aula" }).fill("Aula criada pela interface");
    await dialog.getByRole("combobox", { name: "Curso (opcional)" }).fill("Teste visual");
    await dialog.getByRole("combobox", { name: "Formato do vídeo" }).waitFor();
    await dialog.getByRole("button", { name: "Criar projeto" }).click();
    await page.locator(".editor").waitFor();
    await settle(page);
    await capture(page, "editor-vazio", "Editor de um projeto novo e vazio");
    await page.getByTitle("Voltar ao início").click();
    await page.locator(".project-card").nth(1).waitFor();
    await capture(page, "inicio-dois-projetos", "Início com duas aulas");
  });

  await step("Duplicar uma aula", async () => {
    await page
      .getByRole("button", { name: /^Mais opções de / })
      .first()
      .click();
    const menu = page.getByRole("menu");
    await menu.waitFor();
    await capture(page, "inicio-menu-aula", "Menu de uma aula no Início");
    const cards = await page.locator(".project-card").count();
    await menu.getByRole("menuitem", { name: "Duplicar" }).click();
    await page.locator(".project-card").nth(cards).waitFor({ timeout: 30_000 });
    await withoutToasts(page);
    await capture(page, "inicio-aula-duplicada", "Início com a cópia da aula");
  });

  await step("Reconexão de mídia", async () => {
    await answerDialog(second, "message", 0);
    await page.getByRole("button", { name: /^Abrir Gravação/ }).click();
    await page.locator(".editor").waitFor();
    await page.locator(".badge-button").first().waitFor({ timeout: 30_000 });
    await settle(page);
    await withoutToasts(page);
    await capture(page, "reconectar-midia", "Editor com mídia e cursor ausentes");
    await capture(
      page.locator("section.library"),
      "reconectar-midia-biblioteca",
      "Selos na biblioteca",
    );
    await answerDialog(second, "open", [join(spare, "heygen.mp4")]);
    await page.locator(".badge-button", { hasText: "Arquivo sumiu" }).click();
    await page
      .locator(".badge-button", { hasText: "Arquivo sumiu" })
      .waitFor({ state: "detached", timeout: 60_000 });
    await settle(page);
    await capture(
      page.locator("section.library"),
      "reconectado-video",
      "Biblioteca com o vídeo reconectado",
    );
    await answerDialog(second, "open", [join(spareCursor, "cursor.json")]);
    await page.locator(".badge-button", { hasText: "Cursor sumiu" }).click();
    await page
      .locator(".badge-button", { hasText: "Cursor sumiu" })
      .waitFor({ state: "detached", timeout: 60_000 });
    await withoutToasts(page);
    await capture(page, "reconectado-tudo", "Editor com tudo reconectado");
  });

  await step("Restaurar cópia de segurança", async () => {
    await page.locator("header.topbar").getByRole("button", { name: "Arquivo" }).click();
    await page.getByRole("menuitem", { name: "Restaurar cópia de segurança…" }).click();
    const dialog = page.getByRole("dialog", { name: "Cópias de segurança" });
    await dialog.waitFor();
    await dialog.getByText("Procurando as cópias…").waitFor({ state: "detached", timeout: 30_000 });
    await capture(dialog.locator(".modal"), "copias-de-seguranca", "Lista de cópias de segurança");
    const restore = dialog.getByRole("button", { name: "Restaurar…" }).first();
    if (!(await restore.count())) {
      notes.push("A aula da gravação não tinha cópias de segurança para restaurar.");
      await dialog.getByRole("button", { name: "Fechar" }).click();
      return;
    }
    await restore.click();
    await capture(dialog.locator(".modal"), "copias-confirmar", "Confirmação antes de restaurar");
    await dialog.getByRole("button", { name: "Restaurar esta" }).click();
    await dialog.waitFor({ state: "detached", timeout: 30_000 });
    await settle(page);
    await capture(page, "copia-restaurada", "Editor depois de restaurar a cópia");
    await savedSoon(page);
  });
  await step("Abrir aula empacotada", async () => {
    await page.getByTitle("Voltar ao início").click();
    await page.getByRole("heading", { name: "Suas aulas" }).waitFor();
    await answerDialog(second, "open", [packed]);
    await answerDialog(second, "message", 0);
    await page
      .locator(".home-sidebar")
      .getByRole("button", { name: "Abrir aula empacotada…" })
      .click();
    await page.locator(".editor").waitFor({ timeout: 60_000 });
    await page.locator("fieldset.clip").first().waitFor({ timeout: 60_000 });
    await settle(page);
    await withoutToasts(page);
    await capture(
      page,
      "aula-empacotada-aberta",
      "Aula aberta do pacote, com as mídias na pasta dela",
    );
  });

  await step("Prévia com 200 cortes", async () => {
    // A recording cut in 200 places, played for 15 s: how many media elements the preview
    // keeps and how many frames it drops.
    const source = join(harness.root, "midia", "duzentos.mp4");
    await ff([
      ...["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=70"],
      ...["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=70"],
      ...["-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast"],
      ...["-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-movflags", "+faststart", source],
    ]);
    const file = join(projects, "Duzentos cortes.ediaula");
    const pieces = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`,
      assetId: "a",
      trackId: "t",
      start: i * 0.3,
      in: i * 0.34,
      duration: 0.3,
      volume: 1,
    }));
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        id: "duzentos",
        name: "Duzentos cortes",
        createdAt: 0,
        updatedAt: 0,
        settings: { width: 1280, height: 720, fps: 30 },
        assets: [
          {
            id: "a",
            name: "duzentos.mp4",
            path: source,
            kind: "video",
            duration: 70,
            width: 1280,
            height: 720,
            fps: 30,
            hasVideo: true,
            hasAudio: true,
            size: (await stat(source)).size,
            proxyStatus: "none",
          },
        ],
        tracks: [
          { id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
        ],
        clips: pieces,
      }),
    );
    await page.getByTitle("Voltar ao início").click();
    await page.getByRole("heading", { name: "Suas aulas" }).waitFor();
    await answerDialog(second, "open", [file]);
    await answerDialog(second, "message", 0);
    await page.locator(".home-sidebar").getByRole("button", { name: "Abrir projeto…" }).click();
    await page.locator("fieldset.clip").first().waitFor({ timeout: 60_000 });
    await settle(page);
    await page.keyboard.press("Home");
    await page.keyboard.press("Space");
    await delay(15_000);
    const stats = await page.evaluate(() => {
      const preview: unknown = Reflect.get(window, "__ediaulaPreview");
      const stats = preview && typeof preview === "object" ? Reflect.get(preview, "stats") : null;
      return typeof stats === "function" ? stats() : null;
    });
    await page.keyboard.press("Space");
    assert.ok(stats, "the preview's numbers");
    await capture(
      page,
      "previa-200-cortes",
      "Prévia de uma gravação com 200 cortes, depois de 15 s tocando",
    );
    notes.push(
      `Prévia com 200 cortes, 15 s tocando: ${stats.elements} elementos de mídia em ${stats.lanes} faixas de elementos, ${stats.dropped} de ${stats.frames} quadros descartados, ${stats.seeks} saltos durante a reprodução, som ${stats.audio} (nível ${Number(stats.level).toFixed(3)}).`,
    );
    console.log(`[visual] ${notes.at(-1)}`);
    assert.ok(stats.elements <= 2, `${stats.elements} media elements for one recording`);
    // The thumbnails and waveform made on opening are saved before the window closes (closing
    // with unsaved work asks first).
    await page.locator(".save-pill.save-saved").waitFor({ timeout: 60_000 });
  });
  await closeApplication(second.application, second.launch);
} catch (error) {
  runFailures.push(error);
  console.error(`[visual] execução interrompida\n${describe(error)}`);
} finally {
  for (const [application, launch] of running) await closeApplication(application, launch);
  runFailures.push(...(await harness.dispose()));
  await writeReport(runFailures);
}

function writeReport(failures: unknown[]): Promise<void> {
  const unexpected = problems.filter((problem) => !problem.allowed);
  const tolerated = problems.filter((problem) => problem.allowed);
  const failed = steps.filter((item) => !item.ok);
  const passed = !unexpected.length && !failed.length && !failures.length;
  const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines = [
    "# Teste visual do EdiAula",
    "",
    `Execução: ${new Date().toLocaleString("pt-BR")}. Resultado: **${passed ? "passou" : "falhou"}**.`,
    "",
    "Comando: `pnpm edi:test:visual` (Windows, pacote de mídia em `.cache/edi-native-media`).",
    "",
    "## Passos",
    "",
    "| Passo | Resultado | Tempo |",
    "| --- | --- | --- |",
    ...steps.map(
      (item) =>
        `| ${cell(item.name)} | ${item.ok ? "ok" : `falhou: ${cell((item.error ?? "").split("\n")[0] ?? "")}`} | ${Math.round(item.ms / 1000)} s |`,
    ),
    "",
    "## Telas capturadas",
    "",
    "| # | Passo | Tela ou estado | Arquivo |",
    "| --- | --- | --- | --- |",
    ...shots.map(
      (shot, index) =>
        `| ${index + 1} | ${cell(shot.step)} | ${cell(shot.title)} | \`${shot.file}\` |`,
    ),
    "",
    "## Erros de console, de página e de IPC",
    "",
    ...(unexpected.length
      ? unexpected.map(
          (problem) =>
            `- **${problem.kind}** em ${problem.source}, passo "${problem.step}":\n\n  \`\`\`\n  ${problem.text.replace(/\n/g, "\n  ")}\n  \`\`\``,
        )
      : ["Nenhum."]),
    "",
    "## Mensagens toleradas",
    "",
    ...(tolerated.length
      ? tolerated.map(
          (problem) =>
            `- ${problem.kind} em ${problem.source}, passo "${problem.step}": ${cell(problem.text.split("\n")[0] ?? "")}. Motivo: ${problem.allowed}`,
        )
      : ["Nenhuma."]),
    "",
    "## Diálogos nativos respondidos pelo teste",
    "",
    ...(dialogs.length
      ? dialogs.map(
          (call) =>
            `- ${call.launch}: ${call.kind} "${cell(call.title)}"${call.answered ? "" : " (sem resposta do teste)"}`,
        )
      : ["Nenhum."]),
    "",
    "## Observações",
    "",
    ...(notes.length ? notes.map((note) => `- ${note}`) : ["Nenhuma."]),
    ...(failures.length
      ? ["", "## Falhas da execução", "", ...failures.map((error) => `- ${cell(describe(error))}`)]
      : []),
    "",
  ];
  if (!passed) process.exitCode = 1;
  return Promise.all([
    writeFile(join(results, "relatorio.md"), lines.join("\n"), "utf8"),
    writeFile(join(results, "processo-principal.log"), mainLog.join(""), "utf8"),
  ]).then(() => {
    console.log(
      `[visual] ${passed ? "passou" : "falhou"}: ${shots.length} capturas, ${unexpected.length} erros, ${failed.length} passos com falha. Relatório: ${join(results, "relatorio.md")}`,
    );
  });
}

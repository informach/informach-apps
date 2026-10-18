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
const LEASE_SECONDS = 1800;

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
const KNOWN_HARMLESS: { source: RegExp; text: RegExp; line?: RegExp; reason: string }[] = [
  {
    // zod 4 probes once whether it may compile validators with `new Function("")`, inside a
    // try/catch (allowsEval in zod/v4/core/util). The renderer's CSP has no 'unsafe-eval', so
    // Chromium logs the refusal and zod keeps validating without eval.
    source: / · (editor|gravador)$/,
    text: /'script-src' was not explicitly set, so 'default-src' is used as a fallback/,
    line: /new Function\(""\)/,
    reason:
      "Sondagem do zod 4 (new Function dentro de try/catch); a CSP recusa eval como deve e o zod valida sem eval. Some com z.config({ jitless: true }) no renderer.",
  },
];

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

  await step("Exportar a voz e importar o HeyGen", async () => {
    await left.getByRole("button", { name: "Exportar voz para o HeyGen" }).click();
    await left.getByText(/Última exportação: \d+ arquivo/).waitFor({ timeout: 180_000 });
    await answerDialog(first, "open", [media.heygen]);
    await left.getByRole("button", { name: "Importar vídeo do HeyGen" }).click();
    await left.getByRole("button", { name: "Encaixando…" }).waitFor({ timeout: 30_000 });
    await left
      .getByRole("button", { name: "Encaixando…" })
      .waitFor({ state: "detached", timeout: 300_000 });
    await settle(editor);
    await capture(editor, "heygen-importado", "Editor depois de importar o vídeo do HeyGen");
    await withoutToasts(editor);
    await capture(left, "heygen-painel", "Seção HeyGen depois da importação");
    // The import names the video after the piece of voice it matched ("HeyGen · ...").
    const heygenClips = await editor
      .locator("fieldset.clip")
      .evaluateAll((clips) => clips.map((clip) => clip.getAttribute("aria-label") ?? ""));
    if (!heygenClips.some((label) => label.startsWith("Clipe HeyGen")))
      notes.push(
        `Depois da importação do HeyGen nenhum clipe se chama "HeyGen · ...": ${heygenClips.join(", ")}.`,
      );
    await seek(editor, 9);
    await capture(editor, "heygen-em-9s", "Prévia aos 9 s: tela, cursor e avatar sem fundo");
    await capture(editor.locator(".timeline-wrap"), "heygen-timeline", "Timeline com o HeyGen");
    await savedSoon(editor);
  });

  await step("Roteiro colado", async () => {
    await side.locator(".tab", { hasText: "Roteiro" }).click();
    await side.locator(".script-empty").waitFor();
    await capture(side, "roteiro-vazio", "Painel Roteiro antes de colar");
    await side.locator("textarea.script-paste").fill(await readFile(scriptFixture, "utf8"));
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
      .getByText(/já foi limpa antes de gerar o vídeo do apresentador/)
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
        (list, [a, b]) =>
          list.flatMap((clip, i) => {
            const r = clip.getBoundingClientRect();
            return Math.abs(r.left - a) < 4 && Math.abs(r.right - b) < 4 ? [i] : [];
          }),
        [x0, x1],
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

  await step("Gravador nos três modos", async () => {
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
    await overlay.locator("#recording-mode").selectOption("voice");
    await overlay.locator(".vp-wrap").waitFor();
    await captureOverlay(overlay, "gravador-so-voz", "Gravador no modo Só voz");
    await captureOverlay(
      overlay.locator(".rec-dock"),
      "gravador-so-voz-controles",
      "Controles do modo Só voz, com o teste do microfone",
      ["escuro"],
    );
    await overlay.locator("#recording-mode").selectOption("over");
    await overlay.locator(".karaoke").waitFor();
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
    // Field puts the label in a legend: the input itself has no accessible name.
    await dialog
      .getByRole("group", { name: "Nome da aula" })
      .locator("input")
      .fill("Aula criada pela interface");
    await dialog
      .getByRole("group", { name: "Curso (opcional)" })
      .locator("input")
      .fill("Teste visual");
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

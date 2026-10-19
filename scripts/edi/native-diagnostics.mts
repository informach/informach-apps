import type { ChildProcess } from "node:child_process";
import type { ElectronApplication } from "playwright";

/** Attach immediately after launch; Playwright's close event is not a child exit verdict. */
export function trackNativeChild(child: ChildProcess) {
  let closed = false;
  const completion = new Promise<void>((resolve) => {
    child.once("close", () => {
      closed = true;
      resolve();
    });
  });
  return { completion, isClosed: () => closed };
}

export async function verifyNativeClose(
  child: ChildProcess,
  completion: Promise<void>,
  close: Promise<unknown>,
  timeoutMs = 30000,
) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.all([completion, close]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Native cleanup deadline exceeded")), timeoutMs);
      }),
    ]);
    if (child.exitCode !== 0 || child.signalCode !== null)
      throw Object.assign(new Error("Native child did not exit successfully"), {
        code: child.exitCode,
        signal: child.signalCode,
      });
  } finally {
    clearTimeout(timer);
  }
}

export type NativeStage =
  | "installation"
  | "build"
  | "manifest"
  | "launch"
  | "first-window"
  | "functional"
  | "cleanup";

/** Deliberately excludes arbitrary error properties such as spawnargs, cmd and env. */
export function nativeFailure(error: unknown, paths: string[]) {
  const field = (name: string) =>
    error && typeof error === "object" ? Reflect.get(error, name) : undefined;
  const text = (name: string) => {
    const value = field(name);
    return typeof value === "string" || Buffer.isBuffer(value)
      ? sanitizeNativeDiagnostic(String(value), paths).slice(-16384)
      : undefined;
  };
  const scalar = (name: string) => {
    const value = field(name);
    return typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      value === null
      ? value
      : undefined;
  };
  return {
    name: error instanceof Error ? error.name : "UnknownFailure",
    message: text("message")?.replace(/^Command failed:[^\r\n]*/, "Subprocess failed"),
    stack: text("stack")?.replace(/Command failed:[^\r\n]*/g, "Subprocess failed"),
    code: scalar("code"),
    signal: scalar("signal"),
    killed: scalar("killed"),
    stdout: text("stdout"),
    stderr: text("stderr"),
  };
}

export async function nativeStage<T>(
  app: string,
  stage: NativeStage,
  paths: string[],
  run: () => Promise<T>,
  emit: (event: object) => void = (event) => console.log(JSON.stringify(event)),
): Promise<T> {
  const start = performance.now();
  emit({ nativeStage: stage, app, event: "start" });
  try {
    const result = await run();
    emit({
      nativeStage: stage,
      app,
      event: "complete",
      elapsedMs: Math.round(performance.now() - start),
    });
    return result;
  } catch (error) {
    const failure = {
      nativeStage: stage,
      app,
      event: "failed",
      elapsedMs: Math.round(performance.now() - start),
      error: nativeFailure(error, paths),
    };
    emit(failure);
    // Do not rethrow an unsanitized execFile/Playwright error through Node's printer.
    throw new Error(JSON.stringify(failure));
  }
}

export function sanitizeNativeDiagnostic(value: string, paths: string[]) {
  let result = value;
  for (const path of paths.filter(Boolean).sort((left, right) => right.length - left.length))
    result = result.split(path).join("<test-path>");
  return result
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "<private-key>",
    )
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/g, "<url>")
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, "<authorization>")
    .replace(
      /((?:access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,
      "$1<redacted>",
    );
}

/** Only observes this isolated test process; never changes app startup or close. */
export function observeNativeStartup(application: ElectronApplication, paths: string[]) {
  const child = application.process();
  const startedAt = Date.now();
  const events: { elapsedMs: number; event: string }[] = [];
  const stderrEvents: { elapsedMs: number; stage: string; text: string }[] = [];
  let stage = "launcher-connected";
  let stderr = "";
  const record = (event: string) => {
    events.push({ elapsedMs: Date.now() - startedAt, event });
    if (events.length > 32) events.shift();
  };
  const receiveStderr = (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-8192);
    stderrEvents.push({
      elapsedMs: Date.now() - startedAt,
      stage,
      text: sanitizeNativeDiagnostic(chunk.toString("utf8"), paths).slice(-4096),
    });
    if (stderrEvents.length > 32) stderrEvents.shift();
  };
  const onWindow = () => record("playwright-window");
  const onClose = () => record("playwright-close");
  const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
    record(`process-exit:${code}:${signal}`);
  const onError = (error: Error) => record(`process-error:${error.name}`);
  record("launcher-connected");
  child.stderr?.on("data", receiveStderr);
  child.on("exit", onExit);
  child.on("error", onError);
  application.on("window", onWindow);
  application.on("close", onClose);
  return {
    markStage(value: string) {
      stage = value.slice(0, 100);
      record(`stage:${stage}`);
    },
    async snapshot() {
      let timeout: NodeJS.Timeout | undefined;
      try {
        const native = await Promise.race([
          application
            .evaluate(({ app, BrowserWindow }) => ({
              ready: app.isReady(),
              windows: BrowserWindow.getAllWindows().map((window) => ({
                id: window.id,
                visible: window.isVisible(),
                focused: window.isFocused(),
                minimized: window.isMinimized(),
                destroyed: window.isDestroyed(),
                loading: window.webContents.isLoading(),
                crashed: window.webContents.isCrashed(),
                document: window.webContents.getURL().split(":", 1)[0],
              })),
            }))
            .catch((error: unknown) => ({
              error: error instanceof Error ? error.name : "unknown",
            })),
          new Promise<{ error: string }>((resolve) => {
            timeout = setTimeout(() => resolve({ error: "diagnostic-deadline" }), 3000);
          }),
        ]);
        return {
          pid: child.pid,
          exitCode: child.exitCode,
          signalCode: child.signalCode,
          elapsedMs: Date.now() - startedAt,
          events,
          playwrightWindows: application.windows().length,
          native,
          stderr: sanitizeNativeDiagnostic(stderr, paths),
          stderrEvents,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    dispose() {
      child.stderr?.off("data", receiveStderr);
      child.off("exit", onExit);
      child.off("error", onError);
      application.off("window", onWindow);
      application.off("close", onClose);
    },
  };
}

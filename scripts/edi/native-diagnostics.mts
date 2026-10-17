import type { ElectronApplication } from "playwright";

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
  let stderr = "";
  const record = (event: string) => {
    events.push({ elapsedMs: Date.now() - startedAt, event });
    if (events.length > 32) events.shift();
  };
  const receiveStderr = (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-8192);
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

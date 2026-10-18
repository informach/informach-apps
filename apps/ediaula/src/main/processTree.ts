import { execFile } from "node:child_process";

/**
 * Ends a process and every process it started. The npm and bun launchers of Claude Code and
 * Codex start the real program as a child of their own, so killing only the launcher would leave
 * the program running. On Windows this is `taskkill /T /F`, run without a shell. Resolves true
 * when the process tree was ended (or was already gone).
 */
export function killTree(pid: number | undefined): Promise<boolean> {
  if (!pid) return Promise.resolve(true);
  if (process.platform !== "win32")
    return Promise.resolve(
      (() => {
        try {
          process.kill(pid, "SIGKILL");
          return true;
        } catch (error) {
          return error instanceof Error && "code" in error && error.code === "ESRCH";
        }
      })(),
    );
  return new Promise((resolve) => {
    execFile(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true, timeout: 15_000 },
      (error) => {
        // 128: no such process, it has already exited.
        const code = (error as (Error & { code?: number }) | null)?.code;
        resolve(!error || code === 128);
      },
    );
  });
}

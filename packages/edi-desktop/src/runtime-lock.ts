import { lock } from "proper-lockfile";

/**
 * The heartbeat lock each open tool holds in the suite folder for its whole life (main.ts), and
 * that the Hub's installer takes before replacing a tool's files (installations.ts). A tool open
 * in several windows at once (EdiSVG, each window a process) holds one per window: window 1 the
 * tool's own name, the others `<id>.janela-<n>.runtime`.
 */

/** At most this many windows of one tool hold a lock at once. */
export const MAX_TOOL_INSTANCES = 8;

export const runtimeLockName = (appId: string, instance = 1): string =>
  instance > 1 ? `${appId}.janela-${instance}.runtime` : `${appId}.runtime`;

export type RuntimeLockEvent = "runtime_lock_lost" | "runtime_lock_retake_failed";

/**
 * Takes the runtime lock and keeps holding it while the tool runs. proper-lockfile renews it in a
 * timer, and when a renewal finds it gone or changed (removed from the folder, or taken as stale
 * by someone else while this process was too busy to renew it), its default `onCompromised`
 * throws inside that timer: an uncaught exception in the main process, which Electron shows as an
 * error box that freezes the tool until it is dismissed (EdiSVG, 22/11/2026). Here the loss is
 * reported and the lock taken again; when someone else holds it now, the tool goes on without it
 * (the next start takes it again). Rejects like `lock` when the first take fails.
 */
export function holdRuntimeLock(
  file: string,
  report: (event: RuntimeLockEvent, error: unknown) => void,
  timing: { stale?: number; update?: number } = {},
): Promise<() => Promise<void>> {
  const take = (): Promise<() => Promise<void>> =>
    lock(file, {
      realpath: false,
      stale: timing.stale ?? 30_000,
      update: timing.update ?? 5_000,
      retries: 0,
      onCompromised: (error) => {
        report("runtime_lock_lost", error);
        take().catch((retakeError: unknown) => report("runtime_lock_retake_failed", retakeError));
      },
    });
  return take();
}

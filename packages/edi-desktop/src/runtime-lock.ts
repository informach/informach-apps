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

import type { RecordingResult } from "@shared/recording";
import type { RecordingLayout } from "@shared/recordingImport";

/**
 * What happens after a take lands in the project, or the presenter's video is placed: the offer
 * of "Preparar aula" (lib/prepare.ts) hangs off these.
 */

export interface RecordingImported {
  result: RecordingResult;
  layout: RecordingLayout;
  /** Asset ids by role. */
  assets: { screen: string[]; mic?: string; camera: string[]; system?: string; narration?: string };
}

type Listener = (take: RecordingImported) => void | Promise<void>;
const listeners = new Set<Listener>();

/** Called after every imported take; returns the unsubscribe. */
export function onRecordingImported(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Tells every listener; one that fails does not keep the others from running. */
export async function recordingImported(take: RecordingImported): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const cb of listeners) {
    try {
      await cb(take);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

const placedListeners = new Set<() => void>();

/** Called after the presenter's video is placed in the lesson; returns the unsubscribe. */
export function onPresenterPlaced(cb: () => void): () => void {
  placedListeners.add(cb);
  return () => placedListeners.delete(cb);
}

/** Tells every listener that the presenter's video came into the lesson. */
export function presenterPlaced(): void {
  for (const cb of placedListeners) cb();
}

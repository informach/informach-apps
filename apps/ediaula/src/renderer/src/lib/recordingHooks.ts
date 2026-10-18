import type { RecordingResult } from "@shared/recording";
import type { RecordingLayout } from "@shared/recordingImport";

/**
 * What happens after a take lands in the project. "Preparar aula" (transcribe, align with the
 * script, propose the cleanup) will hang off this; for now only the retake proposals do.
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

/**
 * Order of AI tool calls on the open project (aiBridge.callTool). Writes and proposals run one
 * at a time, each after the calls that came before it, so no call edits a project another one
 * is still reading or changing. Reads run side by side, but wait for the write in progress (and
 * for writes queued before them): they never see a half-done edit.
 */
export type QueueKind = "read" | "write";

export interface ToolQueue {
  run<T>(kind: QueueKind, task: () => Promise<T>): Promise<T>;
}

const settled = (p: Promise<unknown>): Promise<void> =>
  p.then(
    () => undefined,
    () => undefined,
  );

export function createToolQueue(): ToolQueue {
  /** The last write queued, settled: what the next read or write waits for. */
  let lastWrite: Promise<void> = Promise.resolve();
  const reads = new Set<Promise<void>>();
  return {
    run<T>(kind: QueueKind, task: () => Promise<T>): Promise<T> {
      if (kind === "read") {
        const result = lastWrite.then(task);
        const done = settled(result);
        reads.add(done);
        void done.then(() => reads.delete(done));
        return result;
      }
      const before = Promise.all([lastWrite, ...reads]);
      const result = before.then(task);
      lastWrite = settled(result);
      return result;
    },
  };
}

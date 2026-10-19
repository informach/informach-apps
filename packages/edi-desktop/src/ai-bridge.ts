import { randomUUID } from "node:crypto";
import type { ApprovalAnswer, ApprovalQuestion } from "./mcp-guard.ts";

/**
 * From the main process to the editor and back: tool calls run in the renderer (where the
 * document lives, so edits show up live and join the undo history), questions wait for the
 * person, and nothing waits forever. Validation of the calls and of the answers stays in the
 * application; this only carries them.
 */

/* ----- Order of the calls ----- */

/**
 * Order of AI tool calls on the open document. Writes and proposals run one at a time, each after
 * the calls that came before it, so no call edits a document another one is still reading or
 * changing. Reads run side by side, but wait for the write in progress (and for writes queued
 * before them): they never see a half-done edit.
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

/* ----- Requests to the renderer ----- */

/** The renderer of a window, as the requests need it. */
export interface RendererPort {
  /** Whether the renderer can still answer. */
  alive(): boolean;
  send(channel: string, payload: unknown): void;
  /** Calls `listener` once when the renderer goes away; the returned function removes it. */
  onGone(listener: () => void): () => void;
}

/** The parts of an Electron BrowserWindow a RendererPort uses. */
export interface WindowLike {
  isDestroyed(): boolean;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    once(event: "destroyed" | "render-process-gone", listener: () => void): unknown;
    removeListener(event: "destroyed" | "render-process-gone", listener: () => void): unknown;
  };
}

/** A window as a RendererPort (null or closed: a port that is never alive). */
export function windowPort(win: WindowLike | null | undefined): RendererPort {
  return {
    alive: () => !!win && !win.isDestroyed(),
    send: (channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    onGone: (listener) => {
      if (!win || win.isDestroyed()) {
        queueMicrotask(listener);
        return () => {};
      }
      const contents = win.webContents;
      const once = (): void => {
        contents.removeListener("destroyed", once);
        contents.removeListener("render-process-gone", once);
        listener();
      };
      contents.once("destroyed", once);
      contents.once("render-process-gone", once);
      return () => {
        contents.removeListener("destroyed", once);
        contents.removeListener("render-process-gone", once);
      };
    },
  };
}

export type RequestEnd = "answer" | "timeout" | "gone" | "cancel";

export interface RendererRequestOptions<Res> {
  channel: string;
  timeoutMs: number;
  /** The answer when time runs out. */
  timeout: Res;
  /** The answer when the window is closed or its renderer is gone. */
  gone: Res;
  /**
   * After the time runs out, the caller gets `timeout` but the request stays open until the
   * renderer answers or goes away (`settled` waits for it): a queue never lets another call
   * run over one still working. Otherwise the request ends with the timeout.
   */
  holdAfterTimeout?: boolean;
  /** Called once when a request ends, with how (to close a dialog, to cancel a tool). */
  onEnd?(port: RendererPort, id: string, how: RequestEnd): void;
}

interface Pending<P, Res> {
  payload: P;
  finish(result: Res, how: RequestEnd): void;
}

/**
 * Requests that the renderer answers by id (`resolve`), each with a time limit. Every request
 * ends exactly once: answered, timed out, its window gone, cancelled or closed.
 */
export function createRendererRequests<P extends { id: string }, Res>(
  options: RendererRequestOptions<Res>,
) {
  const pending = new Map<string, Pending<P, Res>>();

  function request(
    port: RendererPort,
    payload: P,
  ): { answer: Promise<Res>; settled: Promise<void> } {
    let answer: (result: Res) => void = () => {};
    let settle: () => void = () => {};
    const answered = new Promise<Res>((resolve) => {
      answer = resolve;
    });
    const settledPromise = new Promise<void>((resolve) => {
      settle = resolve;
    });
    if (!port.alive()) {
      answer(options.gone);
      settle();
      return { answer: answered, settled: settledPromise };
    }
    let told = false;
    let ended = false;
    const tell = (result: Res): void => {
      if (told) return;
      told = true;
      answer(result);
    };
    let removeGone: () => void = () => {};
    const finish = (result: Res, how: RequestEnd): void => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      removeGone();
      pending.delete(payload.id);
      tell(result);
      options.onEnd?.(port, payload.id, how);
      settle();
    };
    const timer = setTimeout(() => {
      if (options.holdAfterTimeout) tell(options.timeout);
      else finish(options.timeout, "timeout");
    }, options.timeoutMs);
    pending.set(payload.id, { payload, finish });
    removeGone = port.onGone(() => finish(options.gone, "gone"));
    try {
      port.send(options.channel, payload);
    } catch {
      // The window went away between the check and the send.
      finish(options.gone, "gone");
    }
    return { answer: answered, settled: settledPromise };
  }

  return {
    request,
    /** The renderer's answer to request `id`; false when no such request is open. */
    resolve(id: string, result: Res): boolean {
      const entry = pending.get(id);
      entry?.finish(result, "answer");
      return !!entry;
    },
    /** Ends the open requests `match` picks, answering `result`. Returns how many. */
    cancel(match: (payload: P) => boolean, result: Res): number {
      let count = 0;
      for (const entry of [...pending.values()])
        if (match(entry.payload)) {
          entry.finish(result, "cancel");
          count++;
        }
      return count;
    },
    /** Ends every open request with `result` (the window closed). */
    close(result: Res): void {
      for (const entry of [...pending.values()]) entry.finish(result, "gone");
    },
    size: (): number => pending.size,
  };
}

export type RendererRequests<P extends { id: string }, Res> = ReturnType<
  typeof createRendererRequests<P, Res>
>;

/* ----- Questions to the person ----- */

/** How long a question waits for the person before it counts as "Negar". */
export const APPROVAL_TIMEOUT_MS = 60_000;

/**
 * Questions about a write asked by an AI app that may only read and propose, shown by the
 * editor (with "Permitir uma vez", "Permitir por 15 min neste projeto" and "Negar"). Without an
 * answer in time it is denied; when it ends the editor is told to close it.
 */
export function createApprovalRequests(options: {
  channel: string;
  timeoutMs?: number;
  now?: () => number;
}) {
  const timeoutMs = options.timeoutMs ?? APPROVAL_TIMEOUT_MS;
  const deny: ApprovalAnswer = { choice: "deny", projectId: null };
  const requests = createRendererRequests<
    ApprovalQuestion & { id: string; expiresAt: number },
    ApprovalAnswer
  >({
    channel: options.channel,
    timeoutMs,
    timeout: deny,
    gone: deny,
    onEnd: (port, id) => port.send(options.channel, { id, closed: true }),
  });
  return {
    ask(port: RendererPort, question: ApprovalQuestion): Promise<ApprovalAnswer> {
      const now = options.now?.() ?? Date.now();
      return requests.request(port, { ...question, id: randomUUID(), expiresAt: now + timeoutMs })
        .answer;
    },
    answer: (id: string, answer: ApprovalAnswer): boolean => requests.resolve(id, answer),
  };
}

/** The options of a native question box (Electron's showMessageBox takes them as they are). */
export interface ApprovalDialogOptions {
  type: "question";
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: boolean;
  signal: AbortSignal;
}

/**
 * The same question as a native dialog, for editors without a question of their own. `scope`
 * names what is open when the person answers (the project the approval is for); null denies.
 */
export function dialogApproval(options: {
  appName: string;
  show(dialog: ApprovalDialogOptions): Promise<{ response: number }>;
  scope(): string | null;
  timeoutMs?: number;
}): (question: ApprovalQuestion) => Promise<ApprovalAnswer> {
  return async (question) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? APPROVAL_TIMEOUT_MS);
    try {
      const { response } = await options.show({
        type: "question",
        title: options.appName,
        message: `${question.client} quer: ${question.title}`,
        detail: `${question.summary}\n\nSem resposta em 1 minuto, o pedido é negado.`,
        buttons: ["Permitir uma vez", "Permitir por 15 min", "Negar"],
        defaultId: 2,
        cancelId: 2,
        noLink: true,
        signal: abort.signal,
      });
      const projectId = options.scope();
      if (abort.signal.aborted || !projectId) return { choice: "deny", projectId: null };
      if (response === 0) return { choice: "once", projectId };
      if (response === 1) return { choice: "project", projectId };
      return { choice: "deny", projectId: null };
    } finally {
      clearTimeout(timer);
    }
  };
}

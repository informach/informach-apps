import type { BatchDetail } from "@shared/batch-format";
import type { CompressionInput } from "@shared/compression-task-format";
import {
  type LocalTaskOutcome,
  type LocalTaskRequest,
  localTaskOutcomeSchema,
  localTaskReplySchema,
  type TaskDetail,
  type TaskResult,
} from "@shared/task-format";
import { useLocalTasks } from "../state/tasks";

export interface LocalTask {
  signal: AbortSignal;
  describe(message: string): void;
  input(input: CompressionInput): Promise<void>;
  ready(result: TaskResult): Promise<void>;
  checkpointResult(result: TaskResult): Promise<void>;
  checkpointBatch(bytes: Uint8Array, detail: BatchDetail): Promise<void>;
  update(detail: TaskDetail): Promise<void>;
  progress(detail: TaskDetail): Promise<void>;
  stage(): Promise<void>;
  check(): Promise<void>;
  save(): Promise<string | undefined>;
  flattenPrint(): Promise<TaskResult>;
  print(): Promise<boolean>;
  scanPage(): Promise<TaskResult | null>;
  discard(): Promise<void>;
  disconnect(): void;
  outcome: Promise<LocalTaskOutcome>;
}
/** One authenticated invoke stays pending for the whole task. Port messages cannot start another task. */
export function beginLocalTask(
  request: LocalTaskRequest,
  signal: AbortSignal,
  onProblem: (message: string) => void,
): Promise<LocalTask> {
  if (signal.aborted) return Promise.reject(new DOMException("Tarefa cancelada", "AbortError"));
  if (Object.hasOwn(useLocalTasks.getState().active, request.id))
    return Promise.reject(new Error("Esta tarefa já está em execução ou em revisão."));
  return new Promise((resolve, reject) => {
    const abort = new AbortController(),
      waiting = new Map<
        number,
        {
          kind: string;
          resolve(value?: {
            savedPath?: string;
            result?: TaskResult;
            printed?: boolean;
            scanDone?: boolean;
          }): void;
          reject(error: unknown): void;
        }
      >();
    let port: MessagePort | undefined,
      seq = 0,
      started = false,
      ended = false,
      intentionalClose = false;
    const failWaiters = (error: unknown) => {
      for (const item of waiting.values()) item.reject(error);
      waiting.clear();
    };
    const cleanup = () => {
      ended = true;
      useLocalTasks.getState().remove(request.id);
      window.removeEventListener("message", attach);
      signal.removeEventListener("abort", cancel);
      abort.abort();
      port?.close();
    };
    const cancel = () => {
      intentionalClose = true;
      abort.abort();
      if (!port) return;
      port.close();
    };
    type Command =
      | { kind: "input"; input: CompressionInput }
      | { kind: "ready" | "checkpointResult"; result: TaskResult }
      | { kind: "checkpointBatch"; bytes: Uint8Array; detail: BatchDetail }
      | { kind: "update" | "progress"; detail: TaskDetail }
      | { kind: "checkpoint" | "save" | "stage" | "flattenPrint" | "print" | "scanPage" };
    const send = (
      command: Command,
    ): Promise<
      { savedPath?: string; result?: TaskResult; printed?: boolean; scanDone?: boolean } | undefined
    > =>
      new Promise((done, failed) => {
        if (ended || !port) {
          failed(new Error("A tarefa foi encerrada. Retome o resultado preservado em Tarefas."));
          return;
        }
        const number = ++seq;
        waiting.set(number, { kind: command.kind, resolve: done, reject: failed });
        try {
          port.postMessage({ ...command, seq: number });
        } catch (error) {
          waiting.delete(number);
          failed(error);
        }
      });
    window.addEventListener("message", attach);
    signal.addEventListener("abort", cancel, { once: true });
    useLocalTasks.getState().add(request, cancel);
    const outcome = window.api.tasks
      .run(request)
      .then((raw) => {
        const value = localTaskOutcomeSchema.parse(raw);
        if (value.status === "preserved" && !intentionalClose) onProblem(value.reason);
        for (const waiter of waiting.values()) {
          if (waiter.kind === "save" && value.status === "saved")
            waiter.resolve({ savedPath: value.path });
          else if (waiter.kind === "print" && value.status === "printed")
            waiter.resolve({ printed: true });
          else
            waiter.reject(
              new Error(value.status === "preserved" ? value.reason : "Tarefa encerrada."),
            );
        }
        waiting.clear();
        cleanup();
        if (!started)
          reject(
            value.status === "cancelled"
              ? new DOMException("Tarefa cancelada antes de iniciar.", "AbortError")
              : new Error(
                  value.status === "preserved"
                    ? value.reason
                    : "Tarefa encerrada antes de iniciar.",
                ),
          );
        return value;
      })
      .catch((error: unknown) => {
        failWaiters(error);
        cleanup();
        if (!started) reject(error);
        throw error;
      });
    // Handle the completion internally as well; callers may only need ready/save methods.
    void outcome.catch((error: unknown) => {
      if (!intentionalClose)
        onProblem(error instanceof Error ? error.message : "Falha na tarefa local.");
    });
    function attach(event: MessageEvent<unknown>) {
      if (
        event.source !== window ||
        !event.data ||
        typeof event.data !== "object" ||
        !("type" in event.data) ||
        event.data.type !== "edipdf-task-port" ||
        !("id" in event.data) ||
        event.data.id !== request.id ||
        event.ports.length !== 1 ||
        port
      )
        return;
      port = event.ports[0];
      if (!port) return;
      port.onmessage = (event: MessageEvent<unknown>) => {
        try {
          const reply = localTaskReplySchema.parse(event.data);
          if (reply.kind === "start") {
            if (started || ended) return;
            if (signal.aborted || abort.signal.aborted) {
              cancel();
              return;
            }
            started = true;
            useLocalTasks.getState().update(request.id, "processing", "Processando localmente…");
            resolve({
              signal: abort.signal,
              describe: (message) =>
                useLocalTasks.getState().update(request.id, "processing", message),
              outcome,
              input: async (input) => {
                await send({ kind: "input", input });
              },
              ready: async (result) => {
                await send({ kind: "ready", result });
                useLocalTasks
                  .getState()
                  .update(request.id, "review", "Resultado protegido aguardando revisão.");
              },
              checkpointResult: async (result) => {
                await send({ kind: "checkpointResult", result });
              },
              checkpointBatch: async (bytes, detail) => {
                await send({ kind: "checkpointBatch", bytes, detail });
              },
              update: async (detail) => {
                await send({ kind: "update", detail });
              },
              progress: async (detail) => {
                await send({ kind: "progress", detail });
              },
              stage: async () => {
                useLocalTasks
                  .getState()
                  .update(request.id, "queued", "Aguardando a próxima etapa na fila…");
                await send({ kind: "stage" });
                useLocalTasks
                  .getState()
                  .update(request.id, "processing", "Processando localmente…");
              },
              check: async () => {
                await send({ kind: "checkpoint" });
              },
              save: async () => (await send({ kind: "save" }))?.savedPath,
              flattenPrint: async () => {
                const result = (await send({ kind: "flattenPrint" }))?.result;
                if (!result) throw new Error("A preparação vetorial não retornou seu resultado.");
                return result;
              },
              print: async () => !!(await send({ kind: "print" }))?.printed,
              scanPage: async () => {
                const reply = await send({ kind: "scanPage" });
                if (reply?.scanDone) return null;
                if (!reply?.result)
                  throw new Error("A aquisição não retornou uma página protegida.");
                return reply.result;
              },
              discard: async () => {
                abort.abort();
                port?.postMessage({ kind: "cancel", seq: ++seq });
                const result = await outcome;
                if (result.status !== "cancelled")
                  throw new Error(
                    result.status === "preserved"
                      ? result.reason
                      : "O resultado já foi salvo e não foi descartado.",
                  );
              },
              disconnect: () => {
                intentionalClose = true;
                abort.abort();
                port?.close();
              },
            });
          } else if (reply.kind === "ack") {
            const waiter = waiting.get(reply.seq);
            waiting.delete(reply.seq);
            waiter?.resolve(reply);
          } else if (reply.kind === "error") {
            const error = new Error(reply.error);
            onProblem(reply.error);
            failWaiters(error);
            if (!started) reject(error);
            cleanup();
          } else {
            const error = new Error(reply.reason);
            if (!intentionalClose) onProblem(reply.reason);
            failWaiters(error);
            if (!started) reject(error);
            cleanup();
          }
        } catch (error) {
          onProblem(error instanceof Error ? error.message : "Resposta inválida da tarefa local.");
          failWaiters(error);
          cleanup();
          if (!started) reject(error);
        }
      };
      port.start();
      if (signal.aborted || abort.signal.aborted) cancel();
    }
    if (signal.aborted) cancel();
  });
}

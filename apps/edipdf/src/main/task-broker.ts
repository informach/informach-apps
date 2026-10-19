import { assertBatchAdvance } from "../shared/batch-format.ts";
import { sameCompressionSource } from "../shared/compression-task-format.ts";
import type { ScannerSettings } from "../shared/scanner-format.ts";
import {
  assertPrintRestriction,
  type LocalTaskOutcome,
  type LocalTaskReply,
  type LocalTaskRequest,
  localTaskMessageSchema,
  localTaskRequestSchema,
  type PendingCompressionInput,
  type PendingLocalTask,
  type TaskResult,
  taskResultSchema,
} from "../shared/task-format.ts";

interface Job {
  check(): void;
  finish(): void;
}
export interface TaskPort {
  send(message: LocalTaskReply): void;
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
}
export function createTaskBroker(options: {
  begin(stop: () => void): Job;
  preserve(task: PendingLocalTask, checkpoint: () => Promise<void>): Promise<void>;
  preserveInput?(input: PendingCompressionInput, checkpoint: () => Promise<void>): Promise<void>;
  createScanner?(
    settings: ScannerSettings,
    signal: AbortSignal,
  ): { next(previous: TaskResult | undefined): Promise<TaskResult | null>; close(): void };
  flattenPrint?(
    result: TaskResult,
    checkpoint: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<TaskResult>;
  print?(
    result: TaskResult,
    checkpoint: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<{ submitted: boolean; warning?: string }>;
  remove(id: string): Promise<void>;
  save(
    request: LocalTaskRequest,
    result: TaskResult,
    checkpoint: () => Promise<void>,
  ): Promise<string | null>;
  now?: () => number;
}) {
  const entries = new Map<
    string,
    {
      request: LocalTaskRequest;
      start(): void;
      canStart(): boolean;
      order(): number;
      abort(reason: string): void;
    }
  >();
  let cpu: string | null = null,
    waitingBytes = 0,
    disposed = false;
  let order = 0;
  function schedule() {
    if (cpu || disposed) return;
    const next = [...entries.values()]
      .filter((entry) => entry.canStart())
      .sort((a, b) => a.order() - b.order())[0];
    if (next) next.start();
  }
  return {
    run(raw: unknown, port: TaskPort): Promise<LocalTaskOutcome> {
      const request = localTaskRequestSchema.parse(raw);
      if (disposed) throw new Error("O aplicativo está encerrando suas tarefas.");
      if (
        entries.has(request.id) ||
        entries.size >= 20 ||
        waitingBytes + request.inputBytes > 512 * 1024 * 1024
      )
        throw new Error("Fila local cheia ou identificador de tarefa repetido.");
      return new Promise((resolve, reject) => {
        const abortController = new AbortController();
        let scanner: ReturnType<NonNullable<typeof options.createScanner>> | undefined;
        let scanFinished = false;
        let job: Job,
          result: TaskResult | undefined,
          saved = false,
          inputSaved = false,
          finished = false,
          started = false,
          cpuQueued = true,
          cpuRunning = false,
          stageSequence: number | undefined,
          queuedOrder = ++order,
          createdAt = (options.now ?? Date.now)(),
          lastSequence = 0,
          tail = Promise.resolve();
        const releaseCpu = () => {
          if (cpu === request.id) cpu = null;
        };
        const finish = (outcome?: LocalTaskOutcome, error?: unknown) => {
          if (finished) return;
          finished = true;
          abortController.abort();
          scanner?.close();
          entries.delete(request.id);
          waitingBytes -= request.inputBytes;
          releaseCpu();
          job.finish();
          port.close();
          if (error) reject(error);
          else resolve(outcome ?? { status: "cancelled" });
          schedule();
        };
        const abort = (reason: string) => {
          if (finished) return;
          port.send({ kind: "stop", reason });
          finish(saved ? { status: "preserved", id: request.id, reason } : { status: "cancelled" });
        };
        try {
          job = options.begin(() =>
            abort(
              "O prazo da tarefa terminou. O resultado já preparado foi preservado para revisão após reconectar a conta.",
            ),
          );
        } catch (error) {
          port.close();
          reject(error);
          return;
        }
        const start = () => {
          if (finished || !cpuQueued) return;
          try {
            job.check();
          } catch (error) {
            finish(undefined, error);
            return;
          }
          cpuQueued = false;
          cpuRunning = true;
          cpu = request.id;
          if (!started) {
            started = true;
            port.send({ kind: "start" });
          } else if (stageSequence !== undefined) {
            port.send({ kind: "ack", seq: stageSequence });
            stageSequence = undefined;
          }
        };
        entries.set(request.id, {
          request,
          start,
          canStart: () => cpuQueued && !finished,
          order: () => queuedOrder,
          abort,
        });
        waitingBytes += request.inputBytes;
        port.onClose(() =>
          abort(
            "A janela da tarefa foi fechada. Resultados já preparados permanecem protegidos para retomar.",
          ),
        );
        port.onMessage((raw) => {
          tail = tail
            .then(async () => {
              if (finished) return;
              const message = localTaskMessageSchema.parse(raw);
              if (message.seq <= lastSequence)
                throw new Error("Mensagem de tarefa repetida ou fora de ordem.");
              lastSequence = message.seq;
              if (message.kind === "cancel") {
                if (saved) await options.remove(request.id);
                finish({ status: "cancelled" });
                return;
              }
              if (!started) throw new Error("A tarefa ainda está na fila.");
              job.check();
              const checkpoint = async () => {
                job.check();
                if (finished) throw new Error("Tarefa encerrada.");
              };
              if (message.kind === "scanPage") {
                if (
                  request.kind !== "scanning" ||
                  !request.scanner ||
                  !options.createScanner ||
                  !cpuRunning ||
                  cpuQueued ||
                  scanFinished
                )
                  throw new Error("A tarefa não está na etapa autorizada de aquisição WIA.");
                if ((result?.pages ?? 0) >= request.scanner.maximumPages) {
                  scanFinished = true;
                  scanner?.close();
                  port.send({ kind: "ack", seq: message.seq, scanDone: true });
                  return;
                }
                scanner ??= options.createScanner(request.scanner, abortController.signal);
                const next = await scanner.next(result);
                await checkpoint();
                if (next === null) {
                  scanFinished = true;
                  scanner.close();
                  port.send({ kind: "ack", seq: message.seq, scanDone: true });
                  return;
                }
                const prepared = taskResultSchema.parse(next);
                if (
                  prepared.extension !== "pdf" ||
                  prepared.detail?.kind !== "scanning" ||
                  prepared.detail.stage !== "acquiring" ||
                  prepared.pages !== (result?.pages ?? 0) + 1 ||
                  prepared.detail.pages !== prepared.pages ||
                  prepared.pages > request.scanner.maximumPages
                )
                  throw new Error("A página WIA não corresponde à sequência digitalizada.");
                await options.preserve({ request, createdAt, result: prepared }, checkpoint);
                result = prepared;
                saved = true;
                port.send({ kind: "ack", seq: message.seq, result: prepared });
                return;
              }
              if (message.kind === "flattenPrint") {
                if (
                  request.kind !== "printing" ||
                  result?.detail?.kind !== "printing" ||
                  result.detail.stage !== "input" ||
                  !cpuRunning ||
                  !options.flattenPrint
                )
                  throw new Error("A tarefa não está na etapa de preparação vetorial.");
                const prepared = await options.flattenPrint(
                  result,
                  checkpoint,
                  abortController.signal,
                );
                await checkpoint();
                if (
                  prepared.extension !== "pdf" ||
                  prepared.detail?.kind !== "printing" ||
                  prepared.detail.stage !== "flattened"
                )
                  throw new Error("Resultado de impressão vetorial incompatível.");
                await options.preserve({ request, createdAt, result: prepared }, checkpoint);
                result = prepared;
                saved = true;
                port.send({ kind: "ack", seq: message.seq, result: prepared });
                return;
              }
              if (message.kind === "print") {
                if (
                  request.kind !== "printing" ||
                  result?.detail?.kind !== "printing" ||
                  result.detail.stage !== "output" ||
                  cpuQueued ||
                  cpuRunning ||
                  !options.print
                )
                  throw new Error("Revise a cópia de impressão antes de enviar ao sistema.");
                const printed = await options.print(result, checkpoint, abortController.signal);
                if (!printed.submitted) {
                  port.send({ kind: "ack", seq: message.seq, printed: false });
                  return;
                }
                let warning = printed.warning;
                try {
                  await options.remove(request.id);
                } catch {
                  warning = [
                    warning,
                    "A impressão foi enviada ao sistema, mas sua cópia preparada continua em Tarefas. Descarte-a quando não for mais necessária.",
                  ]
                    .filter(Boolean)
                    .join(" ");
                }
                port.send({ kind: "ack", seq: message.seq, printed: true });
                finish({ status: "printed", ...(warning ? { warning } : {}) });
                return;
              }
              if (message.kind === "input") {
                if (
                  request.kind !== "compression" ||
                  !request.inputIdentity ||
                  !sameCompressionSource(request.inputIdentity, message.input.source) ||
                  !cpuRunning ||
                  inputSaved ||
                  result ||
                  !options.preserveInput
                )
                  throw new Error(
                    "A entrada não corresponde à origem vinculada ou à etapa da tarefa.",
                  );
                await options.preserveInput(
                  { request, createdAt, input: message.input },
                  checkpoint,
                );
                saved = true;
                inputSaved = true;
                port.send({ kind: "ack", seq: message.seq });
                return;
              }
              if (message.kind === "stage") {
                if (!result || cpuQueued || cpuRunning)
                  throw new Error(
                    "A tarefa já tem uma etapa de CPU em andamento ou ainda não tem resultado.",
                  );
                if (request.kind === "scanning") {
                  scanner?.close();
                  scanner = undefined;
                  scanFinished = false;
                }
                cpuQueued = true;
                queuedOrder = ++order;
                stageSequence = message.seq;
                schedule();
                return;
              }
              if (
                message.kind === "ready" ||
                message.kind === "checkpointResult" ||
                message.kind === "update" ||
                message.kind === "progress" ||
                message.kind === "checkpointBatch"
              ) {
                const nextResult =
                  message.kind === "checkpointBatch"
                    ? request.kind === "batch" &&
                      result?.detail?.kind === "batch" && {
                        ...result,
                        bytes: message.bytes,
                        detail: message.detail,
                      }
                    : message.kind === "update" || message.kind === "progress"
                      ? result && { ...result, detail: message.detail }
                      : message.result;
                if (
                  !nextResult ||
                  cpuQueued ||
                  (message.kind === "update" ? cpuRunning : !cpuRunning) ||
                  nextResult.extension !== request.extension ||
                  (request.kind === "conversion"
                    ? nextResult.detail !== undefined
                    : nextResult.detail?.kind !== request.kind)
                )
                  throw new Error("Resultado repetido ou incompatível com o formato escolhido.");
                assertPrintRestriction(request, nextResult.detail);
                if (result?.detail?.kind === "batch" && nextResult.detail?.kind === "batch")
                  assertBatchAdvance(result.detail, nextResult.detail);
                await options.preserve({ request, createdAt, result: nextResult }, checkpoint);
                saved = true;
                result = nextResult;
                if (message.kind === "ready") {
                  if (request.kind === "scanning") {
                    scanner?.close();
                    scanFinished = true;
                  }
                  cpuRunning = false;
                  releaseCpu();
                }
                port.send({ kind: "ack", seq: message.seq });
                schedule();
              } else if (message.kind === "checkpoint")
                port.send({ kind: "ack", seq: message.seq });
              else {
                if (request.printOnly)
                  throw new Error(
                    "Esta senha autoriza somente impressão; salvar esta cópia está bloqueado.",
                  );
                if (
                  !result ||
                  cpuQueued ||
                  cpuRunning ||
                  (result.detail?.kind === "ocr" && result.detail.stage !== "output") ||
                  (result.detail?.kind === "printing" && result.detail.stage !== "output") ||
                  (result.detail?.kind === "scanning" && result.detail.stage !== "review") ||
                  (result.detail?.kind === "batch" && result.detail.stage !== "review")
                )
                  throw new Error("A tarefa não tem resultado revisado para salvar.");
                const path = await options.save(request, result, checkpoint);
                if (path === null) {
                  port.send({ kind: "ack", seq: message.seq });
                  return;
                }
                let warning: string | undefined;
                try {
                  await options.remove(request.id);
                } catch {
                  warning =
                    "O arquivo foi salvo, mas não foi possível limpar sua cópia preparada. Confira e descarte os arquivos locais pela janela Tarefas.";
                }
                port.send({ kind: "ack", seq: message.seq, savedPath: path });
                finish({ status: "saved", path, ...(warning ? { warning } : {}) });
              }
            })
            .catch((error: unknown) => {
              if (!finished) {
                port.send({
                  kind: "error",
                  error: error instanceof Error ? error.message : "Falha na tarefa local.",
                });
                finish(
                  saved
                    ? {
                        status: "preserved",
                        id: request.id,
                        reason:
                          "A tarefa encontrou uma falha e conservou seu resultado para revisão.",
                      }
                    : undefined,
                  saved ? undefined : error,
                );
              }
            });
        });
        schedule();
      });
    },
    dispose() {
      disposed = true;
      for (const entry of [...entries.values()])
        entry.abort("O aplicativo foi encerrado. Resultados preparados permanecem preservados.");
    },
  };
}

import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import {
  type Dimensions,
  type Margins,
  type ScrollAxis,
  scrollBudget,
  scrollDimensions,
} from "../domain/scroll.ts";

export type ScrollImage = { getSize(): Dimensions; toBitmap(): Uint8Array };
const seamSchema = z
  .object({
    overlap: z.number().int().min(0),
    confidence: z.number().min(0).max(1),
    warning: z.string().max(256),
    automatic: z.boolean(),
  })
  .strict();
const sizeSchema = z
  .object({
    width: z.number().int().positive().max(30000),
    height: z.number().int().positive().max(30000),
  })
  .strict();
const replySchema = z
  .object({
    session: z.string().uuid(),
    request: z.number().int().positive(),
    error: z.string().max(512).optional(),
    seams: z.array(seamSchema).max(30).optional(),
    difference: z.number().min(0).optional(),
    dimensions: sizeSchema.optional(),
    cuts: z.array(z.number().int().min(0)).max(30).optional(),
    result: sizeSchema
      .extend({ bitmap: z.instanceof(Uint8Array) })
      .strict()
      .optional(),
  })
  .strict();
export type ScrollReply = z.infer<typeof replySchema>;
export class ScrollWorker {
  readonly session = randomUUID();
  private worker: Worker | undefined;
  private sequence = 0;
  private pending:
    | {
        request: number;
        resolve: (value: ScrollReply) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private closed = false;
  private entry: string | URL;
  constructor(entry: string | URL) {
    this.entry = entry;
  }
  cancel(): void {
    this.closed = true;
    this.fail(new Error("Processamento cancelado; trechos preservados."));
  }
  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate();
  }
  async run(
    op: "analyze" | "preview" | "stitch" | "review",
    images: ScrollImage[],
    cuts: number[],
    axis: ScrollAxis,
    margins: Margins,
    retained: ScrollImage[] = images,
  ): Promise<ScrollReply> {
    if (this.closed) throw new Error("Sessão de processamento encerrada.");
    if (this.pending) throw new Error("Aguarde o processamento em andamento.");
    const sizes = images.map((i) => ({
      width: i.getSize().width - margins.left - margins.right,
      height: i.getSize().height - margins.top - margins.bottom,
    }));
    const dimensions = scrollDimensions(sizes, cuts, axis);
    const retainedBytes = scrollBudget(
      retained.map((i) => i.getSize()),
      dimensions,
    );
    const frames = images.map((image) => {
      const size = image.getSize(),
        source = image.toBitmap();
      if (source.byteLength !== size.width * size.height * 4) throw new Error("Bitmap inválido.");
      // Dedicated memory: never detach NativeImage/Buffer pools or the recoverable original.
      const bitmap = new Uint8Array(new ArrayBuffer(source.byteLength));
      bitmap.set(source);
      return { ...size, bitmap };
    });
    if (!this.worker) {
      const worker = new Worker(this.entry);
      this.worker = worker;
      worker.on("message", (input: unknown) => {
        if (worker !== this.worker || this.closed) return;
        const parsed = replySchema.safeParse(input);
        if (!parsed.success) return this.fail(new Error("Resposta inválida do worker."));
        const result = parsed.data,
          pending = this.pending;
        if (!pending || result.session !== this.session || result.request !== pending.request)
          return this.fail(new Error("Resposta obsoleta do worker."));
        if (result.error) return this.fail(new Error(result.error));
        if (
          result.result &&
          result.result.bitmap.byteLength !== result.result.width * result.result.height * 4
        )
          return this.fail(new Error("Bitmap incompleto do worker."));
        clearTimeout(pending.timer);
        this.pending = undefined;
        worker.unref();
        pending.resolve(result);
      });
      worker.on("error", () => {
        if (worker === this.worker) this.fail(new Error("Worker falhou; trechos preservados."));
      });
      worker.on("exit", () => {
        if (worker === this.worker) this.fail(new Error("Worker encerrou; trechos preservados."));
      });
    }
    const worker = this.worker;
    worker.ref();
    const request = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending = {
        request,
        resolve,
        reject,
        timer: setTimeout(
          () => this.fail(new Error("Tempo de processamento excedido; trechos preservados.")),
          30000,
        ),
      };
      try {
        worker.postMessage(
          { session: this.session, request, op, frames, cuts, axis, margins, retainedBytes },
          frames.map((f) => f.bitmap.buffer),
        );
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error("Falha ao transferir pixels."));
      }
    });
  }
}

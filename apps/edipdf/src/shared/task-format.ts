import { ocrLanguageSchema, ocrResultSchema } from "@informach/edi-ocr";
import { z } from "zod";
import { batchDetailSchema } from "./batch-format.ts";
import {
  type CompressionInput,
  compressionInputSchema,
  compressionSourceSchema,
} from "./compression-task-format.ts";
import { conversionResultSchema } from "./conversion-format.ts";
import { printSettingsSchema } from "./print-format.ts";
import { scannerSettingsSchema } from "./scanner-format.ts";
export const scanningTaskDetailSchema = z.strictObject({
  kind: z.literal("scanning"),
  stage: z.enum(["acquiring", "review"]),
  pages: z.number().int().min(1).max(100),
});
export const printingTaskDetailSchema = z.strictObject({
  kind: z.literal("printing"),
  stage: z.enum(["input", "flattened", "output"]),
  settings: printSettingsSchema,
  printOnly: z.boolean().optional(),
});
export const ocrTaskDetailSchema = z
  .strictObject({
    kind: z.literal("ocr"),
    stage: z.enum(["recognizing", "review", "output"]),
    remaining: z.array(z.number().int().nonnegative().max(100000)).max(100).default([]),
    options: z.strictObject({
      language: ocrLanguageSchema,
      dpi: z.union([z.literal(150), z.literal(200), z.literal(300)]),
      force: z.boolean(),
      turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      skew: z.number().finite().min(-10).max(10),
      autoOrientation: z.boolean(),
      autoSkew: z.boolean(),
    }),
    skipped: z.number().int().nonnegative().max(1000),
    pages: z
      .array(
        z.strictObject({
          page: z.number().int().nonnegative().max(100000),
          turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
          skew: z.number().finite().min(-10).max(10),
          result: ocrResultSchema,
          preview: z
            .string()
            .max(2 * 1024 * 1024)
            .regex(/^data:image\/jpeg;base64,[a-z\d+/]+=*$/i),
        }),
      )
      .max(100),
  })
  .superRefine((detail, context) => {
    let words = 0,
      characters = 0,
      previews = 0;
    for (const page of detail.pages) {
      words += page.result.words.length;
      previews += page.preview.length;
      for (const word of page.result.words) characters += word.text.length;
    }
    if (words > 200000 || characters > 5_000_000 || previews > 32 * 1024 * 1024)
      context.addIssue({
        code: "custom",
        message: "A revisão OCR excede os limites locais de palavras, texto ou prévias.",
      });
    if (new Set(detail.pages.map((page) => page.page)).size !== detail.pages.length)
      context.addIssue({ code: "custom", message: "Páginas OCR repetidas na revisão." });
    if (
      new Set(detail.remaining).size !== detail.remaining.length ||
      detail.remaining.some((page) => detail.pages.some((done) => done.page === page)) ||
      (detail.stage !== "recognizing" && detail.remaining.length)
    )
      context.addIssue({
        code: "custom",
        message: "Páginas OCR pendentes inconsistentes com a etapa de revisão.",
      });
  });
export const compressionTaskDetailSchema = z.strictObject({
  kind: z.literal("compression"),
  before: z.number().int().positive(),
  target: z.number().int().positive().optional(),
  targetMet: z.boolean(),
  page: z.number().int().nonnegative(),
  originalPreview: z
    .string()
    .max(16 * 1024 * 1024)
    .regex(/^data:image\/(?:png|jpeg);base64,[a-z\d+/]+=*$/i)
    .optional(),
});
export const taskResultSchema = conversionResultSchema.extend({
  detail: z
    .discriminatedUnion("kind", [
      ocrTaskDetailSchema,
      compressionTaskDetailSchema,
      printingTaskDetailSchema,
      scanningTaskDetailSchema,
      batchDetailSchema,
    ])
    .optional(),
});
export type TaskResult = z.infer<typeof taskResultSchema>;
export type TaskDetail = NonNullable<TaskResult["detail"]>;
export const taskDetailSchema = z.discriminatedUnion("kind", [
  ocrTaskDetailSchema,
  compressionTaskDetailSchema,
  printingTaskDetailSchema,
  scanningTaskDetailSchema,
  batchDetailSchema,
]);
export const localTaskRequestSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.enum(["conversion", "ocr", "compression", "printing", "scanning", "batch"]),
    label: z.string().min(1).max(1000),
    defaultName: z.string().min(1).max(1000),
    extension: conversionResultSchema.shape.extension,
    originPaths: z.array(z.string().min(1).max(32768)).max(1000).default([]),
    inputBytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
    inputIdentity: compressionSourceSchema.optional(),
    printOnly: z.boolean().optional(),
    scanner: scannerSettingsSchema.optional(),
    destination: z
      .strictObject({ path: z.string().min(1).max(32768), unique: z.boolean() })
      .optional(),
  })
  .superRefine((request, context) => {
    const leaf = request.defaultName.split(/[\\/]/).at(-1) ?? "",
      suffix = `.${request.extension}`;
    if (!leaf.toLowerCase().endsWith(suffix) || leaf.length <= suffix.length)
      context.addIssue({
        code: "custom",
        message: "O nome da tarefa não corresponde ao formato escolhido.",
      });
    if (request.kind === "batch" && request.extension !== "zip")
      context.addIssue({ code: "custom", message: "Lotes preparados exigem um pacote ZIP local." });
    if (
      request.kind === "scanning" &&
      (!request.scanner ||
        request.extension !== "pdf" ||
        request.inputBytes !== 32 * 1024 * 1024 ||
        request.originPaths.length)
    )
      context.addIssue({
        code: "custom",
        message: "Digitalização exige ajustes WIA, PDF de saída e reserva local por página.",
      });
    if (request.kind !== "scanning" && request.scanner)
      context.addIssue({ code: "custom", message: "Esta tarefa não pode iniciar hardware WIA." });
    if (request.kind === "printing" && request.extension !== "pdf")
      context.addIssue({ code: "custom", message: "A impressão exige saída PDF." });
    if (request.printOnly && request.kind !== "printing")
      context.addIssue({
        code: "custom",
        message: "A restrição de impressão exige uma tarefa de impressão.",
      });
    if (
      request.kind === "compression" &&
      (!request.inputIdentity ||
        request.inputIdentity.length !== request.inputBytes ||
        request.extension !== "pdf")
    )
      context.addIssue({
        code: "custom",
        message:
          "A tarefa de compactação precisa estar vinculada à origem e ao tamanho escolhidos.",
      });
    if (request.kind !== "compression" && (request.inputIdentity || request.destination))
      context.addIssue({
        code: "custom",
        message: "Esta tarefa não aceita outra origem ou um destino pré-selecionado.",
      });
  });
export type LocalTaskRequest = z.infer<typeof localTaskRequestSchema>;

/** Restriction belongs to the original request and cannot be removed by a later checkpoint. */
export function assertPrintRestriction(
  request: LocalTaskRequest,
  detail: TaskDetail | undefined,
): void {
  if (Boolean(request.printOnly) !== Boolean(detail?.kind === "printing" && detail.printOnly))
    throw new Error("A cópia protegida não corresponde à permissão de impressão da tarefa.");
  if (request.printOnly && (detail?.kind !== "printing" || detail.stage !== "output"))
    throw new Error("A impressão restrita exige uma cópia de aparência completa.");
}
export function taskDisplayName(request: Pick<LocalTaskRequest, "kind" | "defaultName">): string {
  return request.kind === "batch"
    ? request.defaultName.replace(/\.zip$/i, "")
    : request.defaultName;
}
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const localTaskMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), seq: sequence, result: taskResultSchema }),
  z.strictObject({ kind: z.literal("checkpointResult"), seq: sequence, result: taskResultSchema }),
  z.strictObject({
    kind: z.literal("checkpointBatch"),
    seq: sequence,
    bytes: conversionResultSchema.shape.bytes,
    detail: batchDetailSchema,
  }),
  z.strictObject({ kind: z.literal("update"), seq: sequence, detail: taskDetailSchema }),
  z.strictObject({ kind: z.literal("progress"), seq: sequence, detail: taskDetailSchema }),
  z.strictObject({ kind: z.literal("stage"), seq: sequence }),
  z.strictObject({ kind: z.literal("flattenPrint"), seq: sequence }),
  z.strictObject({ kind: z.literal("print"), seq: sequence }),
  z.strictObject({ kind: z.literal("scanPage"), seq: sequence }),
  z.strictObject({ kind: z.literal("input"), seq: sequence, input: compressionInputSchema }),
  z.strictObject({ kind: z.literal("save"), seq: sequence }),
  z.strictObject({ kind: z.literal("checkpoint"), seq: sequence }),
  z.strictObject({ kind: z.literal("cancel"), seq: sequence }),
]);
export type LocalTaskMessage = z.infer<typeof localTaskMessageSchema>;
export const localTaskOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("printed"), warning: z.string().max(2000).optional() }),
  z.strictObject({
    status: z.literal("saved"),
    path: z.string().min(1).max(32768),
    warning: z.string().max(2000).optional(),
  }),
  z.strictObject({ status: z.literal("cancelled") }),
  z.strictObject({ status: z.literal("preserved"), id: z.uuid(), reason: z.string().max(2000) }),
]);
export type LocalTaskOutcome = z.infer<typeof localTaskOutcomeSchema>;
export const localTaskReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("start") }),
  z.strictObject({
    kind: z.literal("ack"),
    seq: sequence,
    savedPath: z.string().max(32768).optional(),
    result: taskResultSchema.optional(),
    printed: z.boolean().optional(),
    scanDone: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("error"),
    seq: sequence.optional(),
    error: z.string().max(2000),
  }),
  z.strictObject({ kind: z.literal("stop"), reason: z.string().max(2000) }),
]);
export type LocalTaskReply = z.infer<typeof localTaskReplySchema>;
export interface PendingLocalTask {
  request: LocalTaskRequest;
  createdAt: number;
  result: TaskResult;
}
export interface PendingCompressionInput {
  request: LocalTaskRequest;
  createdAt: number;
  input: CompressionInput;
}
export interface ResolvedCompressionInput extends PendingCompressionInput {
  fileBytes?: Uint8Array;
}
export interface PendingTaskList {
  tasks: {
    id: string;
    kind: LocalTaskRequest["kind"];
    label: string;
    name: string;
    extension: string;
    createdAt: number;
    bytes: number;
    state: "processing" | "review";
  }[];
  errors: { id: string; message: string }[];
}

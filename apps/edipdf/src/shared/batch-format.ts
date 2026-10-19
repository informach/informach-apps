import { z } from "zod";

export const splitStrategySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("bookmarks"), level: z.number().int().min(1).max(100) }),
  z.strictObject({
    kind: z.literal("size"),
    maxBytes: z
      .number()
      .int()
      .min(1024)
      .max(32 * 1024 * 1024),
  }),
]);
export const batchSettingsSchema = z
  .discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("split"),
      pagesPerFile: z.number().int().min(1).max(1000),
      strategy: splitStrategySchema.optional(),
      groups: z
        .array(
          z
            .array(z.number().int().nonnegative().max(999))
            .min(1)
            .max(1000)
            .refine(
              (pages) => new Set(pages).size === pages.length,
              "Uma parte contém páginas repetidas.",
            ),
        )
        .min(1)
        .max(100)
        .optional(),
    }),
    z.strictObject({
      operation: z.literal("images"),
      pages: z.array(z.number().int().nonnegative().max(999)).min(1).max(100),
      format: z.enum(["png", "jpg"]),
      dpi: z.union([z.literal(72), z.literal(150), z.literal(300)]),
    }),
  ])
  .superRefine((settings, context) => {
    if (settings.operation === "images" && new Set(settings.pages).size !== settings.pages.length)
      context.addIssue({
        code: "custom",
        message: "A exportação de imagens contém páginas repetidas.",
      });
  });
export type BatchSettings = z.infer<typeof batchSettingsSchema>;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const batchDetailSchema = z
  .strictObject({
    kind: z.literal("batch"),
    version: z.literal(1),
    stage: z.enum(["processing", "review"]),
    settings: batchSettingsSchema,
    sourceSha256: digest,
    sourcePages: z.number().int().min(1).max(1000),
    total: z.number().int().min(1).max(100),
    files: z
      .array(
        z.strictObject({
          name: z.string().regex(/^(?:parte-\d{3}\.pdf|pagina-\d{4}\.(?:png|jpg))$/),
          sha256: digest,
          bytes: z
            .number()
            .int()
            .min(1)
            .max(32 * 1024 * 1024),
          pages: z.array(z.number().int().min(1).max(1000)).min(1).max(1000),
        }),
      )
      .max(100),
  })
  .superRefine((detail, context) => {
    if (detail.settings.operation === "split" && detail.settings.strategy) {
      const pages = detail.settings.groups?.flat();
      if (
        !pages ||
        pages.length !== detail.sourcePages ||
        pages.some((page, index) => page !== index)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "O plano de divisão deve conservar todas as páginas, uma vez e na ordem original.",
        });
        return;
      }
    }
    const expected =
      detail.settings.operation === "split"
        ? (detail.settings.groups?.length ??
          Math.ceil(detail.sourcePages / detail.settings.pagesPerFile))
        : detail.settings.pages.length;
    if (
      detail.total !== expected ||
      detail.files.length > expected ||
      (detail.stage === "review"
        ? detail.files.length !== expected
        : detail.files.length === expected) ||
      detail.files.reduce((sum, file) => sum + file.bytes, 0) > 128 * 1024 * 1024
    ) {
      context.addIssue({ code: "custom", message: "Progresso/limites do lote inconsistentes." });
      return;
    }
    if (
      detail.settings.operation === "images" &&
      detail.settings.pages.some((page) => page >= detail.sourcePages)
    )
      context.addIssue({ code: "custom", message: "O lote referencia uma página inexistente." });
    if (
      detail.settings.operation === "split" &&
      detail.settings.groups?.some((group) => group.some((page) => page >= detail.sourcePages))
    )
      context.addIssue({ code: "custom", message: "Uma parte referencia uma página inexistente." });
    for (const [index, file] of detail.files.entries()) {
      const settings = detail.settings;
      if (
        settings.operation === "split" &&
        settings.strategy?.kind === "size" &&
        file.bytes > settings.strategy.maxBytes
      )
        context.addIssue({
          code: "custom",
          message: "Uma parte excede o tamanho máximo escolhido.",
        });
      const expectedPages =
        settings.operation === "split"
          ? (settings.groups?.[index]?.map((page) => page + 1) ??
            Array.from(
              {
                length: Math.min(
                  settings.pagesPerFile,
                  detail.sourcePages - index * settings.pagesPerFile,
                ),
              },
              (_, offset) => index * settings.pagesPerFile + offset + 1,
            ))
          : [(settings.pages[index] ?? -1) + 1];
      const name =
        detail.settings.operation === "split"
          ? `parte-${String(index + 1).padStart(3, "0")}.pdf`
          : `pagina-${String(expectedPages[0]).padStart(4, "0")}.${detail.settings.format}`;
      if (file.name !== name || JSON.stringify(file.pages) !== JSON.stringify(expectedPages))
        context.addIssue({
          code: "custom",
          message: "Ordem/nomes/páginas do lote inconsistentes.",
        });
    }
  });
export type BatchDetail = z.infer<typeof batchDetailSchema>;
export function assertBatchAdvance(previous: BatchDetail, next: BatchDetail): void {
  if (
    previous.sourceSha256 !== next.sourceSha256 ||
    previous.sourcePages !== next.sourcePages ||
    previous.total !== next.total ||
    JSON.stringify(previous.settings) !== JSON.stringify(next.settings)
  )
    throw new Error("A origem ou os ajustes do lote protegido não podem mudar durante a retomada.");
  if (
    next.files.length < previous.files.length ||
    previous.files.some((file, index) => JSON.stringify(file) !== JSON.stringify(next.files[index]))
  )
    throw new Error("O checkpoint não pode retroceder ou alterar um arquivo completo do lote.");
}

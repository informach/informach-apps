import { z } from "zod";

export const tableBoxSchema = z.strictObject({
  x: z.number().finite().nonnegative().max(16000),
  y: z.number().finite().nonnegative().max(16000),
  w: z.number().finite().positive().max(16000),
  h: z.number().finite().positive().max(16000),
});
export const tableSettingsSchema = z
  .strictObject({
    page: z.number().int().nonnegative().max(999),
    area: tableBoxSchema,
    separators: z.array(z.number().finite().nonnegative().max(16000)).max(199),
    header: z.boolean(),
  })
  .superRefine((settings, context) => {
    let previous = settings.area.x;
    for (const separator of settings.separators) {
      if (separator <= previous || separator >= settings.area.x + settings.area.w)
        context.addIssue({
          code: "custom",
          message: "As divisões devem estar em ordem, dentro da área e sem repetições.",
        });
      previous = separator;
    }
  });
export const tableEvidenceSchema = z
  .strictObject({
    version: z.literal(1),
    source: z.strictObject({
      title: z.string().max(1000),
      sha256: z.string().regex(/^[a-f\d]{64}$/),
      page: z.number().int().positive().max(1000),
      width: z.number().finite().positive().max(16000),
      height: z.number().finite().positive().max(16000),
      area: tableBoxSchema,
      separators: z.array(z.number().finite()).max(199),
    }),
    rows: z
      .array(
        z
          .array(
            z.strictObject({
              value: z.string().max(32767),
              address: z.string().regex(/^R[1-9]\d{0,4}C[1-9]\d{0,2}$/),
              box: tableBoxSchema
                .extend({
                  x: z.number().finite().min(-16000).max(16000),
                  y: z.number().finite().min(-16000).max(16000),
                  w: z.number().finite().nonnegative().max(16000),
                  h: z.number().finite().nonnegative().max(16000),
                })
                .nullable(),
              ambiguous: z.boolean(),
            }),
          )
          .min(1)
          .max(200),
      )
      .min(1)
      .max(10000),
  })
  .superRefine((evidence, context) => {
    const source = evidence.source;
    if (
      source.area.x + source.area.w > source.width + 0.01 ||
      source.area.y + source.area.h > source.height + 0.01 ||
      !tableSettingsSchema.safeParse({
        page: source.page - 1,
        area: source.area,
        separators: source.separators,
        header: false,
      }).success ||
      evidence.rows.some((row) => row.length !== source.separators.length + 1)
    )
      context.addIssue({
        code: "custom",
        message: "Geometria/colunas da origem não correspondem à tabela.",
      });
    let cells = 0,
      characters = 0;
    for (const [rowIndex, row] of evidence.rows.entries())
      for (const [column, cell] of row.entries()) {
        cells++;
        characters += cell.value.length;
        if (cell.address !== `R${rowIndex + 1}C${column + 1}`)
          context.addIssue({
            code: "custom",
            message: "Endereço de célula não corresponde à posição na tabela.",
          });
      }
    if (cells > 200000 || characters > 5_000_000)
      context.addIssue({
        code: "custom",
        message: "A tabela excede os limites locais de células/texto.",
      });
  });
export type TableSettings = z.infer<typeof tableSettingsSchema>;
export type TableEvidence = z.infer<typeof tableEvidenceSchema>;

import { z } from "zod";

export const printSettingsSchema = z
  .strictObject({
    range: z.string().min(1).max(10000),
    reverse: z.boolean(),
    layout: z.enum(["single", "multiple", "booklet"]),
    perSheet: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(9), z.literal(16)]),
    paper: z.enum(["original", "a4", "letter", "a3"]),
    landscape: z.boolean(),
    fit: z.boolean(),
    scale: z.number().finite().min(10).max(400),
    margin: z.number().finite().min(0).max(144),
    color: z.boolean(),
    copies: z.number().int().min(1).max(999),
    duplex: z.enum(["simplex", "longEdge", "shortEdge"]),
    collate: z.boolean(),
    printer: z.string().min(1).max(512).optional(),
  })
  .superRefine((settings, context) => {
    if (settings.layout !== "single" && settings.paper === "original")
      context.addIssue({
        code: "custom",
        message: "Escolha o papel para várias páginas por folha ou livreto.",
      });
  });
export type PrintSettings = z.infer<typeof printSettingsSchema>;
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  range: "todas",
  reverse: false,
  layout: "single",
  perSheet: 2,
  paper: "original",
  landscape: false,
  fit: true,
  scale: 100,
  margin: 18,
  color: true,
  copies: 1,
  duplex: "simplex",
  collate: true,
};

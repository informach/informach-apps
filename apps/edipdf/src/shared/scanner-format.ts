import { z } from "zod";

export const scannerDeviceSchema = z.strictObject({
  id: z.string().min(1).max(4096),
  name: z.string().min(1).max(512),
});
export const scannerSourceSchema = z.strictObject({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  kind: z.enum(["flatbed", "feeder"]),
  legacy: z.boolean(),
  duplexCapable: z.boolean(),
});
export const scannerSettingsSchema = z.strictObject({
  deviceId: scannerDeviceSchema.shape.id,
  sourceId: scannerSourceSchema.shape.id,
  dpi: z.union([z.literal(150), z.literal(200), z.literal(300)]),
  color: z.enum(["color", "gray", "text"]),
  paper: z.enum(["a4", "letter"]),
  maximumPages: z.number().int().min(1).max(100),
});
export type ScannerSettings = z.infer<typeof scannerSettingsSchema>;
export type ScannerDevice = z.infer<typeof scannerDeviceSchema>;
export type ScannerSource = z.infer<typeof scannerSourceSchema>;
export const scannerRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("describe"), deviceId: scannerDeviceSchema.shape.id }),
  z.strictObject({ action: z.literal("acquire"), settings: scannerSettingsSchema }),
]);
export const scannerReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("devices"), devices: z.array(scannerDeviceSchema).max(128) }),
  z.strictObject({ kind: z.literal("sources"), sources: z.array(scannerSourceSchema).max(256) }),
  z.strictObject({
    kind: z.literal("page"),
    png: z
      .string()
      .min(4)
      .max(45 * 1024 * 1024)
      .base64(),
    dpi: scannerSettingsSchema.shape.dpi,
  }),
  z.strictObject({ kind: z.literal("done"), reason: z.enum(["flatbed", "empty", "limit"]) }),
  z.strictObject({ kind: z.literal("error"), code: z.string().min(1).max(128) }),
]);
export type ScannerReply = z.infer<typeof scannerReplySchema>;
export const scannerPageSchema = z.strictObject({
  bytes: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((value) => value.length > 0 && value.length <= 32 * 1024 * 1024),
  dpi: scannerSettingsSchema.shape.dpi,
});
export type ScannerPage = z.infer<typeof scannerPageSchema>;

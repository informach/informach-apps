import { z } from "zod";
import {
  type CaptureDisplay,
  captureRectSchema,
  planCapture,
  topologyKey,
} from "./capture-geometry.ts";

export const precisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }).strict(),
  z
    .object({
      kind: z.literal("ratio"),
      width: z.number().int().min(1).max(100),
      height: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("fixed"),
      width: z.number().int().min(2).max(32768),
      height: z.number().int().min(2).max(32768),
    })
    .strict(),
]);
export type Precision = z.infer<typeof precisionSchema>;
export const photoOptionsSchema = z
  .object({
    delay: z.number().int().min(0).max(30).default(0),
    cursor: z.boolean().default(false),
    destination: z.enum(["editor", "library"]).default("editor"),
    timing: z.enum(["fresh", "frozen"]).default("fresh"),
    precision: precisionSchema.default({ kind: "free" }),
  })
  .strict();
export const savedRegionSchema = z
  .object({
    topology: z.string().min(1).max(20000),
    rect: captureRectSchema,
    scale: z.number().positive().max(8).optional(),
  })
  .strict();
export type SavedRegion = z.infer<typeof savedRegionSchema>;
export function validateSavedRegion(saved: SavedRegion, displays: CaptureDisplay[]) {
  if (saved.topology !== topologyKey(displays))
    throw new Error("A topologia mudou. Selecione a região novamente.");
  planCapture(
    displays,
    displays.map((d) => ({
      id: d.id,
      width: Math.round(d.bounds.width * d.scaleFactor),
      height: Math.round(d.bounds.height * d.scaleFactor),
    })),
    saved.rect,
    saved.scale,
  );
  return saved.rect;
}
// Deliberately bounded accelerator vocabulary: one key and Control/Alt/Shift modifiers.
export function normalizeShortcut(value: string): string {
  if (!value.trim()) return "";
  const parts = value
    .trim()
    .toUpperCase()
    .split("+")
    .map((p) => p.trim().replace(/^CTRL$|^COMMANDORCONTROL$/, "CONTROL"));
  const key = parts.pop();
  if (
    !key ||
    !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key) ||
    !parts.length ||
    new Set(parts).size !== parts.length ||
    parts.some((p) => !["CONTROL", "ALT", "SHIFT"].includes(p)) ||
    !parts.some((p) => p === "CONTROL" || p === "ALT")
  )
    throw new Error("Atalho inválido. Use Ctrl/Alt, Shift opcional e letra, número ou F1–F24.");
  const result = [
    ...["CONTROL", "ALT", "SHIFT"]
      .filter((p) => parts.includes(p))
      .map((p) => ({ CONTROL: "Control", ALT: "Alt", SHIFT: "Shift" })[p]),
    key,
  ].join("+");
  if (["Control+Shift+S", "Control+Shift+F10"].includes(result))
    throw new Error("Atalho reservado pela captura.");
  return result;
}
export const presetSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    mode: z.enum(["monitor", "all", "active", "region", "region-all", "window", "control"]),
    options: photoOptionsSchema,
    shortcut: z.string().max(80).default("").transform(normalizeShortcut),
    region: savedRegionSchema.optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.region && !["region", "region-all"].includes(p.mode))
      ctx.addIssue({ code: "custom", message: "Região exige modo de região." });
  });
const presetsSchema = z
  .array(presetSchema)
  .max(32)
  .superRefine((list, ctx) => {
    if (
      new Set(list.map((p) => p.id)).size !== list.length ||
      new Set(list.filter((p) => p.shortcut).map((p) => p.shortcut)).size !==
        list.filter((p) => p.shortcut).length
    )
      ctx.addIssue({ code: "custom", message: "Preset ou atalho duplicado." });
  });
export const captureProfileSchema = z
  .object({
    version: z.literal(1).default(1),
    defaults: photoOptionsSchema.default(() => photoOptionsSchema.parse({})),
    presets: presetsSchema.default([]),
    last: savedRegionSchema.optional(),
  })
  .strict();
export const profileUpdateSchema = z
  .object({ defaults: photoOptionsSchema, presets: presetsSchema })
  .strict();
export type CaptureProfile = z.infer<typeof captureProfileSchema>;

import { z } from "zod";

export const propertySchema = z.enum([
  "x",
  "y",
  "rotation",
  "sx",
  "sy",
  "opacity",
  "px",
  "py",
  "skewX",
]);
export type Property = z.infer<typeof propertySchema>;
export const propertyBounds: Readonly<Record<Property, readonly [number, number]>> = {
  x: [-10000, 10000],
  y: [-10000, 10000],
  rotation: [-10000, 10000],
  sx: [-20, 20],
  sy: [-20, 20],
  px: [-10000, 10000],
  py: [-10000, 10000],
  skewX: [-85, 85],
  opacity: [0, 100],
};
const id = z.string().regex(/^[a-z]+-[\w-]{1,100}$/);
export const objectIdSchema = z.string().regex(/^node-[\w-]{1,100}$/);
export const modeSchema = z.enum(["loop", "ping-pong", "once"]);
export const easingSchema = z.union([
  z.enum(["linear", "hold"]),
  z.strictObject({
    kind: z.literal("elastic"),
    amplitude: z.number().min(1).max(10),
    period: z.number().min(0.05).max(2),
  }),
  z.strictObject({
    kind: z.literal("cubic-bezier"),
    points: z.tuple([
      z.number().min(0).max(1),
      z.number().min(-10).max(10),
      z.number().min(0).max(1),
      z.number().min(-10).max(10),
    ]),
  }),
]);
export const keyframeSchema = z.strictObject({
  id,
  frame: z.number().min(0).max(360000),
  value: z.number(),
  easing: easingSchema,
});
export const trackSchema = z.strictObject({
  id,
  targetId: objectIdSchema,
  property: propertySchema,
  keys: z.array(keyframeSchema).min(1).max(10000),
});
/** One stepped key: the listed children of the scope, back to front. */
export const drawOrderKeySchema = z.strictObject({
  id,
  frame: z.number().int().min(0).max(360000),
  order: z.array(objectIdSchema).min(1).max(2000),
});
/** Animated stacking of one parent's direct children (`null` = the artboard root). */
export const drawOrderSchema = z.strictObject({
  id,
  scopeId: objectIdSchema.nullable(),
  keys: z.array(drawOrderKeySchema).min(1).max(1000),
});
export const animationSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(120),
  fps: z.number().int().min(1).max(240),
  frames: z.number().int().min(1).max(360000),
  mode: modeSchema,
  tracks: z.array(trackSchema).max(12000),
  drawOrders: z.array(drawOrderSchema).max(256).optional(),
});
export const motionSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  animations: z.array(animationSchema).max(100),
});
export type Motion = Omit<z.infer<typeof motionSchema>, "version"> & { version: 2 };
export type Animation = z.infer<typeof animationSchema>;
export type Track = z.infer<typeof trackSchema>;
export type DrawOrder = z.infer<typeof drawOrderSchema>;
export type Easing = z.infer<typeof easingSchema>;
export type Transform = {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  opacity: number;
  px?: number;
  py?: number;
  skewX?: number;
};
export const transformSchema = z.strictObject({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  rotation: z.number().min(-10000).max(10000),
  sx: z.number().min(-20).max(20),
  sy: z.number().min(-20).max(20),
  px: z.number().min(-10000).max(10000).optional(),
  py: z.number().min(-10000).max(10000).optional(),
  skewX: z.number().min(-85).max(85).optional(),
  opacity: z.number().min(0).max(100),
});
export const objectTransformPatchSchema = transformSchema.partial();
export const identityTransform = (): Transform => ({
  x: 0,
  y: 0,
  rotation: 0,
  sx: 1,
  sy: 1,
  opacity: 100,
});
export const emptyMotion = (): Motion => ({ version: 2, animations: [] });

/** One validation boundary for files, commands and runtime loaders. */
export function parseMotion(input: unknown, targets: ReadonlySet<string>): Motion {
  // Reject aggregate abuse before Zod recursively clones a document. Per-array
  // bounds alone allow the product of clips, tracks and keys to grow too large.
  let rawTracks = 0,
    rawKeys = 0;
  if (
    typeof input === "object" &&
    input !== null &&
    "animations" in input &&
    Array.isArray(input.animations)
  ) {
    if (input.animations.length > 100) throw new Error("Orçamento de animações excedido.");
    for (const clip of input.animations) {
      if (
        typeof clip === "object" &&
        clip !== null &&
        "drawOrders" in clip &&
        Array.isArray(clip.drawOrders)
      )
        for (const drawOrder of clip.drawOrders) {
          if (
            typeof drawOrder !== "object" ||
            drawOrder === null ||
            !("keys" in drawOrder) ||
            !Array.isArray(drawOrder.keys)
          )
            continue;
          for (const key of drawOrder.keys) {
            rawKeys +=
              1 +
              (typeof key === "object" && key !== null && "order" in key && Array.isArray(key.order)
                ? key.order.length
                : 0);
            if (rawKeys > 100000) throw new Error("Orçamento de chaves excedido.");
          }
        }
      if (
        typeof clip !== "object" ||
        clip === null ||
        !("tracks" in clip) ||
        !Array.isArray(clip.tracks)
      )
        continue;
      rawTracks += clip.tracks.length;
      if (rawTracks > 12000) throw new Error("Orçamento de trilhas excedido.");
      for (const track of clip.tracks) {
        if (
          typeof track !== "object" ||
          track === null ||
          !("keys" in track) ||
          !Array.isArray(track.keys)
        )
          continue;
        rawKeys += track.keys.length;
        if (rawKeys > 100000) throw new Error("Orçamento de chaves excedido.");
      }
    }
  }
  const parsed = motionSchema.parse(input, { jitless: true });
  if (parsed.version === 1)
    for (const clip of parsed.animations)
      for (const track of clip.tracks) {
        if (
          track.property === "px" ||
          track.property === "py" ||
          track.property === "skewX" ||
          track.keys.some(
            (key) =>
              (typeof key.easing !== "string" && key.easing.kind === "elastic") ||
              ((track.property === "sx" || track.property === "sy") && key.value <= 0),
          )
        )
          throw new Error("Canal/interpolação exige o formato de movimento v2.");
      }
  const motion: Motion = { ...parsed, version: 2 };
  const ids = new Set<string>();
  let keyCount = 0,
    trackCount = 0;
  const remember = (value: string) => {
    if (ids.has(value)) throw new Error("ID de animação/trilha/chave duplicado.");
    ids.add(value);
  };
  for (const animation of motion.animations) {
    remember(animation.id);
    const channels = new Set<string>();
    for (const track of animation.tracks) {
      if (++trackCount > 12000) throw new Error("Orçamento de trilhas excedido.");
      remember(track.id);
      if (!targets.has(track.targetId)) throw new Error("Trilha referencia um objeto inexistente.");
      const channel = `${track.targetId}:${track.property}`;
      if (channels.has(channel))
        throw new Error("Há duas trilhas para a mesma propriedade/objeto.");
      channels.add(channel);
      let previous = -1;
      const [min, max] = propertyBounds[track.property];
      for (const key of track.keys) {
        remember(key.id);
        if (++keyCount > 100000) throw new Error("Orçamento de chaves excedido.");
        if (key.frame <= previous || key.frame > animation.frames)
          throw new Error("Chaves precisam ser ordenadas, únicas e dentro da duração.");
        if (key.value < min || key.value > max)
          throw new Error("Valor de chave fora dos limites da propriedade.");
        previous = key.frame;
      }
    }
    const scopes = new Set<string>();
    for (const drawOrder of animation.drawOrders ?? []) {
      remember(drawOrder.id);
      if (drawOrder.scopeId !== null && !targets.has(drawOrder.scopeId))
        throw new Error("Ordem de desenho referencia um grupo inexistente.");
      // Root orders of several artboards may share a project clip; documents allow one.
      if (drawOrder.scopeId !== null) {
        if (scopes.has(drawOrder.scopeId))
          throw new Error("Há duas ordens de desenho para o mesmo grupo.");
        scopes.add(drawOrder.scopeId);
      }
      let previous = -1;
      for (const key of drawOrder.keys) {
        remember(key.id);
        keyCount += key.order.length;
        if (++keyCount > 100000) throw new Error("Orçamento de chaves excedido.");
        if (key.frame <= previous || key.frame > animation.frames)
          throw new Error("Chaves precisam ser ordenadas, únicas e dentro da duração.");
        if (new Set(key.order).size !== key.order.length)
          throw new Error("Ordem de desenho repete um objeto.");
        for (const target of key.order)
          if (!targets.has(target) || target === drawOrder.scopeId)
            throw new Error("Ordem de desenho referencia um objeto inexistente.");
        previous = key.frame;
      }
    }
  }
  return motion;
}

import type { Annotation } from "./annotation.ts";
import { DEFAULT_TRANSFORM, type Transform } from "./compose.ts";
import type { Asset, Clip } from "./types.ts";

/**
 * Copy and paste of a clip's properties onto other clips (Premiere's "Paste Attributes",
 * Camtasia's "Copy/Paste Properties"), in groups the user picks.
 */

export type PropGroup =
  | "position"
  | "movement"
  | "crop"
  | "opacity"
  | "shadow"
  | "animation"
  | "audio"
  | "speed"
  | "transition"
  | "style"
  | "background";

export const PROP_GROUPS: { id: PropGroup; label: string; hint: string }[] = [
  { id: "position", label: "Posição e tamanho", hint: "onde fica e o tamanho na tela" },
  { id: "movement", label: "Movimento", hint: "posições marcadas ao longo do clipe" },
  {
    id: "crop",
    label: "Corte, cantos e borda",
    hint: "recorte das bordas, cantos arredondados ou círculo, cor da borda",
  },
  { id: "opacity", label: "Opacidade", hint: "transparência do clipe" },
  { id: "shadow", label: "Sombra projetada", hint: "" },
  { id: "animation", label: "Entrada e saída", hint: "animações e dissolves do começo e do fim" },
  { id: "audio", label: "Volume e redução de ruído", hint: "" },
  {
    id: "speed",
    label: "Velocidade",
    hint: "muda a duração; o que vem depois na faixa anda junto",
  },
  { id: "transition", label: "Transição", hint: "a transição do corte antes do clipe" },
  {
    id: "style",
    label: "Estilo da anotação",
    hint: "cores, preenchimento, contorno, sombra, fonte e traço (o texto fica)",
  },
  {
    id: "background",
    label: "Remoção de fundo",
    hint: "vale para a mídia inteira, em todos os clipes dela",
  },
];

/** What the copied clip had: the clip itself and the bits that live outside it. */
export interface CopiedProps {
  clip: Clip;
  kind: Asset["kind"];
  hasAudio: boolean;
  key?: Asset["key"];
  name: string;
}

/** Look of an annotation, without its content (text) or geometry (direction, length, size, tail). */
export const ANNOTATION_STYLE_KEYS = [
  "color",
  "fill",
  "fillOpacity",
  "outline",
  "shadow",
  "fontFamily",
  "fontSize",
  "ink",
  "accent",
  "arrowStyle",
  "thickness",
  "headSize",
  "heads",
  "curve",
  "shape",
] as const;

type Target = { clip: Clip; kind: Asset["kind"]; hasAudio: boolean };

const visual = (t: { clip: Clip; kind: Asset["kind"] }): boolean =>
  t.kind !== "audio" && !t.clip.zoomLayer;
const timed = (t: { clip: Clip; kind: Asset["kind"] }): boolean =>
  t.kind !== "image" && !t.clip.zoomLayer && !t.clip.annotation;

/** Whether a group means anything for this clip (as source, or as target). */
export function groupApplies(g: PropGroup, t: Target): boolean {
  switch (g) {
    case "audio":
      return t.hasAudio && t.kind !== "image";
    case "speed":
      return timed(t);
    case "style":
      return !!t.clip.annotation;
    case "background":
      return t.kind === "video" && !t.clip.annotation;
    case "transition":
      return !t.clip.zoomLayer;
    default:
      return visual(t);
  }
}

/** Groups the copied clip has something in, other than the defaults: the ones checked to start with. */
export function groupIsSet(g: PropGroup, c: CopiedProps): boolean {
  const t = c.clip.transform;
  switch (g) {
    case "position":
      return !!t && (t.x !== 0.5 || t.y !== 0.5 || t.scale !== 1);
    case "movement":
      return !!c.clip.keyframes?.length;
    case "crop":
      return !!(t?.crop || t?.mask || t?.border);
    case "opacity":
      return !!t && t.opacity < 1;
    case "shadow":
      return !!t?.shadow;
    case "animation":
      return !!(c.clip.enter || c.clip.exit || c.clip.fadeIn || c.clip.fadeOut);
    case "audio":
      return c.clip.volume !== 1 || !!c.clip.denoise;
    case "speed":
      return (c.clip.speed ?? 1) !== 1;
    case "transition":
      return !!c.clip.transition;
    case "style":
      return !!c.clip.annotation;
    case "background":
      return !!c.key;
  }
}

/** Groups of the copied clip that can go onto at least one of the targets. */
export function pastableGroups(c: CopiedProps, targets: Target[]): PropGroup[] {
  const from: Target = { clip: c.clip, kind: c.kind, hasAudio: c.hasAudio };
  return PROP_GROUPS.map((g) => g.id).filter(
    (g) => groupApplies(g, from) && targets.some((t) => groupApplies(g, t)),
  );
}

const set = <T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined): void => {
  if (v === undefined) delete o[k];
  else o[k] = v;
};

/**
 * The clip-level groups (everything except speed, annotation style and background, which change
 * duration, the picture or the media) copied from `src` onto `target`.
 */
export function pasteClipProps(target: Target, src: Clip, groups: Set<PropGroup>): Clip {
  const out: Clip = { ...target.clip };
  const has = (g: PropGroup): boolean => groups.has(g) && groupApplies(g, target);
  const from: Transform = src.transform ?? DEFAULT_TRANSFORM;
  let t: Transform | undefined = target.clip.transform ? { ...target.clip.transform } : undefined;
  const tf = (): Transform => (t ??= { ...DEFAULT_TRANSFORM });
  if (has("position")) Object.assign(tf(), { x: from.x, y: from.y, scale: from.scale });
  if (has("crop")) {
    set(tf(), "crop", from.crop);
    set(tf(), "mask", from.mask);
    set(tf(), "border", from.border);
  }
  if (has("opacity")) tf().opacity = from.opacity;
  if (has("shadow")) set(tf(), "shadow", from.shadow);
  if (t) out.transform = t;
  if (has("movement"))
    set(
      out,
      "keyframes",
      src.keyframes?.map((k) => ({ ...k })),
    );
  if (has("animation"))
    for (const k of ["enter", "exit", "fadeIn", "fadeOut"] as const) set(out, k, src[k] as never);
  if (has("audio")) {
    out.volume = src.volume;
    set(out, "denoise", src.denoise);
  }
  if (has("transition")) set(out, "transition", src.transition ? { ...src.transition } : undefined);
  return out;
}

/** The annotation with the copied one's look, keeping its own text and geometry. */
export function pasteAnnotationStyle(target: Annotation, src: Annotation): Annotation {
  const out = { ...target };
  for (const k of ANNOTATION_STYLE_KEYS) set(out, k, structuredClone(src[k]) as never);
  return out;
}

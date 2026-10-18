import type { Annotation } from "./annotation.ts";
import type { Motion } from "./compose.ts";
import { EDIAULA_PALETTE, fontRole, type Palette, type Role } from "./palettes.ts";

/**
 * Animated lesson templates: a few annotation layers that come in one after the other
 * (background, then kicker, title, items…). Each layer becomes an ordinary annotation clip,
 * so the preview and the export are the same picture and every layer stays editable.
 */

export type TemplateId = "opening" | "section" | "question" | "challenge" | "recap" | "closing";

export interface TemplateField {
  id: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}

export interface TemplateLayer {
  spec: Annotation;
  /** Seconds after the template starts. */
  at: number;
  enter: Motion;
  exit: Motion;
  /** Center, fractions of the frame. Without y the layer is stacked with the other flowing layers. */
  x: number;
  y?: number;
  opacity?: number;
}

export interface LessonTemplate {
  id: TemplateId;
  label: string;
  description: string;
  duration: number;
  /** Covers the whole frame: the lesson moves forward to make room instead of being hidden. */
  fullscreen?: boolean;
  where: "start" | "end" | "playhead";
  /** Vertical center of the stacked layers. */
  flowY: number;
  fields: TemplateField[];
  /** Layers for these field values, in the colors of a palette's roles. */
  layers(v: Record<string, string>, r: Record<Role, string>): TemplateLayer[];
}

export interface TemplateContext {
  course?: string;
  title?: string;
  section?: string;
}

/** Full-frame background (only drawn when the panel is at least the frame's size). */
const backdrop = (r: Record<Role, string>, opacity = 1): TemplateLayer => ({
  spec: { kind: "panel", color: r.dark, boxWidth: 1920, boxHeight: 1080 },
  at: 0,
  enter: "fade",
  exit: "fade",
  x: 0.5,
  y: 0.5,
  opacity,
});

const lines = (text: string | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export const TEMPLATES: LessonTemplate[] = [
  {
    id: "opening",
    label: "Abertura animada",
    description:
      "Fundo, curso, título e seção entrando um depois do outro. A aula anda para frente.",
    duration: 5,
    fullscreen: true,
    where: "start",
    flowY: 0.48,
    fields: [
      { id: "kicker", label: "Curso" },
      { id: "title", label: "Título", multiline: true },
      { id: "subtitle", label: "Linha de baixo" },
    ],
    layers: (v, r) => [
      backdrop(r),
      ...(v.kicker
        ? [
            {
              spec: { kind: "label", color: r.accent, text: v.kicker.toUpperCase(), fontSize: 36 },
              at: 0.35,
              enter: "grow",
              exit: "fade",
              x: 0.5,
            } as TemplateLayer,
          ]
        : []),
      {
        spec: {
          kind: "title",
          layout: "center",
          color: r.light,
          text: v.title || "Título da aula",
          fontSize: 92,
          width: 1500,
        },
        at: 0.6,
        enter: "slide-up",
        exit: "fade",
        x: 0.5,
      },
      ...(v.subtitle
        ? [
            {
              spec: {
                kind: "title",
                layout: "center",
                color: r.accent,
                text: v.subtitle,
                fontSize: 42,
                width: 1400,
              },
              at: 1,
              enter: "fade",
              exit: "fade",
              x: 0.5,
            } as TemplateLayer,
          ]
        : []),
    ],
  },
  {
    id: "section",
    label: "Começo de seção",
    description: "Número grande e o nome da seção, por cima da aula.",
    duration: 3.5,
    where: "playhead",
    flowY: 0.48,
    fields: [
      { id: "number", label: "Número" },
      { id: "title", label: "Nome da seção", multiline: true },
    ],
    layers: (v, r) => [
      backdrop(r, 0.88),
      {
        spec: { kind: "step", color: r.accent, text: (v.number || "1").slice(0, 3) },
        at: 0.2,
        enter: "pop",
        exit: "fade",
        x: 0.5,
      },
      {
        spec: {
          kind: "title",
          layout: "center",
          color: r.light,
          text: v.title || "Nome da seção",
          fontSize: 72,
          width: 1400,
        },
        at: 0.45,
        enter: "slide-up",
        exit: "fade",
        x: 0.5,
      },
    ],
  },
  {
    id: "question",
    label: "Pergunta",
    description: "Pergunta para a criança com alternativas aparecendo uma a uma.",
    duration: 8,
    where: "playhead",
    flowY: 0.5,
    fields: [
      { id: "question", label: "Pergunta", multiline: true },
      { id: "options", label: "Alternativas (uma por linha)", multiline: true },
    ],
    layers: (v, r) => [
      backdrop(r, 0.85),
      {
        spec: { kind: "label", color: r.highlight, text: "PERGUNTA", fontSize: 36 },
        at: 0.2,
        enter: "grow",
        exit: "fade",
        x: 0.5,
      },
      {
        spec: {
          kind: "title",
          layout: "center",
          color: r.light,
          text: v.question || "Qual bloco faz o farol acender?",
          fontSize: 60,
          width: 1400,
        },
        at: 0.4,
        enter: "slide-up",
        exit: "fade",
        x: 0.5,
      },
      ...lines(v.options)
        .slice(0, 4)
        .map(
          (o, i): TemplateLayer => ({
            spec: {
              kind: "note",
              color: [r.accent, r.highlight, r.primary, r.creative][i],
              text: `${"ABCD"[i]})  ${o}`,
              width: 900,
              fontSize: 36,
            },
            at: 1 + i * 0.35,
            enter: "slide-up",
            exit: "fade",
            x: 0.5,
          }),
        ),
    ],
  },
  {
    id: "challenge",
    label: "Desafio",
    description: "Selo “Desafio” e a tarefa, para a criança tentar sozinha.",
    duration: 6,
    where: "playhead",
    flowY: 0.5,
    fields: [
      { id: "tag", label: "Selo" },
      { id: "text", label: "Desafio", multiline: true },
    ],
    layers: (v, r) => [
      backdrop(r, 0.7),
      {
        spec: {
          kind: "label",
          color: r.alert,
          text: (v.tag || "Desafio").toUpperCase(),
          fontSize: 36,
        },
        at: 0,
        enter: "pop",
        exit: "fade",
        x: 0.5,
      },
      {
        spec: {
          kind: "note",
          color: r.accent,
          text: v.text || "Faça o farol piscar 3 vezes.",
          width: 900,
          fontSize: 38,
        },
        at: 0.35,
        enter: "slide-up",
        exit: "fade",
        x: 0.5,
      },
    ],
  },
  {
    id: "recap",
    label: "Recapitulando",
    description: "Título e os pontos da aula entrando um a um.",
    duration: 9,
    where: "playhead",
    flowY: 0.5,
    fields: [
      { id: "title", label: "Título" },
      { id: "items", label: "Pontos (um por linha)", multiline: true },
    ],
    layers: (v, r) => [
      backdrop(r, 0.9),
      {
        spec: {
          kind: "title",
          layout: "center",
          color: r.accent,
          text: v.title || "Recapitulando",
          fontSize: 72,
          width: 1400,
        },
        at: 0.2,
        enter: "slide-up",
        exit: "fade",
        x: 0.5,
      },
      ...(lines(v.items).length ? lines(v.items) : ["O que aprendemos hoje"]).slice(0, 5).map(
        (item, i): TemplateLayer => ({
          spec: {
            kind: "note",
            color: r.light,
            text: `${i + 1}.  ${item}`,
            width: 1100,
            fontSize: 36,
          },
          at: 0.8 + i * 0.5,
          enter: "slide-right",
          exit: "fade",
          x: 0.5,
        }),
      ),
    ],
  },
  {
    id: "closing",
    label: "Encerramento animado",
    description: "Despedida com chamada para a próxima aula, depois do último clipe.",
    duration: 5,
    fullscreen: true,
    where: "end",
    flowY: 0.48,
    fields: [
      { id: "title", label: "Despedida" },
      { id: "subtitle", label: "Linha de baixo" },
      { id: "call", label: "Chamada (opcional)" },
    ],
    layers: (v, r) => [
      backdrop(r),
      {
        spec: {
          kind: "title",
          layout: "center",
          color: r.light,
          text: v.title || "Até a próxima aula!",
          fontSize: 96,
          width: 1500,
        },
        at: 0.3,
        enter: "pop",
        exit: "fade",
        x: 0.5,
      },
      ...(v.subtitle
        ? [
            {
              spec: {
                kind: "title",
                layout: "center",
                color: r.accent,
                text: v.subtitle,
                fontSize: 42,
                width: 1400,
              },
              at: 0.8,
              enter: "fade",
              exit: "fade",
              x: 0.5,
            } as TemplateLayer,
          ]
        : []),
      ...(v.call
        ? [
            {
              spec: { kind: "label", color: r.accent, text: v.call, fontSize: 36 },
              at: 1.3,
              enter: "grow",
              exit: "fade",
              x: 0.5,
            } as TemplateLayer,
          ]
        : []),
    ],
  },
];

/**
 * A template's layers in a palette (text drawn in its ink on light colors) and, when
 * `values.font` is set, with the text in that typeface; backgrounds are left alone.
 */
export function templateLayers(
  t: LessonTemplate,
  values: Record<string, string>,
  roles: Record<Role, string> = EDIAULA_PALETTE.roles,
  fonts?: Palette["fonts"],
): TemplateLayer[] {
  return t.layers(values, roles).map((l) => {
    if (l.spec.kind === "panel") return l;
    // A font chosen for the template wins; otherwise the theme's title or text font, if it is in use.
    const font = values.font || (fonts ? fonts[fontRole(l.spec.kind)] : undefined);
    return { ...l, spec: { ...l.spec, ink: roles.ink, ...(font ? { fontFamily: font } : {}) } };
  });
}

export const templateById = (id: string): LessonTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** Field values filled in from the project and its script. */
export function templateDefaults(t: LessonTemplate, ctx: TemplateContext): Record<string, string> {
  const v: Record<string, string> = Object.fromEntries(t.fields.map((f) => [f.id, ""]));
  if (t.id === "opening")
    Object.assign(v, {
      kicker: ctx.course ?? "",
      title: ctx.title ?? "",
      subtitle: ctx.section ? `Seção ${ctx.section}` : "",
    });
  if (t.id === "section") Object.assign(v, { number: ctx.section ?? "1" });
  if (t.id === "challenge") v.tag = "Desafio";
  if (t.id === "recap") v.title = "Recapitulando";
  if (t.id === "closing")
    Object.assign(v, {
      title: "Até a próxima aula!",
      subtitle: ctx.course ? `Continue em ${ctx.course}` : "",
    });
  return v;
}

/**
 * Vertical centers for layers stacked around `center` (all fractions of the frame height).
 * Rendered annotations carry their own transparent margin, so `gap` can be small.
 */
export function stackY(heights: number[], center: number, gap = 0): number[] {
  const total = heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, heights.length - 1);
  let y = center - total / 2;
  return heights.map((h) => {
    const c = y + h / 2;
    y += h + gap;
    return c;
  });
}

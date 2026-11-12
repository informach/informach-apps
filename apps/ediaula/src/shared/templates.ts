import type { Annotation, AnnotationIcon } from "./annotation.ts";
import type { Motion } from "./compose.ts";
import {
  EDIAULA_PALETTE,
  fontRole,
  type Palette,
  type Role,
  readableOn,
  type SlideColors,
  slideColors,
} from "./palettes.ts";

/**
 * Animated lesson templates: the slides of the lesson kit (cover, today's goals, a concept, pause
 * and think, your turn, what we learned…), each made of a few annotation layers that come in one
 * after the other. Each layer becomes an ordinary annotation clip, so the preview and the export
 * are the same picture and every layer stays editable.
 *
 * Sizes and places are 1080p pixels (the kit's 1280×720 slides times 1.5): content from the left
 * margin, at most 1170 px wide, so the presenter keeps the right side of the frame.
 */

export type TemplateId =
  | "opening"
  | "objective"
  | "concept"
  | "section"
  | "question"
  | "challenge"
  | "recap"
  | "closing";

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
  /** Center, fractions of the frame (used when `left` and `beside` are absent). */
  x?: number;
  /** Left edge of what the layer draws, in 1080p pixels from the frame's left. */
  left?: number;
  /** Center, fraction of the frame height. Without y and top, the layer flows with the others. */
  y?: number;
  /** Top edge of what the layer draws, in 1080p pixels. */
  top?: number;
  /** A flowing layer: room above it, in 1080p pixels (not before the first one). */
  gap?: number;
  /** To the right of an earlier layer (its index), vertically centered on it. */
  beside?: { layer: number; gap: number };
  opacity?: number;
}

export interface LessonTemplate {
  id: TemplateId;
  label: string;
  /** Names it had before: the layers of lessons made then are named after them. */
  formerLabels?: string[];
  description: string;
  duration: number;
  /** Covers the whole frame: the lesson moves forward to make room instead of being hidden. */
  fullscreen?: boolean;
  where: "start" | "end" | "playhead";
  /** Top of the flowing layers in 1080p pixels (they go down from there). */
  flowTop?: number;
  /** Without flowTop: vertical center of the flowing layers, stacked around it. */
  flowY?: number;
  fields: TemplateField[];
  /** Layers for these field values, in the colors of a palette, for a frame `frame` 1080p pixels big. */
  layers(v: Record<string, string>, c: TemplateColors, frame: FrameUnits): TemplateLayer[];
}

/** The palette's roles, the slides' own colors and readable text on a background. */
export type TemplateColors = Record<Role, string> &
  SlideColors & {
    /** `text` when it reads on `bg`, else the palette's ink or light. */
    on(text: string, bg: string): string;
  };

/** The frame in 1080p pixels: 1080 high, and as wide as its shape says. */
export interface FrameUnits {
  w: number;
  h: number;
}

export const FRAME_1080: FrameUnits = { w: 1920, h: 1080 };

export function frameUnits(settings: { width: number; height: number }): FrameUnits {
  return { w: (1080 * settings.width) / settings.height, h: 1080 };
}

export interface TemplateContext {
  course?: string;
  title?: string;
  section?: string;
}

/** Left margin and widest content of the slides; the presenter keeps the rest. */
const MARGIN = 96;
const CONTENT = 1170;

/** Content width on this frame: the kit's, or what fits between the margins. */
const contentWidth = (f: FrameUnits): number => Math.min(CONTENT, f.w - MARGIN * 2);

/** Full-frame background (only drawn when the panel is at least the frame's size). */
const backdrop = (color: string, opacity = 1): TemplateLayer => ({
  spec: { kind: "panel", color, boxWidth: 1920, boxHeight: 1080 },
  at: 0,
  enter: "fade",
  exit: "fade",
  x: 0.5,
  y: 0.5,
  opacity,
});

/** No outline and no shadow: the slides are flat, like the kit. */
const flat = { outline: { color: "#FFFFFF", width: 0 }, shadow: null } as const;

/** A slide's title, in heavy letters at the top left. */
const slideTitle = (text: string, c: TemplateColors, f: FrameUnits, at = 0.2): TemplateLayer => ({
  spec: {
    kind: "title",
    color: c.ink,
    text,
    fontSize: 90,
    width: contentWidth(f),
    ...flat,
  },
  at,
  enter: "slide-up",
  exit: "fade",
  left: MARGIN,
  top: 66,
});

/** A line of running text (subtitle, closing remark) in the softer ink. */
const line = (
  text: string,
  color: string,
  f: FrameUnits,
  at: number,
  gap: number,
  size = 36,
): TemplateLayer => ({
  spec: {
    kind: "title",
    color,
    text,
    fontSize: size,
    width: contentWidth(f),
    textRole: "body",
    ...flat,
  },
  at,
  enter: "fade",
  exit: "fade",
  left: MARGIN,
  gap,
});

/** A small rounded tag: module and lesson, "pause the video", the time of a task. */
const pill = (
  text: string,
  color: string,
  textColor: string,
  icon: AnnotationIcon | undefined,
  at: number,
): Omit<TemplateLayer, "left" | "top" | "gap" | "beside"> => ({
  spec: {
    kind: "label",
    color,
    textColor,
    text,
    fontSize: 36,
    ...(icon ? { icon } : {}),
    ...flat,
  },
  at,
  enter: "grow",
  exit: "fade",
});

const lines = (text: string | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Lines of a field, or the example ones when it is empty (the thumbnail shows the layout). */
const listOr = (text: string | undefined, example: string[]): string[] =>
  lines(text).length ? lines(text) : example;

/** "Title: detail" → the item's text and its line below. */
const titled = (l: string): { text: string; subtitle?: string } => {
  const at = l.indexOf(":");
  if (at <= 0) return { text: l };
  const subtitle = l.slice(at + 1).trim();
  return { text: l.slice(0, at).trim(), ...(subtitle ? { subtitle } : {}) };
};

const ITEM_ICONS: AnnotationIcon[] = ["target", "sparkles", "flag", "star"];

export const TEMPLATES: LessonTemplate[] = [
  {
    id: "opening",
    label: "Capa",
    formerLabels: ["Abertura animada"],
    description:
      "Fundo azul, módulo e aula num selo, título grande e uma linha de baixo. Vai no começo e a aula anda para frente.",
    duration: 5,
    fullscreen: true,
    where: "start",
    flowTop: 300,
    fields: [
      { id: "kicker", label: "Selo (módulo e aula)", placeholder: "Módulo 2 · Aula 4" },
      { id: "title", label: "Título", multiline: true },
      { id: "subtitle", label: "Linha de baixo" },
    ],
    layers: (v, c, f) => [
      backdrop(c.primary),
      ...(v.kicker
        ? [
            {
              ...pill(v.kicker.toUpperCase(), c.dark, c.light, "gamepad", 0.3),
              left: MARGIN,
            } as TemplateLayer,
          ]
        : []),
      {
        spec: {
          kind: "title",
          color: c.light,
          text: v.title || "Título da aula",
          fontSize: 165,
          width: contentWidth(f),
          ...flat,
        },
        at: 0.55,
        enter: "slide-up",
        exit: "fade",
        left: MARGIN,
        gap: 18,
      },
      ...(v.subtitle ? [{ ...line(v.subtitle, c.light, f, 0.95, 6, 48), opacity: 0.9 }] : []),
    ],
  },
  {
    id: "objective",
    label: "Objetivo",
    description: "“Hoje você vai…” e até 4 metas em cartões, cada uma com seu ícone.",
    duration: 8,
    where: "playhead",
    flowTop: 255,
    fields: [
      { id: "title", label: "Título" },
      { id: "items", label: "Metas (uma por linha)", multiline: true },
      { id: "note", label: "Frase final (opcional)" },
    ],
    layers: (v, c, f) => {
      const colors = [c.primary, c.highlight, c.success, c.creative];
      const items = listOr(v.items, [
        "Mover o personagem com as setas",
        "Pegar a chave no caminho",
        "Acender o farol e vencer",
      ]).slice(0, 4);
      return [
        backdrop(c.page),
        slideTitle(v.title || "Hoje você vai…", c, f),
        ...items.map(
          (text, i): TemplateLayer => ({
            spec: {
              kind: "item",
              color: colors[i],
              fill: c.light,
              text,
              badge: String(i + 1),
              icon: ITEM_ICONS[i],
              width: contentWidth(f) - 30,
            },
            at: 0.7 + i * 0.4,
            enter: "slide-up",
            exit: "fade",
            left: MARGIN,
            gap: 30,
          }),
        ),
        ...(v.note ? [line(v.note, c.muted, f, 0.9 + items.length * 0.4, 48)] : []),
      ];
    },
  },
  {
    id: "concept",
    label: "Conceito",
    description: "Título, uma frase e duas caixas ligadas por uma seta: “Ação → Reação”.",
    duration: 8,
    where: "playhead",
    flowTop: 66,
    fields: [
      { id: "title", label: "Título" },
      { id: "subtitle", label: "Frase" },
      { id: "first", label: "Caixa da esquerda" },
      { id: "second", label: "Caixa da direita" },
      { id: "example", label: "Exemplo (embaixo da direita)", multiline: true },
    ],
    layers: (v, c) => [
      backdrop(c.page),
      {
        spec: {
          kind: "title",
          color: c.ink,
          text: v.title || "Ação e reação",
          fontSize: 90,
          ...flat,
        },
        at: 0.2,
        enter: "slide-up",
        exit: "fade",
        left: MARGIN,
      },
      ...(v.subtitle ? [line(v.subtitle, c.muted, FRAME_1080, 0.45, 6, 48)] : []),
      {
        spec: {
          kind: "box",
          color: c.light,
          text: v.first || "Ação",
          fontSize: 72,
          boxWidth: 405,
          boxHeight: 195,
          ...flat,
        },
        at: 0.8,
        enter: "pop",
        exit: "fade",
        left: 165,
        top: 393,
      },
      {
        spec: {
          kind: "arrow",
          color: c.ink,
          angle: 0,
          length: 144,
          thickness: 54,
          headSize: 114,
          ...flat,
        },
        at: 1.2,
        enter: "slide-right",
        exit: "fade",
        x: 684 / 1920,
        y: 490 / 1080,
      },
      {
        spec: {
          kind: "box",
          color: c.success,
          textColor: c.on(c.accent, c.success),
          text: v.second || "Reação",
          fontSize: 72,
          boxWidth: 450,
          boxHeight: 195,
          ...flat,
        },
        at: 1.6,
        enter: "pop",
        exit: "fade",
        left: 801,
        top: 393,
      },
      ...(v.example
        ? [
            {
              spec: {
                kind: "title",
                color: c.ink,
                text: v.example,
                fontSize: 36,
                width: 450,
                textRole: "body",
                ...flat,
              },
              at: 2.1,
              enter: "fade",
              exit: "fade",
              left: 801,
              top: 630,
            } as TemplateLayer,
          ]
        : []),
    ],
  },
  {
    id: "section",
    label: "Começo de seção",
    description: "Selo com o número da seção e o nome dela em letras grandes.",
    duration: 3.5,
    where: "playhead",
    flowTop: 390,
    fields: [
      { id: "number", label: "Número" },
      { id: "title", label: "Nome da seção", multiline: true },
    ],
    layers: (v, c, f) => [
      backdrop(c.page),
      {
        ...pill(`SEÇÃO ${(v.number || "1").slice(0, 3)}`, c.dark, c.light, "flag", 0.2),
        left: MARGIN,
      },
      {
        spec: {
          kind: "title",
          color: c.ink,
          text: v.title || "Nome da seção",
          fontSize: 120,
          width: contentWidth(f),
          ...flat,
        },
        at: 0.45,
        enter: "slide-up",
        exit: "fade",
        left: MARGIN,
        gap: 18,
      },
    ],
  },
  {
    id: "question",
    label: "Pause e pense",
    formerLabels: ["Pergunta"],
    description: "Selo “Pause o vídeo”, a pergunta e as alternativas A, B, C… em cartões.",
    duration: 10,
    where: "playhead",
    flowTop: 78,
    fields: [
      { id: "question", label: "Pergunta", multiline: true },
      { id: "options", label: "Alternativas (uma por linha)", multiline: true },
      { id: "note", label: "Frase final (opcional)" },
    ],
    layers: (v, c, f) => {
      const options = listOr(v.options, [
        "Nada acontece.",
        "A chave some e temChave vira verdadeiro.",
        "O farol acende na hora.",
      ]).slice(0, 4);
      return [
        backdrop(c.soft),
        { ...pill("PAUSE O VÍDEO", c.dark, c.light, "pause", 0.1), left: MARGIN },
        {
          spec: {
            kind: "title",
            color: c.ink,
            text: v.question || "O que acontece quando o personagem encosta na chave?",
            fontSize: 60,
            width: contentWidth(f) - 30,
            ...flat,
          },
          at: 0.35,
          enter: "slide-up",
          exit: "fade",
          left: MARGIN,
          gap: 30,
        },
        ...options.map(
          (text, i): TemplateLayer => ({
            spec: {
              kind: "item",
              color: c.accent,
              fill: c.light,
              text,
              badge: "ABCD"[i],
              marker: "square",
              fontSize: 45,
              width: contentWidth(f) - 30,
              outline: { color: c.accent, width: 4.5 },
              shadow: null,
            },
            at: 0.9 + i * 0.35,
            enter: "slide-up",
            exit: "fade",
            left: MARGIN,
            gap: i ? 24 : 48,
          }),
        ),
        line(
          v.note || "Pense, responda em voz alta e dê play de novo.",
          c.muted,
          f,
          1.1 + options.length * 0.35,
          36,
        ),
      ];
    },
  },
  {
    id: "challenge",
    label: "Agora é com você",
    formerLabels: ["Desafio"],
    description: "Título, o tempo num selo e até 4 passos numerados, cada um com um detalhe.",
    duration: 10,
    where: "playhead",
    flowTop: 255,
    fields: [
      { id: "title", label: "Título" },
      { id: "time", label: "Tempo (opcional)", placeholder: "5 minutos" },
      {
        id: "steps",
        label: "Passos (um por linha; o detalhe vem depois de “:”)",
        multiline: true,
      },
    ],
    layers: (v, c, f) => {
      const steps = listOr(v.steps, [
        "Abra o projeto Farol: No Estúdio, em Meus jogos.",
        "Troque a cor do fundo: Clique no quadradinho azul do bloco.",
        "Mude a chave de lugar e teste: Altere o x e o y da chave.",
      ]).slice(0, 4);
      return [
        backdrop(c.page),
        slideTitle(v.title || "Agora é com você!", c, f),
        ...(v.time
          ? [
              {
                ...pill(v.time, c.accent, c.on(c.ink, c.accent), "flame", 0.4),
                beside: { layer: 1, gap: 60 },
              } as TemplateLayer,
            ]
          : []),
        ...steps.map(
          (l, i): TemplateLayer => ({
            spec: {
              kind: "item",
              color: c.primary,
              fill: c.light,
              ...titled(l),
              badge: String(i + 1),
              width: contentWidth(f) - 30,
            },
            at: 0.8 + i * 0.45,
            enter: "slide-up",
            exit: "fade",
            left: MARGIN,
            gap: 30,
          }),
        ),
      ];
    },
  },
  {
    id: "recap",
    label: "O que aprendemos",
    formerLabels: ["Recapitulando"],
    description: "Os pontos da aula com um certo verde e, se quiser, o cartão da próxima aula.",
    duration: 10,
    where: "playhead",
    flowTop: 255,
    fields: [
      { id: "title", label: "Título" },
      { id: "items", label: "Pontos (um por linha)", multiline: true },
      { id: "next", label: "Próxima aula (opcional)" },
    ],
    layers: (v, c, f) => {
      const items = listOr(v.items, [
        "Toda ação tem uma reação.",
        "Sprites são os objetos do jogo.",
        "Variáveis guardam o que acontece.",
      ]).slice(0, 5);
      return [
        backdrop(c.page),
        slideTitle(v.title || "O que aprendemos", c, f),
        ...items.map(
          (text, i): TemplateLayer => ({
            spec: {
              kind: "item",
              color: c.success,
              text,
              marker: "check",
              bare: true,
              width: contentWidth(f),
            },
            at: 0.7 + i * 0.5,
            enter: "slide-right",
            exit: "fade",
            left: MARGIN,
            gap: 24,
          }),
        ),
        ...(v.next
          ? [
              {
                spec: {
                  kind: "item",
                  color: c.primary,
                  fill: c.dark,
                  textColor: c.light,
                  accent: c.accent,
                  kicker: "Próxima aula",
                  text: v.next,
                  icon: "compass",
                  width: Math.min(960, contentWidth(f)),
                },
                at: 0.9 + items.length * 0.5,
                enter: "slide-up",
                exit: "fade",
                left: MARGIN,
                gap: 66,
              } as TemplateLayer,
            ]
          : []),
      ];
    },
  },
  {
    id: "closing",
    label: "Encerramento",
    formerLabels: ["Encerramento animado"],
    description:
      "Fundo azul, despedida grande e a chamada para a próxima aula, depois do último clipe.",
    duration: 5,
    fullscreen: true,
    where: "end",
    flowTop: 330,
    fields: [
      { id: "title", label: "Despedida" },
      { id: "subtitle", label: "Linha de baixo" },
      { id: "call", label: "Chamada (opcional)" },
    ],
    layers: (v, c, f) => [
      backdrop(c.primary),
      {
        spec: {
          kind: "title",
          color: c.light,
          text: v.title || "Até a próxima aula!",
          fontSize: 140,
          width: contentWidth(f),
          ...flat,
        },
        at: 0.3,
        enter: "pop",
        exit: "fade",
        left: MARGIN,
      },
      ...(v.subtitle ? [{ ...line(v.subtitle, c.light, f, 0.8, 6, 48), opacity: 0.9 }] : []),
      ...(v.call
        ? [
            {
              ...pill(v.call, c.accent, c.on(c.ink, c.accent), "compass", 1.3),
              left: MARGIN,
              gap: 36,
            } as TemplateLayer,
          ]
        : []),
    ],
  },
];

/** A palette's colors as the templates use them. */
export function templateColors(p: Palette): TemplateColors {
  return {
    ...p.roles,
    ...slideColors(p),
    on: (text, bg) => readableOn(text, bg, p),
  };
}

/**
 * A template's layers in a palette (text drawn in its ink on light colors) and, when
 * `values.font` is set, with the text in that typeface, else in the theme's fonts (`fonts`, when
 * the lesson uses them); backgrounds are left alone.
 */
export function templateLayers(
  t: LessonTemplate,
  values: Record<string, string>,
  palette: Palette = EDIAULA_PALETTE,
  fonts?: Palette["fonts"],
  frame: FrameUnits = FRAME_1080,
): TemplateLayer[] {
  return t.layers(values, templateColors(palette), frame).map((l) => {
    if (l.spec.kind === "panel") return l;
    // A font chosen for the template wins; otherwise the theme's title or text font, if it is in use.
    const font = values.font || (fonts ? fonts[fontRole(l.spec)] : undefined);
    const body = l.spec.kind === "item" ? values.font || fonts?.body : undefined;
    return {
      ...l,
      spec: {
        ...l.spec,
        ink: palette.roles.ink,
        ...(font ? { fontFamily: font } : {}),
        ...(body ? { bodyFont: body } : {}),
      },
    };
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
  if (t.id === "objective") v.title = "Hoje você vai…";
  if (t.id === "section") Object.assign(v, { number: ctx.section ?? "1" });
  if (t.id === "challenge") Object.assign(v, { title: "Agora é com você!", time: "5 minutos" });
  if (t.id === "recap") v.title = "O que aprendemos";
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

/** A drawn layer's picture: its size and its transparent margin, in 1080p pixels. */
export interface LayerSize {
  w: number;
  h: number;
  margin: number;
}

/**
 * Where each layer's center goes (fractions of the frame): placed by its left edge and top edge
 * when it has them, beside an earlier layer, or flowing down from the template's top with its gap
 * (edges and gaps are of what it draws, without its transparent margin).
 */
export function placeLayers(
  t: Pick<LessonTemplate, "flowTop" | "flowY">,
  layers: TemplateLayer[],
  sizes: LayerSize[],
  frame: FrameUnits,
): { x: number; y: number }[] {
  const visible = sizes.map((s) => ({
    w: Math.max(0, s.w - s.margin * 2),
    h: Math.max(0, s.h - s.margin * 2),
  }));
  const flowing = layers
    .map((l, i) => (l.y === undefined && l.top === undefined && !l.beside ? i : -1))
    .filter((i) => i >= 0);
  const ys = new Map<number, number>();
  if (t.flowTop !== undefined) {
    let cursor = t.flowTop;
    flowing.forEach((i, n) => {
      if (n) cursor += layers[i].gap ?? 0;
      ys.set(i, (cursor + visible[i].h / 2) / frame.h);
      cursor += visible[i].h;
    });
  } else {
    const stacked = stackY(
      flowing.map((i) => sizes[i].h / frame.h),
      t.flowY ?? 0.5,
    );
    flowing.forEach((i, n) => {
      ys.set(i, stacked[n]);
    });
  }
  const out: { x: number; y: number }[] = [];
  layers.forEach((l, i) => {
    const v = visible[i];
    if (l.beside && out[l.beside.layer]) {
      const of = out[l.beside.layer];
      const right = of.x * frame.w + visible[l.beside.layer].w / 2;
      out.push({ x: (right + l.beside.gap + v.w / 2) / frame.w, y: of.y });
      return;
    }
    const x = l.left !== undefined ? (l.left + v.w / 2) / frame.w : (l.x ?? 0.5);
    const y = l.top !== undefined ? (l.top + v.h / 2) / frame.h : (l.y ?? ys.get(i) ?? 0.5);
    out.push({ x, y });
  });
  return out;
}

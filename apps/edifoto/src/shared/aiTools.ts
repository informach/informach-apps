import { z } from "zod";
import { BLEND_IDS, BLEND_MODES } from "./blendModes.ts";

/**
 * Tools that let an AI model operate the editor. The same definitions are served over MCP
 * (Claude Code, Claude Desktop, Codex — with the user's own subscription) and to the in-app
 * assistant through the same personal clients. Implementations live in the renderer, where the document is.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor no formato #rrggbb");
const blend = z.enum(BLEND_IDS);
const percent = z.number().min(0).max(100);

const gradientInput = z.object({
  type: z.enum(["linear", "radial"]).optional(),
  angle: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe("Linear direction in degrees: 90 = top to bottom, 0 = left to right"),
  stops: z
    .array(
      z.object({
        color: hex,
        position: z.number().min(0).max(1),
        opacity: z.number().min(0).max(1).optional(),
      }),
    )
    .min(2)
    .optional(),
  cx: z.number().min(0).max(1).optional().describe("Radial center x, 0..1 of the image width"),
  cy: z.number().min(0).max(1).optional().describe("Radial center y, 0..1 of the image height"),
  scale: z
    .number()
    .min(0.05)
    .max(4)
    .optional()
    .describe("Radial size / linear length factor, 1 = whole image"),
});

const textInput = z.object({
  content: z.string().min(1).optional(),
  font: z
    .string()
    .min(2)
    .optional()
    .describe('Font family installed on the computer, e.g. "Inter Variable", "Georgia", "Arial"'),
  size: z.number().min(4).max(2000).optional().describe("Font size in image pixels"),
  weight: z.number().min(100).max(900).optional(),
  italic: z.boolean().optional(),
  color: hex.optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  max_width: z.number().min(20).max(8192).optional(),
  line_height: z.number().min(0.6).max(3).optional(),
  letter_spacing: z.number().min(-50).max(200).optional().describe("Extra spacing in pixels"),
  x: z.number().optional().describe("Center of the text box, image pixels"),
  y: z.number().optional().describe("Center of the text box, image pixels"),
});

const adjustInput = z.object({
  curves: z
    .tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ])
    .optional(),
  exposure: z.number().min(-3).max(3).optional().describe("Stops"),
  brightness: z.number().min(-100).max(100).optional(),
  contrast: z.number().min(-100).max(100).optional(),
  highlights: z.number().min(-100).max(100).optional().describe("Negative recovers bright areas"),
  shadows: z.number().min(-100).max(100).optional().describe("Positive opens up dark areas"),
  temperature: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe("Negative = cooler/blue, positive = warmer/yellow"),
  tint: z.number().min(-100).max(100).optional().describe("Negative = green, positive = magenta"),
  vibrance: z.number().min(-100).max(100).optional(),
  saturation: z.number().min(-100).max(100).optional(),
  hue: z.number().min(-180).max(180).optional(),
  levels: z
    .object({
      black: z
        .array(z.number().min(0).max(254))
        .length(3)
        .optional()
        .describe("Input black point per channel [r,g,b]"),
      white: z
        .array(z.number().min(1).max(255))
        .length(3)
        .optional()
        .describe("Input white point per channel [r,g,b]"),
      gamma: z.number().min(0.1).max(9.99).optional(),
    })
    .optional(),
  grayscale: z.boolean().optional(),
  invert: z.boolean().optional(),
});

export type GradientInput = z.infer<typeof gradientInput>;
export type TextInput = z.infer<typeof textInput>;
export type AdjustInput = z.infer<typeof adjustInput>;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const vectorInput = z.object({
  shape: z.enum(["rectangle", "ellipse", "triangle", "polygon", "star", "line", "path"]).optional(),
  width: z.number().positive().max(16384).optional(),
  height: z.number().positive().max(16384).optional(),
  radius: z.number().min(0).optional(),
  sides: z.number().int().min(3).max(40).optional(),
  innerRadius: z.number().min(0.05).max(0.95).optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  fillColor: hex.nullable().optional(),
  strokeColor: hex.nullable().optional(),
  strokeWidth: z.number().min(0).max(500).optional(),
  strokeAlign: z.enum(["inside", "center", "outside"]).optional(),
  closed: z.boolean().optional(),
  points: z
    .array(
      point.extend({
        incoming: point.optional(),
        outgoing: point.optional(),
        smooth: z.boolean().optional(),
      }),
    )
    .max(2000)
    .optional(),
});
export const AI_TOOLS = {
  align_layer: {
    title: "Alinhar elemento",
    description:
      "Aligns an image, text or shape to canvas left, center, right, top, middle or bottom, including rotation and flips.",
    input: z.object({
      document_id: z.string().optional(),
      layer_id: z.string(),
      alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
      margin: z.number().min(0).max(4096).optional(),
    }),
  },
  apply_style: {
    title: "Aplicar estilo",
    description:
      "Applies a simple adjustable color style in one reusable non-destructive layer. Keeps the source image intact.",
    input: z.object({
      document_id: z.string().optional(),
      style: z.enum(["natural", "warm", "cool", "mono"]),
      strength: z.number().min(0).max(100).optional(),
    }),
  },
  select_region: {
    title: "Selecionar região",
    description:
      "Creates a rectangular document-space selection. Combine regions or soften its edges, then use selection_mask.",
    input: z.object({
      document_id: z.string().optional(),
      x: z.number(),
      y: z.number(),
      width: z.number().min(1).max(8192),
      height: z.number().min(1).max(8192),
      mode: z.enum(["replace", "add", "subtract", "intersect"]).optional(),
      feather: z.number().min(0).max(64).optional(),
    }),
  },
  selection_mask: {
    title: "Máscara da seleção",
    description:
      "Applies the current selection as an editable layer mask, with optional edge expansion, contraction or feathering.",
    input: z.object({
      document_id: z.string().optional(),
      layer_id: z.string(),
      grow: z.number().min(-64).max(64).optional(),
      feather: z.number().min(0).max(64).optional(),
    }),
  },
  add_vector: {
    title: "Criar vetor",
    description:
      "Creates an editable shape or Bézier path with fill, stroke, dimensions and control points. Coordinates for points are local to the shape bounds.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      vector: vectorInput,
      x: z.number().optional(),
      y: z.number().optional(),
    }),
  },
  edit_vector: {
    title: "Editar vetor",
    description:
      "Updates an editable vector shape or path, including its anchors, handles, colors, dimensions and stroke.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      vector: vectorInput,
    }),
  },
  vector_mask: {
    title: "Máscara vetorial",
    description:
      "Converts a closed vector path to a selection and applies it as an undoable mask to the specified target layer.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      vector_id: z.string(),
      target_id: z.string(),
    }),
  },
  remove_background: {
    title: "Remover fundo por cor",
    description:
      "Removes border-connected background colors from a raster layer using an editable mask combined with the current mask. This is color-based, not semantic subject segmentation.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      tolerance: z.number().min(0).max(255).optional(),
    }),
  },
  compare_modes: {
    title: "Comparar lado a lado",
    description:
      "Opens the side by side blend mode comparison dialog for the user to choose and apply a version.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
    }),
  },
  get_document: {
    title: "Ler documento",
    description:
      "Returns the open image: size, file, every layer from TOP to BOTTOM with id, kind, name, blend mode, opacity, fill, visibility, lock, mask, position and its content (color, gradient, text, adjustment values), the active layer and the undo history. Call this first.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
    }),
  },
  get_preview: {
    title: "Ver a imagem",
    description:
      "Returns a JPEG of the current composite exactly as the user sees it, so you can judge the result. Look before and after visual changes. Optionally show a single layer alone.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      max_size: z
        .number()
        .int()
        .min(256)
        .max(2048)
        .optional()
        .describe("Longest side in pixels. Default 1024."),
      layer_id: z.string().optional().describe("Render only this layer, on transparency"),
    }),
  },
  analyze_image: {
    title: "Analisar luz e cor",
    description:
      "Measures the current composite: brightness percentiles, clipped shadows/highlights, contrast, average saturation and color cast. Use it to decide exposure, contrast and white balance corrections with numbers instead of guessing.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
    }),
  },
  preview_blend_modes: {
    title: "Comparar modos de mesclagem",
    description:
      "Renders the whole image once per blend mode for one layer and returns a labeled contact sheet, without changing anything. Use it to choose a mode (and show the user options) before calling set_layer.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      modes: z.array(blend).min(1).max(27).optional().describe("Default: all 27 modes"),
    }),
  },
  select_layer: {
    title: "Selecionar camada",
    description:
      "Makes a layer the active one in the Layers panel, so the user sees which layer you are talking about.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
    }),
  },
  set_layer: {
    title: "Ajustar camada",
    description:
      "Changes layer properties: name, blend mode, opacity and fill (0-100), visibility, lock, and placement (x/y center in image pixels, scale, rotation in degrees clockwise, flips; image and text layers only). Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      name: z.string().min(1).max(80).optional(),
      blend_mode: blend.optional(),
      opacity: percent.optional(),
      fill: percent.optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      scale: z.number().min(0.01).max(50).optional(),
      rotation: z.number().min(-360).max(360).optional(),
      flip_x: z.boolean().optional(),
      flip_y: z.boolean().optional(),
    }),
  },
  add_layer: {
    title: "Nova camada",
    description:
      'Adds a layer above the active one (or above above_layer_id): "adjustment" (non-destructive light/color correction of everything below), "solid" color, "gradient", "text", or "empty" (transparent, for painting). Set the content with the matching field. Undoable. Returns the new layer id.',
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      kind: z.enum(["adjustment", "solid", "gradient", "text", "empty"]),
      name: z.string().min(1).max(80).optional(),
      blend_mode: blend.optional(),
      opacity: percent.optional(),
      above_layer_id: z.string().optional(),
      color: hex.optional().describe('For kind "solid"'),
      gradient: gradientInput.optional().describe('For kind "gradient"'),
      text: textInput.optional().describe('For kind "text"'),
      adjustment: adjustInput
        .optional()
        .describe('For kind "adjustment"; omitted values stay neutral'),
    }),
  },
  edit_layer: {
    title: "Editar conteúdo",
    description:
      "Changes the content of a layer: the color of a solid layer, the gradient, the text and its style, or the values of an adjustment layer (only the values you pass change). Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      color: hex.optional(),
      gradient: gradientInput.optional(),
      text: textInput.optional(),
      adjustment: adjustInput.optional(),
    }),
  },
  set_mask: {
    title: "Máscara",
    description:
      'Controls where a layer shows. "reveal_all"/"hide_all" create a white/black mask; "linear" shows the layer at the start of a direction and fades it out (angle 90 = visible at the top, fading to hidden at the bottom; start/end are 0..1 along that direction); "radial" shows it inside a circle (cx, cy, radius as 0..1 of the image, feather 0..1); "invert", "remove", "disable", "enable". Great for limiting an adjustment to the sky or a vignette. Undoable.',
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      mode: z.enum([
        "reveal_all",
        "hide_all",
        "linear",
        "radial",
        "invert",
        "remove",
        "disable",
        "enable",
      ]),
      angle: z.number().optional(),
      start: z.number().min(0).max(1).optional(),
      end: z.number().min(0).max(1).optional(),
      cx: z.number().min(0).max(1).optional(),
      cy: z.number().min(0).max(1).optional(),
      radius: z.number().min(0.01).max(2).optional(),
      feather: z.number().min(0).max(1).optional(),
    }),
  },
  auto_adjust: {
    title: "Ajuste automático",
    description:
      'Adds an "Ajuste automático" adjustment layer that fixes levels (black/white points), mild contrast and color cast from the image histogram. Undoable.',
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      strength: percent.optional().describe("Default 100"),
    }),
  },
  duplicate_layer: {
    title: "Duplicar camada",
    description: "Duplicates a layer (placed right above it) and returns the new id. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
    }),
  },
  delete_layer: {
    title: "Apagar camada",
    description: "Deletes a layer. The user may be asked to confirm. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
    }),
  },
  reorder_layer: {
    title: "Mover na pilha",
    description: "Moves a layer up/down one step or to the top/bottom of the stack. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      layer_id: z.string(),
      position: z.enum(["up", "down", "top", "bottom"]),
    }),
  },
  crop: {
    title: "Cortar",
    description:
      'Crops the image. Either give a rectangle in image pixels (x, y, width, height) or an aspect ratio like "1:1", "4:5", "16:9", "9:16" for the largest centered crop (optionally shifted with focus_x/focus_y 0..1). Undoable.',
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(1).optional(),
      height: z.number().min(1).optional(),
      aspect: z
        .string()
        .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
        .optional(),
      focus_x: z.number().min(0).max(1).optional(),
      focus_y: z.number().min(0).max(1).optional(),
    }),
  },
  transform_image: {
    title: "Girar / espelhar",
    description: "Rotates the whole image by 90, -90 or 180 degrees and/or flips it. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      rotate: z.union([z.literal(90), z.literal(-90), z.literal(180)]).optional(),
      flip: z.enum(["horizontal", "vertical"]).optional(),
    }),
  },
  resize_image: {
    title: "Tamanho da imagem",
    description:
      "Changes the image size in pixels, keeping proportions when only one side or a percent is given. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      width: z.number().int().min(1).max(16000).optional(),
      height: z.number().int().min(1).max(16000).optional(),
      percent: z.number().min(1).max(1000).optional(),
    }),
  },
  place_image: {
    title: "Inserir imagem",
    description:
      "Adds an image file from the computer as a new layer, centered and fitted inside the canvas. Undoable.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      path: z.string().min(3),
      name: z.string().optional(),
    }),
  },
  open_image: {
    title: "Abrir imagem",
    description:
      "Opens an image or .edifoto file as the current document. Refused if the open document has unsaved changes.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      path: z.string().min(3),
    }),
  },
  export_image: {
    title: "Exportar",
    description:
      "Saves the composite as PNG, JPEG or WebP. Only works if the user allowed the agent to write files.",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      path: z
        .string()
        .min(3)
        .describe("Full output path; the extension is fixed to match the format"),
      format: z.enum(["png", "jpeg", "webp"]),
      quality: z.number().min(1).max(100).optional().describe("JPEG/WebP quality, default 90"),
      scale: z.number().min(0.05).max(4).optional().describe("Default 1"),
    }),
  },
  undo: {
    title: "Desfazer",
    description: "Undoes the last steps (default 1).",
    input: z.object({
      document_id: z
        .string()
        .optional()
        .describe(
          "Document id from get_document. Required for external mutations; never reuse for another image.",
        ),
      steps: z.number().int().min(1).max(50).optional(),
    }),
  },
};

export type AiToolName = keyof typeof AI_TOOLS;

export const AI_TOOL_NAMES = Object.keys(AI_TOOLS) as AiToolName[];

/** Tools that change the document. */
export const MUTATING_TOOLS = new Set<AiToolName>([
  "align_layer",
  "apply_style",
  "select_region",
  "selection_mask",
  "add_vector",
  "edit_vector",
  "vector_mask",
  "remove_background",
  "set_layer",
  "add_layer",
  "edit_layer",
  "set_mask",
  "auto_adjust",
  "duplicate_layer",
  "delete_layer",
  "reorder_layer",
  "crop",
  "transform_image",
  "resize_image",
  "place_image",
  "open_image",
  "undo",
]);

/** JSON Schema for a tool's input, as the Claude API expects it. */
export function toolJsonSchema(name: AiToolName): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(AI_TOOLS[name].input) as Record<
    string,
    unknown
  >;
  return schema;
}

const MODE_LIST = BLEND_MODES.map((m) => `${m.id} (${m.label})`).join(", ");

/** Guidance shared by the MCP server (instructions) and the in-app assistant (system prompt). */
export const EDITOR_GUIDE = `You are working inside EdiFoto, a simple image editor for everyday creation and editing used by people without design training. Always reply to the user in Brazilian Portuguese, briefly and plainly. Use the Portuguese names of blend modes and tools when talking to the user.

How the document works:
- An image is a stack of layers. get_document lists them from TOP to BOTTOM; each layer blends onto everything below it with its blend mode, opacity and fill, limited by its mask (white shows, black hides).
- Layer kinds: image (pixels), solid color, gradient, text, adjustment. An adjustment layer corrects light and color of everything below it, non-destructively, and can itself be masked, faded with opacity or given a blend mode (e.g. "luminosity" to change brightness without shifting colors, "color" to grade colors only).
- Blend modes (id = name the user sees): ${MODE_LIST}. Darken group drops white, lighten group drops black, contrast group drops 50% gray. Typical uses: multiply for shadows/texture on light backgrounds, screen for light leaks and glows, overlay/soft light for color grading and contrast, color for tinting, luminosity for brightness-only corrections, difference to compare/align.
- Coordinates are image pixels from the top-left corner. Every change is undoable (undo tool or Ctrl+Z) and shows up live in the user's window.

Working well:
- Start with get_document. Pass its document id in document_id when editing; if the document changes, stop and inspect again. Never claim generative image editing or semantic subject detection: tools only perform the local edits listed here. Look at the image with get_preview before judging it, and again after visual changes to check the result. Use analyze_image for exposure/contrast/white-balance numbers.
- Prefer non-destructive edits: adjustment layers instead of changing pixels, masks instead of deleting, new layers for overlays and text. Name new layers clearly in Portuguese (e.g. "Céu mais escuro", "Luz quente").
- To choose a blend mode, call preview_blend_modes and pick (or show the user) the best options; then set it with set_layer.
- Make the change the user asked for; for broad requests ("deixa mais bonita") make tasteful, moderate edits and explain what you did in one or two sentences, offering a stronger or softer version.
- Never delete the user's layers unless asked. Do not export or save files unless the user asks.`;

import { z } from "zod";

/**
 * Projects of the game studio (`.szproject.json`, format 2, extension game-2d) as material for
 * motion: each SVG image becomes an artboard of its own (reusable as a component), and one more
 * artboard, "Cena", rebuilds the game's starting picture from the structured program (`ir`), never
 * by running or reading its JavaScript: the stage colour, the backdrop, the sprites where they
 * start and in the order the game draws them, the coloured boxes and the labels. Events,
 * controls, velocities and loops are motion the person animates in EdiSVG: they are listed, not
 * converted. The scene is the game scaled by SCENE_SCALE (480×360 → 1440×1080).
 */

export const SCENE_SCALE = 3;
/** The studio saves images inline: a project is a few MB at most. */
export const SZPROJECT_BYTES = 30_000_000;
const MAX_ASSETS = 400;

const dataUrl = z.string().max(SZPROJECT_BYTES);
const assetSchema = z.looseObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  kind: z.string().max(40),
  dataUrl,
  width: z.number().positive().max(100000).optional(),
  height: z.number().positive().max(100000).optional(),
});
const statementSchema = z.looseObject({ type: z.string().max(80) });
const projectSchema = z.looseObject({
  formatVersion: z.literal(2),
  name: z.string().max(200),
  assets: z.array(assetSchema).max(MAX_ASSETS),
  ir: z
    .looseObject({
      behavior: z
        .looseObject({
          start: z.array(statementSchema).max(5000).default([]),
          events: z.array(statementSchema).max(5000).default([]),
          loops: z.array(statementSchema).max(5000).default([]),
        })
        .optional(),
    })
    .optional(),
});

export type SzProject = z.infer<typeof projectSchema>;
type Statement = z.infer<typeof statementSchema>;

/** A scene as the SVG import makes it (svgImport.js importSvg). */
export interface ImportedScene {
  viewBox: number[];
  nodes: unknown[];
}

export interface SzImportPlan {
  /** Artboard commands in order: the images first, the scene (which uses them) last. */
  commands: {
    type: "artboard";
    operation: "import";
    id: string;
    name: string;
    scene: unknown;
  }[];
  sceneArtboardId: string | null;
  /** What came in, and what did not: said to the person after the import. */
  summary: string;
  /** The colours the images use most, most used first (#rrggbb, at most IMAGE_PALETTE_SIZE). */
  imagePalette: string[];
}

/** How many colours of the images go into the scene's palette. */
export const IMAGE_PALETTE_SIZE = 8;

/** #abc and #aabbcc as #aabbcc in lower case; anything else (none, url(), names) is skipped. */
function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join("")}`;
  return null;
}

/** The colours of imported scenes, by how many shapes paint with them (fill and stroke). */
export function paletteOf(scenes: readonly ImportedScene[], size = IMAGE_PALETTE_SIZE): string[] {
  const counts = new Map<string, number>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const { attrs, children } = node as { attrs?: Record<string, unknown>; children?: unknown[] };
    for (const key of ["fill", "stroke"]) {
      const color = hexColor(attrs?.[key]);
      if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    for (const child of children ?? []) visit(child);
  };
  for (const scene of scenes) for (const node of scene.nodes) visit(node);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, size)
    .map(([color]) => color);
}

export class SzProjectError extends Error {
  override name = "SzProjectError";
}

/** Whether a dropped or chosen file is a studio project (by its name). */
export const isSzProjectName = (name: string): boolean => /\.szproject\.json$/i.test(name);

export function parseSzProject(source: string): SzProject {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new SzProjectError("O arquivo não é um projeto do Estúdio: o JSON não pôde ser lido.");
  }
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success)
    throw new SzProjectError(
      "O arquivo não é um projeto do Estúdio no formato 2 (.szproject.json). Nada foi importado.",
    );
  return parsed.data;
}

/** The SVG text of an image saved inline (`data:image/svg+xml;base64,…` or URL-encoded). */
export function svgOfDataUrl(url: string): string | null {
  const match = /^data:image\/svg\+xml(;charset=[\w-]+)?(;base64)?,(.*)$/is.exec(url);
  if (!match) return null;
  const body = match[3] ?? "";
  if (!match[2]) return decodeURIComponent(body);
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const COLOR = /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$/i;
const color = (value: unknown, fallback: string): string => {
  const text = str(value);
  return text && COLOR.test(text) ? text : fallback;
};
/** A literal of the program (`{type:"str"|"num", value}`); anything computed is not known yet. */
const literal = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : null;
  const { type, value: inner } = value as { type?: unknown; value?: unknown };
  if (type === "str" && typeof inner === "string") return inner;
  if (type === "num" && typeof inner === "number") return String(inner);
  return null;
};

const transform = (x: number, y: number) => ({
  x,
  y,
  rotation: 0,
  sx: 1,
  sy: 1,
  opacity: 100,
});

interface Sprite {
  varName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  image: string | null;
  color: string | null;
}

/**
 * Plans the import: every SVG image an artboard, then the scene. `toScene` is the SVG import
 * (svgImport.js importSvg), passed in so the plan is tested without a DOM. Throws when nothing
 * usable is in the file; an image that cannot be read is left out and said in the summary.
 */
export function planSzProjectImport(
  project: SzProject,
  toScene: (svg: string) => ImportedScene,
  newId: () => string = () => `artboard-${crypto.randomUUID()}`,
): SzImportPlan {
  const commands: SzImportPlan["commands"] = [];
  const boards = new Map<string, { id: string; width: number; height: number }>();
  const skipped: string[] = [];
  for (const asset of project.assets) {
    if (asset.kind !== "image") continue;
    let scene: ImportedScene;
    try {
      const svg = svgOfDataUrl(asset.dataUrl);
      if (svg === null) {
        skipped.push(`${asset.name} (não é SVG)`);
        continue;
      }
      scene = toScene(svg);
    } catch (error) {
      skipped.push(
        `${asset.name} (${error instanceof Error ? error.message : "SVG incompatível"})`,
      );
      continue;
    }
    const id = newId();
    const width = num(scene.viewBox[2], asset.width ?? 1);
    const height = num(scene.viewBox[3], asset.height ?? 1);
    boards.set(asset.name, { id, width, height });
    commands.push({ type: "artboard", operation: "import", id, name: asset.name, scene });
  }

  const behavior = project.ir?.behavior;
  const start = behavior?.start ?? [];
  const loops = behavior?.loops ?? [];
  const events = behavior?.events ?? [];
  const stage = start.find((s) => s.type === "g2d:setupStage");
  const sceneParts = sceneOf(start, loops);
  let sceneArtboardId: string | null = null;
  const missing = new Set<string>();
  if (stage) {
    const k = SCENE_SCALE;
    const width = num(stage.width, 480) * k;
    const height = num(stage.height, 360) * k;
    const nodes: unknown[] = [
      {
        id: `node-${crypto.randomUUID()}`,
        name: "Fundo do palco",
        tag: "rect",
        attrs: {
          x: "0",
          y: "0",
          width: String(width),
          height: String(height),
          fill: color(stage.bg, "#ffffff"),
        },
        text: "",
        children: [],
        transform: transform(0, 0),
        visible: true,
        locked: false,
      },
    ];
    const instanceNode = (
      name: string,
      image: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const board = boards.get(image);
      if (!board) {
        missing.add(image);
        return null;
      }
      return {
        id: `node-${crypto.randomUUID()}`,
        name,
        tag: "g",
        attrs: {},
        text: "",
        children: [],
        transform: transform(x, y),
        visible: true,
        locked: false,
        instance: {
          artboardId: board.id,
          animationId: null,
          width: w,
          height: h,
          fit: "stretch",
          speed: 1,
          offsetSeconds: 0,
          overrides: [],
        },
      };
    };
    for (const part of sceneParts) {
      if (part.kind === "backdrop") {
        const node = instanceNode(`Cenário · ${part.image}`, part.image, 0, 0, width, height);
        if (node) nodes.push(node);
      } else if (part.kind === "sprite") {
        const s = part.sprite;
        if (s.image) {
          const node = instanceNode(
            `${s.varName} · ${s.image}`,
            s.image,
            s.x * k,
            s.y * k,
            s.w * k,
            s.h * k,
          );
          if (node) nodes.push(node);
        } else
          nodes.push({
            id: `node-${crypto.randomUUID()}`,
            name: s.varName,
            tag: "rect",
            attrs: {
              x: "0",
              y: "0",
              width: String(s.w * k),
              height: String(s.h * k),
              fill: s.color ?? "#000000",
            },
            text: "",
            children: [],
            transform: transform(s.x * k, s.y * k),
            visible: true,
            locked: false,
          });
      } else
        nodes.push({
          id: `node-${crypto.randomUUID()}`,
          name: part.name,
          tag: "text",
          attrs: {
            x: "0",
            y: "0",
            fill: part.color,
            "font-size": String(part.size * k),
            "font-family": "Arial",
            "text-anchor":
              part.align === "center" ? "middle" : part.align === "right" ? "end" : "start",
          },
          text: part.text,
          children: [],
          transform: transform(part.x * k, part.y * k),
          visible: true,
          locked: false,
        });
    }
    sceneArtboardId = newId();
    commands.push({
      type: "artboard",
      operation: "import",
      id: sceneArtboardId,
      name: `Cena · ${project.name || "Projeto do Estúdio"}`.slice(0, 120),
      scene: { viewBox: [0, 0, width, height], preserveAspectRatio: "xMidYMid meet", nodes },
    });
  }
  if (!commands.length)
    throw new SzProjectError(
      "O projeto não tem imagens SVG nem uma cena do jogo 2D para importar.",
    );

  const images = commands.length - (sceneArtboardId ? 1 : 0);
  const lines = [
    `${images} ${images === 1 ? "imagem virou prancheta" : "imagens viraram pranchetas"}${
      sceneArtboardId
        ? `, e a "Cena" (${num(stage?.width, 480) * SCENE_SCALE}×${num(stage?.height, 360) * SCENE_SCALE}) monta o começo do jogo com elas`
        : ""
    }.`,
  ];
  const outside = sceneParts.filter(
    (p) =>
      p.kind === "sprite" &&
      // Only what is in the scene: a sprite whose image did not come is said below.
      !(p.sprite.image && missing.has(p.sprite.image)) &&
      (p.sprite.x >= num(stage?.width, 480) ||
        p.sprite.y >= num(stage?.height, 360) ||
        p.sprite.x + p.sprite.w <= 0 ||
        p.sprite.y + p.sprite.h <= 0),
  );
  if (outside.length)
    lines.push(
      `Começa fora do quadro, como no jogo: ${outside.map((p) => (p.kind === "sprite" ? p.sprite.varName : "")).join(", ")}.`,
    );
  if (skipped.length) lines.push(`Não importadas: ${skipped.join("; ")}.`);
  if (missing.size) lines.push(`A cena usa imagens que não vieram: ${[...missing].join(", ")}.`);
  const motion = motionLeftOut(start, loops, events);
  if (motion.length)
    lines.push(`Fica para animar no EdiSVG (não vem do jogo): ${motion.join(", ")}.`);
  const imagePalette = paletteOf(
    commands.filter((c) => c.id !== sceneArtboardId).map((c) => c.scene as ImportedScene),
  );
  return { commands, sceneArtboardId, summary: lines.join(" "), imagePalette };
}

type ScenePart =
  | { kind: "backdrop"; image: string }
  | { kind: "sprite"; sprite: Sprite }
  | {
      kind: "label";
      name: string;
      text: string;
      x: number;
      y: number;
      color: string;
      size: number;
      align: string;
    };

/**
 * The starting picture in the order the game draws it: the first loop's draw calls (backdrop,
 * drawSprite, drawLabel) when it has them, else the sprites in the order they are created. A
 * label shows the starting value of its variable.
 */
function sceneOf(start: Statement[], loops: Statement[]): ScenePart[] {
  const sprites = new Map<string, Sprite>();
  const vars = new Map<string, string>();
  for (const s of start) {
    if (s.type === "g2d:createImageSprite" || s.type === "g2d:createSprite") {
      const varName = str(s.varName);
      if (!varName) continue;
      sprites.set(varName, {
        varName,
        x: num(s.x),
        y: num(s.y),
        w: Math.max(1, num(s.w, 32)),
        h: Math.max(1, num(s.h, 32)),
        image: s.type === "g2d:createImageSprite" ? str(s.image) : null,
        color: s.type === "g2d:createSprite" ? color(s.color, "#000000") : null,
      });
    } else if (s.type === "var") {
      const name = str(s.name);
      const value = literal(s.value);
      if (name && value !== null) vars.set(name, value);
    }
  }
  const body = loops.flatMap((loop) =>
    Array.isArray(loop.body) ? (loop.body as Statement[]) : [],
  );
  const parts: ScenePart[] = [];
  const drawn = new Set<string>();
  let labels = 0;
  for (const s of body) {
    if (s.type === "g2d:drawBackdrop" && str(s.image))
      parts.push({ kind: "backdrop", image: s.image as string });
    else if (s.type === "g2d:drawSprite") {
      const sprite = sprites.get(str(s.spriteVar) ?? "");
      if (sprite && !drawn.has(sprite.varName)) {
        drawn.add(sprite.varName);
        parts.push({ kind: "sprite", sprite });
      }
    } else if (s.type === "g2d:drawLabel") {
      const text = s.text as { type?: unknown; name?: unknown } | undefined;
      const value =
        literal(text) ??
        (text?.type === "var" && typeof text.name === "string" ? vars.get(text.name) : null);
      if (value === null || value === undefined) continue;
      labels++;
      parts.push({
        kind: "label",
        name:
          text?.type === "var" && typeof text.name === "string"
            ? `Texto · ${text.name}`
            : `Texto ${labels}`,
        text: value,
        x: num(s.x),
        y: num(s.y),
        color: color(s.color, "#000000"),
        size: Math.max(1, num(s.size, 16)),
        align: str(s.align) ?? "left",
      });
    }
  }
  // Sprites never drawn by a loop (a game that draws them itself): in creation order, on top.
  for (const sprite of sprites.values())
    if (!drawn.has(sprite.varName)) parts.push({ kind: "sprite", sprite });
  return parts;
}

/** The game's motion and rules, named for the person (they are animated by hand). */
function motionLeftOut(start: Statement[], loops: Statement[], events: Statement[]): string[] {
  const out: string[] = [];
  if (events.length)
    out.push(`${events.length} ${events.length === 1 ? "evento" : "eventos"} do jogo`);
  if (start.some((s) => s.type === "g2d:setVelocity")) out.push("velocidades");
  if (start.some((s) => s.type === "g2d:enableClassicControls")) out.push("controles do teclado");
  if (
    loops.some(
      (l) =>
        Array.isArray(l.body) &&
        (l.body as Statement[]).some(
          (s) => s.type !== "g2d:clear" && !s.type.startsWith("g2d:draw"),
        ),
    )
  )
    out.push("o que muda a cada quadro");
  return out;
}

import { z } from "zod";
import type { Project } from "../../shared/project";

const artboardViewSchema = z.strictObject({
  x: z.number().min(-100000).max(100000),
  y: z.number().min(-100000).max(100000),
  originX: z.number().min(0).max(100),
  originY: z.number().min(0).max(100),
  scaleX: z.number().min(1).max(1000),
  scaleY: z.number().min(1).max(1000),
  rotation: z.number().min(-3600).max(3600),
  opacity: z.number().min(0).max(100),
});
export type ArtboardView = z.infer<typeof artboardViewSchema>;
export const defaultArtboardView = (): ArtboardView => ({
  x: 0,
  y: 0,
  originX: 0,
  originY: 0,
  scaleX: 100,
  scaleY: 100,
  rotation: 0,
  opacity: 100,
});

const schema = z.strictObject({
  version: z.literal(1),
  projectId: z.string().max(120),
  activeArtboardId: z.string().max(120).nullable(),
  activeClipId: z.string().max(120).nullable(),
  view: z.enum(["design", "animate", "machine"]),
  sidebarTab: z.enum(["hierarchy", "artboards", "assets"]),
  frame: z.number().min(0).max(360000),
  zoom: z.number().min(25).max(300),
  pan: z.strictObject({ x: z.number().min(-1e7).max(1e7), y: z.number().min(-1e7).max(1e7) }),
  artboardViews: z.record(z.string().max(120), artboardViewSchema).optional(),
  timelineZoom: z.number().min(1).max(64).optional(),
  timelineScroll: z
    .strictObject({ left: z.number().min(0).max(1e7), top: z.number().min(0).max(1e7) })
    .optional(),
  onion: z.boolean().optional(),
  snapGrid: z.union([z.literal(0), z.number().min(0.1).max(10000)]).optional(),
  rigFocus: z
    .strictObject({
      artboardId: z.string().max(120),
      open: z.boolean().optional(),
      constraintId: z.string().max(120).optional(),
      skinVertex: z.number().int().min(0).max(3999).optional(),
      parameters: z
        .strictObject({
          animationId: z.string().max(120),
          channelKey: z.string().max(300),
          frame: z.number().min(0).max(360000).nullable(),
        })
        .optional(),
    })
    .optional(),
  panelWidths: z
    .strictObject({ left: z.number().min(160).max(480), right: z.number().min(220).max(520) })
    .optional(),
  behaviorFocus: z
    .strictObject({
      artboardId: z.string().max(120),
      machineId: z.string().max(120).optional(),
      layerId: z.string().max(120).optional(),
      stateId: z.string().max(120).optional(),
      transitionId: z.string().max(120).optional(),
      dataTab: z.enum(["bindings", "listeners", "events", "formulas"]).optional(),
      modelData: z
        .strictObject({
          modelId: z.string().max(120).optional(),
          instanceId: z.string().max(120).optional(),
          open: z.boolean().optional(),
          editorPath: z.array(z.string().max(120)).max(16).optional(),
        })
        .optional(),
    })
    .optional(),
  workRange: z
    .strictObject({
      clipId: z.string().max(120),
      start: z.number().min(0).max(360000),
      end: z.number().min(0).max(360000),
    })
    .nullable()
    .optional(),
});
type Workspace = Omit<z.infer<typeof schema>, "version" | "projectId">;
/** Presets have no clip ID. Two absent IDs must not select a null range. */
export function resolvePreviewRange(
  clip: { id?: string; frames: number },
  range: Workspace["workRange"],
) {
  return range &&
    typeof clip.id === "string" &&
    range.clipId === clip.id &&
    range.start < range.end &&
    range.end <= clip.frames
    ? range
    : { start: 0, end: clip.frames };
}
export function parseWorkspace(text: string, project: Project): Workspace | null {
  if (text.length > 20000) throw new Error("Preferências excedem o limite permitido.");
  const value = schema.parse(JSON.parse(text));
  if (value.projectId !== project.id) return null;
  const clip = project.motion.animations.find((clip) => clip.id === value.activeClipId);
  return {
    activeArtboardId: project.artboards.some((board) => board.id === value.activeArtboardId)
      ? value.activeArtboardId
      : project.defaultArtboardId,
    activeClipId: clip?.id ?? null,
    view: value.view,
    sidebarTab: value.sidebarTab,
    frame: Math.min(value.frame, clip?.frames ?? 120),
    zoom: value.zoom,
    pan: value.pan,
    artboardViews: Object.fromEntries(
      Object.entries(value.artboardViews ?? {}).filter(([id]) =>
        project.artboards.some((board) => board.id === id),
      ),
    ),
    timelineZoom: value.timelineZoom ?? 1,
    timelineScroll: value.timelineScroll ?? { left: 0, top: 0 },
    onion: value.onion ?? false,
    snapGrid: value.snapGrid ?? 0,
    rigFocus:
      value.rigFocus && project.artboards.some((board) => board.id === value.rigFocus?.artboardId)
        ? value.rigFocus
        : undefined,
    panelWidths: value.panelWidths,
    behaviorFocus:
      value.behaviorFocus &&
      project.artboards.some((board) => board.id === value.behaviorFocus?.artboardId)
        ? value.behaviorFocus
        : undefined,
    workRange:
      clip &&
      value.workRange?.clipId === clip.id &&
      value.workRange.start < value.workRange.end &&
      value.workRange.end <= clip.frames
        ? value.workRange
        : null,
  };
}
export function encodeWorkspace(projectId: string, state: Workspace) {
  return JSON.stringify(
    schema.parse({
      version: 1,
      projectId,
      activeArtboardId: state.activeArtboardId,
      activeClipId: state.activeClipId,
      view: state.view,
      sidebarTab: state.sidebarTab ?? "hierarchy",
      frame: state.frame,
      zoom: state.zoom,
      pan: state.pan,
      artboardViews: state.artboardViews,
      timelineZoom: state.timelineZoom,
      timelineScroll: state.timelineScroll,
      onion: state.onion,
      snapGrid: state.snapGrid,
      rigFocus: state.rigFocus,
      panelWidths: state.panelWidths,
      behaviorFocus: state.behaviorFocus,
      workRange: state.workRange,
    }),
  );
}

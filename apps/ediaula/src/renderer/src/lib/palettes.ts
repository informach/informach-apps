import type { Annotation } from "@shared/annotation";
import { DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { DEFAULT_TRANSFORM } from "@shared/compose";
import {
  BUILT_IN_PALETTES,
  colorMapper,
  EDIAULA_PALETTE,
  identifyPaletteColors,
  type Palette,
  type PaletteColor,
  paletteSwatches,
  recolorAnnotation,
  recolorTransform,
  refont,
  themeFont,
  themeFontSet,
} from "@shared/palettes";
import type { Project } from "@shared/types";
import { create } from "zustand";
import { type Commit, personCommit, useProject } from "@/state/project";
import { renderAnnotation } from "./annotations";

interface PaletteStore {
  /** The user's own palettes (saved in the app profile, shared by all projects). */
  user: Palette[];
  load(): Promise<void>;
  save(list: Palette[]): Promise<void>;
}

export const usePalettes = create<PaletteStore>((set) => ({
  user: [],
  load: async () => set({ user: (await window.api.listPalettes()).map(identifyPaletteColors) }),
  save: async (list) => {
    const identified = list.map(identifyPaletteColors);
    set({ user: identified });
    await window.api.savePalettes(identified);
  },
}));

export const allPalettes = (user: Palette[]): Palette[] => [...BUILT_IN_PALETTES, ...user];

export function paletteById(id: string | undefined, user = usePalettes.getState().user): Palette {
  return allPalettes(user).find((p) => p.id === id) ?? EDIAULA_PALETTE;
}

/** The palette of a project (EdiAula when it has none or it was deleted). */
export const activePalette = (p: Pick<Project, "palette"> | null | undefined): Palette =>
  paletteById(p?.palette);

export function useActivePalette(): Palette {
  const id = useProject((s) => s.project?.palette);
  const user = usePalettes((s) => s.user);
  return paletteById(id, user);
}

/** Colors offered in every color row: the active palette's, each once. */
export function useSwatches(): PaletteColor[] {
  return paletteSwatches(useActivePalette());
}

/** Maps colors of any known palette to the same role in `to` (the project's current palette wins). */
function mapperTo(
  p: Pick<Project, "palette">,
  to: Palette,
): (hex: string | undefined) => string | undefined {
  const current = activePalette(p);
  return colorMapper(
    [...allPalettes(usePalettes.getState().user).filter((x) => x.id !== current.id), current],
    to,
  );
}

/** How many clips (and the captions) still have colors from another palette's roles. */
export function recolorCount(p: Project): number {
  const to = activePalette(p);
  const map = mapperTo(p, to);
  const off = (hex: string | undefined): boolean =>
    !!hex && map(hex)!.toUpperCase() !== hex.toUpperCase();
  const clips = p.clips.filter((c) => {
    const a = c.annotation;
    const t = c.transform;
    return (
      (a &&
        (off(a.color) ||
          off(a.outline?.color) ||
          off(a.fill) ||
          off(a.shadow?.color ?? undefined))) ||
      off(t?.border) ||
      off(t?.shadow?.color)
    );
  }).length;
  const captions =
    p.captions &&
    (p.captions.highlight ?? "#C8F031").toUpperCase() !== to.roles.accent.toUpperCase()
      ? 1
      : 0;
  return clips + captions;
}

/**
 * Makes `id` the project's palette (theme).
 * - `recolor`: everything already in the lesson moves to the same color roles in the new palette.
 * - `fonts`: turns the theme's fonts on or off; while they are on, switching palettes also
 *   switches the fonts. Fonts picked by hand, outside every theme, are kept.
 * Annotations are redrawn and everything lands in one undo step. Returns how many were redrawn.
 */
export async function applyPalette(
  id: string,
  opts: { recolor?: boolean; fonts?: boolean } = {},
  commit: Commit = personCommit,
): Promise<number> {
  const p = useProject.getState().project;
  if (!p) return 0;
  const to = paletteById(id);
  const useFonts = opts.fonts ?? !!p.paletteFonts;
  const refonting = opts.fonts !== undefined || (useFonts && id !== activePalette(p).id);
  // Colors of any known palette map to the same role in the new one; the project's current
  // palette is read last so its roles win where palettes share a color.
  const map = opts.recolor ? mapperTo(p, to) : null;
  const themed = themeFontSet(allPalettes(usePalettes.getState().user));
  // Redraw the annotations that change, before touching the project.
  const redrawn = new Map<
    string,
    { path: string; width: number; height: number; size: number; spec: Annotation }
  >();
  for (const c of p.clips) {
    if (!c.annotation) continue;
    let spec = c.annotation;
    if (map) spec = recolorAnnotation(spec, map, to);
    if (refonting) spec = refont(spec, useFonts ? to : null, themed);
    if (JSON.stringify(spec) === JSON.stringify(c.annotation)) continue;
    const r = await renderAnnotation(spec, p.settings.height, p.settings.width);
    redrawn.set(c.id, {
      path: await window.api.saveGenerated(r.bytes, "png"),
      width: r.width,
      height: r.height,
      size: r.bytes.length,
      spec,
    });
  }
  commit((q) => {
    const assetOf = new Map(q.assets.map((a) => [a.id, a]));
    const assets = new Map(q.assets.map((a) => [a.id, a]));
    const clips = q.clips.map((c) => {
      const d = redrawn.get(c.id);
      let next = map && c.transform ? { ...c, transform: recolorTransform(c.transform, map) } : c;
      const asset = assetOf.get(c.assetId);
      if (d && asset) {
        // Same on-screen size per pixel as before (the new picture can be a little larger or smaller).
        const t = next.transform ?? DEFAULT_TRANSFORM;
        const oldFit = Math.min(q.settings.width / asset.width, q.settings.height / asset.height);
        const newFit = Math.min(q.settings.width / d.width, q.settings.height / d.height);
        assets.set(asset.id, {
          ...asset,
          path: d.path,
          width: d.width,
          height: d.height,
          size: d.size,
        });
        next = {
          ...next,
          annotation: d.spec,
          transform: { ...t, scale: (t.scale * oldFit) / newFit },
        };
      }
      return next;
    });
    let captions = q.captions;
    if (map && captions) captions = { ...captions, highlight: to.roles.accent };
    // Captions take the theme's text font (unless a font was picked for them by hand).
    if (refonting && (!captions?.font || themed.has(captions.font))) {
      const font = useFonts ? to.fonts?.body : undefined;
      if (font || captions) captions = { ...DEFAULT_CAPTION_STYLE, burn: false, ...captions, font };
    }
    return {
      ...q,
      palette: id,
      paletteFonts: useFonts || undefined,
      assets: [...assets.values()],
      clips,
      captions,
    };
  });
  return redrawn.size;
}

/** The theme's font for a new annotation of this kind, when the project uses the theme's fonts. */
export function projectFont(
  p: Project | null | undefined,
  kind: Annotation["kind"],
): string | undefined {
  return p?.paletteFonts ? themeFont(kind, activePalette(p)) : undefined;
}

/** A copy of a palette the user can change. */
export function duplicatePalette(p: Palette, user: Palette[]): Palette {
  let name = `${p.name} (cópia)`;
  for (let i = 2; allPalettes(user).some((x) => x.name === name); i++)
    name = `${p.name} (cópia ${i})`;
  return { ...structuredClone(p), id: `p${Date.now().toString(36)}`, name, builtIn: undefined };
}

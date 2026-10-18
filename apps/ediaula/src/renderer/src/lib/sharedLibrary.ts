import type { Annotation } from "@shared/annotation";
import { DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { ANNOTATION_STYLE_KEYS } from "@shared/clipProps";
import {
  EMPTY_LIBRARY,
  type Library,
  type LibraryCategory,
  type LibraryStyle,
  plainStyle,
  type StyleTarget,
  suggestedCategory,
} from "@shared/library";
import { annotationSchema, captionsSchema, cursorFxSchema } from "@shared/project-schema";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { create } from "zustand";
import { setCaptions } from "@/editor/CaptionSettings";
import { setCursorFx } from "@/editor/RecordingProps";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { updateAnnotation } from "./annotations";
import { importMedia } from "./importMedia";

/**
 * The library of every lesson (shared/library.ts) as the editor shows it: loaded once, saved
 * whole after each change. Media come into the lesson as any import; styles are applied to what
 * is selected (an annotation), to the lesson (captions) or to the selected recording (pointer).
 */

export const useSharedLibrary = create<{ library: Library; loaded: boolean; failed: boolean }>(
  () => ({
    library: EMPTY_LIBRARY,
    loaded: false,
    failed: false,
  }),
);

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function loadSharedLibrary(): Promise<void> {
  try {
    useSharedLibrary.setState({
      library: await window.api.listLibrary(),
      loaded: true,
      failed: false,
    });
  } catch (err) {
    // Nothing is written over a library that could not be read.
    useSharedLibrary.setState({ loaded: true, failed: true });
    useApp.getState().toast(`A biblioteca de todas as aulas não abriu: ${message(err)}`, "error");
  }
}

/** The library as on disk: read first, so a change never writes over what is there. */
async function current(): Promise<Library> {
  if (!useSharedLibrary.getState().loaded) await loadSharedLibrary();
  return useSharedLibrary.getState().library;
}

async function save(next: Library): Promise<boolean> {
  if (useSharedLibrary.getState().failed) {
    useApp
      .getState()
      .toast("A biblioteca de todas as aulas não pôde ser lida, e nada foi mudado nela.", "error");
    return false;
  }
  const before = useSharedLibrary.getState().library;
  useSharedLibrary.setState({ library: next });
  try {
    await window.api.saveLibrary(next);
    return true;
  } catch (err) {
    useSharedLibrary.setState({ library: before });
    useApp.getState().toast(`A biblioteca não foi salva: ${message(err)}`, "error");
    return false;
  }
}

/** "Salvar na biblioteca": the media of this lesson kept for the next ones. */
export async function saveMediaToLibrary(asset: Asset, category?: LibraryCategory): Promise<void> {
  const library = await current();
  if (library.media.some((m) => m.path.toLowerCase() === asset.path.toLowerCase())) {
    useApp.getState().toast(`${asset.name} já está na biblioteca.`, "info");
    return;
  }
  const ok = await save({
    ...library,
    media: [
      ...library.media,
      {
        id: newId("lib"),
        name: asset.name.slice(0, 200),
        path: asset.path,
        kind: asset.kind,
        category: category ?? suggestedCategory(asset.kind),
        addedAt: Date.now(),
      },
    ],
  });
  if (ok)
    useApp.getState().toast(`${asset.name} foi para a biblioteca de todas as aulas.`, "success");
}

export async function removeFromLibrary(id: string): Promise<void> {
  const library = await current();
  await save({
    ...library,
    media: library.media.filter((m) => m.id !== id),
    styles: library.styles.filter((s) => s.id !== id),
  });
}

export async function setMediaCategory(id: string, category: LibraryCategory): Promise<void> {
  const library = await current();
  await save({
    ...library,
    media: library.media.map((m) => (m.id === id ? { ...m, category } : m)),
  });
}

/** A media of the library in this lesson's media (as any import). */
export function addLibraryMedia(path: string): Promise<Asset[]> {
  return importMedia([path]);
}

/** "Favoritar estilo": the look of what is selected kept with a name. */
export async function favoriteStyle(
  target: StyleTarget,
  name: string,
  value: object,
  kind?: string,
): Promise<void> {
  const library = await current();
  const style: LibraryStyle = {
    id: newId("sty"),
    name: name.slice(0, 200) || "Estilo",
    target,
    ...(kind ? { kind } : {}),
    value: plainStyle(value),
    addedAt: Date.now(),
  };
  const ok = await save({ ...library, styles: [...library.styles, style] });
  if (ok) useApp.getState().toast(`Estilo "${style.name}" guardado nos favoritos.`, "success");
}

/** The look of an annotation, without its text or its shape on screen. */
export function annotationStyle(a: Annotation): object {
  const out: Record<string, unknown> = {};
  for (const k of ANNOTATION_STYLE_KEYS) if (a[k] !== undefined) out[k] = structuredClone(a[k]);
  return out;
}

/** Applies a favorite style where it belongs; false (with a hint) when there is nothing to take it. */
export function applyStyle(style: LibraryStyle): boolean {
  const { project, selection } = useProject.getState();
  const { toast } = useApp.getState();
  if (!project) return false;
  if (style.target === "caption") {
    const look = captionsSchema.partial().safeParse(style.value);
    if (!look.success) return false;
    setCaptions({ ...DEFAULT_CAPTION_STYLE, ...look.data });
    toast(`Legenda com o estilo "${style.name}".`, "success");
    return true;
  }
  const picked = project.clips.filter((c) => selection.includes(c.id));
  if (style.target === "annotation") {
    const notes = picked.filter((c) => c.annotation);
    if (!notes.length) {
      toast("Selecione uma anotação na timeline para aplicar este estilo.", "info");
      return false;
    }
    const look = annotationSchema.partial().safeParse(style.value);
    if (!look.success) return false;
    const { kind: _kind, text: _text, ...changes } = look.data;
    for (const c of notes) void updateAnnotation(c.id, changes);
    return true;
  }
  const recordings = [
    ...new Set(
      picked
        .map((c) => project.assets.find((a) => a.id === c.assetId))
        .filter((a): a is Asset => !!a?.cursor)
        .map((a) => a.id),
    ),
  ];
  if (!recordings.length) {
    toast("Selecione um clipe de uma gravação de tela para aplicar este cursor.", "info");
    return false;
  }
  const look = cursorFxSchema.partial().safeParse(style.value);
  if (!look.success) return false;
  const { path: _path, pathEdits: _edits, ...changes } = look.data;
  for (const id of recordings) setCursorFx(id, changes);
  return true;
}

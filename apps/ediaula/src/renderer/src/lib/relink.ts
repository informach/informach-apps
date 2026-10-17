import { fileName, relinkMismatch } from "@shared/relink";
import type { Asset, RelinkSearch, RelinkWanted } from "@shared/types";
import { loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { renderAnnotation } from "./annotations";
import { makeProxy } from "./importMedia";
import { restoreBlankPicture } from "./zoomLayer";

/**
 * Media that went missing: the user points at them again (by file or by folder) and the cuts,
 * zooms, cursor, transcript and caches stay. Pictures the editor makes itself (annotations,
 * the blank picture of zoom layers) are drawn again instead of being looked for.
 */

/** What the user has to find: a media file, or the cursor data of a recording. */
export const needsRelink = (a: Asset): boolean =>
  (!!a.missing && !a.generated) || !!a.cursorMissing;

const assetsNow = (): Asset[] => useProject.getState().project?.assets ?? [];

/** Files that follow a media when it moves: the cursor data saved next to a recording. */
const companionsOf = (a: Asset): string[] => (a.cursor ? [a.cursor] : []);

/** The cursor data's new place, when it moved along with the media. */
const cursorMove = (a: Asset, companions: Record<string, string>): { cursor?: string } =>
  a.cursor && companions[a.cursor] ? { cursor: companions[a.cursor] } : {};

/** Marks media whose files (or cursor data) disappeared, redraws missing pictures and resumes
 *  proxies interrupted by closing the app. */
export async function checkAssets(): Promise<void> {
  const project = useProject.getState().project;
  if (!project?.assets.length) return;
  const paths = project.assets.map((a) => a.path);
  const cursorAt = new Map<string, number>();
  for (const a of project.assets)
    if (a.cursor) {
      cursorAt.set(a.id, paths.length);
      paths.push(a.cursor);
    }
  const exists = await window.api.exists(paths);
  const { patchAsset } = useProject.getState();
  project.assets.forEach((a, i) => {
    const missing = !exists[i];
    const at = cursorAt.get(a.id);
    const cursorMissing = at !== undefined && !exists[at];
    if (!!a.missing !== missing || !!a.cursorMissing !== cursorMissing)
      patchAsset(a.id, { missing, cursorMissing });
    if (!missing && a.proxyStatus === "pending") void makeProxy(a);
    // A transcription interrupted by closing the app has to be started again.
    if (a.transcriptStatus === "pending") patchAsset(a.id, { transcriptStatus: undefined });
  });
  await redrawMissingPictures();
}

/** Draws a picture of the editor again (its file was deleted, or the project came from another PC). */
async function redraw(a: Asset): Promise<boolean> {
  const p = useProject.getState().project;
  if (!p) return false;
  let picture: { path: string; size: number } | null = null;
  if (a.generated === "annotation") {
    const annotation = p.clips.find((c) => c.assetId === a.id && c.annotation)?.annotation;
    if (!annotation) return false;
    const r = await renderAnnotation(annotation, p.settings.height, p.settings.width);
    picture = { path: await window.api.saveGenerated(r.bytes, "png"), size: r.bytes.length };
  } else if (a.generated === "effect") {
    picture = { path: await restoreBlankPicture(), size: 1 };
  }
  if (!picture) return false;
  useProject.getState().relinkAsset(a.id, picture);
  return true;
}

/** Every missing picture of the editor drawn again; failures are reported, not hidden. */
export async function redrawMissingPictures(): Promise<number> {
  let redrawn = 0;
  const failed: string[] = [];
  for (const a of assetsNow().filter((x) => x.missing && x.generated)) {
    try {
      if (await redraw(a)) redrawn++;
      else failed.push(a.name);
    } catch (err) {
      failed.push(`${a.name} (${(err as Error).message})`);
    }
  }
  if (failed.length)
    useApp
      .getState()
      .toast(`Não foi possível redesenhar estas imagens: ${failed.join(", ")}.`, "error");
  return redrawn;
}

/**
 * Points a missing media at `path` when it is the same media (shared/relink.ts). Thumbnail,
 * waveform, proxy, transcript, cut-out video and zooms stay: they belong to the media, not to
 * where the file is. Returns why it was refused, or null.
 */
async function relinkTo(
  asset: Asset,
  path: string,
  companions: Record<string, string>,
): Promise<string | null> {
  const info = await window.api.probe(path);
  const problem = relinkMismatch(asset, info);
  if (problem) return problem;
  useProject
    .getState()
    .relinkAsset(asset.id, { path, size: info.size, ...cursorMove(asset, companions) });
  if (asset.proxyStatus === "pending") void makeProxy({ ...asset, path, missing: false });
  return null;
}

const wantedOf = (assets: Asset[]): RelinkWanted[] =>
  assets
    .filter((a) => a.missing && !a.generated && a.size > 0)
    .map((a) => ({
      key: a.id,
      name: fileName(a.path),
      size: a.size,
      kind: a.kind,
      duration: a.duration,
      width: a.width,
      height: a.height,
      oldPath: a.path,
      companions: companionsOf(a),
    }));

/** What a folder search found, reconnected (the main process already checked each file). */
function applyFound(result: RelinkSearch): number {
  let found = 0;
  for (const [id, item] of Object.entries(result.found)) {
    const asset = assetsNow().find((a) => a.id === id);
    if (!asset) continue;
    useProject.getState().relinkAsset(id, {
      path: item.path,
      size: item.size,
      ...cursorMove(asset, item.companions),
    });
    if (asset.proxyStatus === "pending") void makeProxy({ ...asset, path: item.path });
    found++;
  }
  return found;
}

const files = (n: number): string => (n === 1 ? "1 arquivo" : `${n} arquivos`);

const stillMissing = (): string => {
  const left = assetsNow().filter(needsRelink).length;
  if (!left) return "";
  return left === 1
    ? " Ainda falta 1: use Procurar em uma pasta na biblioteca."
    : ` Ainda faltam ${left}: use Procurar em uma pasta na biblioteca.`;
};

const searchNotes = (result: RelinkSearch): string =>
  `${result.refused === 1 ? " 1 com o mesmo nome era outra mídia." : result.refused ? ` ${result.refused} com o mesmo nome eram outra mídia.` : ""}${result.truncated ? " A pasta tem arquivos demais: procurei só nos primeiros 50 mil." : ""}`;

/** The cursor data of a recording, when only it went missing. */
async function relinkCursor(asset: Asset): Promise<void> {
  const { toast } = useApp.getState();
  const path = await window.api.relinkCursor(asset.cursor ?? "cursor.json");
  if (!path) return;
  const data = await loadCursorData(path);
  if (!Array.isArray(data?.moves) || !Array.isArray(data?.clicks)) {
    toast("Esse arquivo não tem os dados de cursor de uma gravação do EdiAula.", "error");
    return;
  }
  useProject.getState().relinkAsset(asset.id, { cursor: path });
  toast(`Cursor de ${asset.name} reconectado.${stillMissing()}`, "success");
}

/** "Arquivo sumiu" → the user points at the file; the other missing ones are looked for next to it. */
export async function relinkAsset(id: string): Promise<void> {
  const { toast } = useApp.getState();
  const asset = assetsNow().find((a) => a.id === id);
  if (!asset) return;
  try {
    if (asset.generated) {
      if (await redraw(asset)) toast(`${asset.name}: imagem desenhada de novo.`, "success");
      else toast(`Não foi possível desenhar ${asset.name} de novo.`, "error");
      return;
    }
    if (!asset.missing && asset.cursorMissing) {
      await relinkCursor(asset);
      return;
    }
    const picked = await window.api.relinkPick({
      oldPath: asset.path,
      companions: companionsOf(asset),
    });
    if (!picked) return;
    const problem = await relinkTo(asset, picked.path, picked.companions);
    if (problem) {
      toast(`Esse arquivo não é a mesma mídia de ${asset.name}: ${problem}.`, "error");
      return;
    }
    const wanted = wantedOf(assetsNow());
    const result = wanted.length ? await window.api.relinkFolder(wanted, picked.token) : null;
    const found = result ? applyFound(result) : 0;
    toast(
      `${asset.name} reconectado.${found ? ` Na mesma pasta também encontrei ${files(found)}.` : ""}${stillMissing()}`,
      "success",
    );
  } catch (err) {
    toast(`Não foi possível reconectar ${asset.name}: ${(err as Error).message}`, "error");
  }
}

/** Looks for every missing media in a folder the user picks. */
export async function relinkMissingInFolder(): Promise<void> {
  const { toast } = useApp.getState();
  const wanted = wantedOf(assetsNow());
  if (!wanted.length) return;
  try {
    const result = await window.api.relinkFolder(wanted);
    if (result.canceled) return;
    const found = applyFound(result);
    toast(
      found
        ? `${files(found)} ${found === 1 ? "reconectado" : "reconectados"}.${searchNotes(result)}${stillMissing()}`
        : `Nenhuma das mídias ausentes foi encontrada nessa pasta (procuro pelo nome e pelo tamanho do arquivo).${searchNotes(result)}`,
      found ? "success" : "info",
    );
  } catch (err) {
    toast(`Não foi possível procurar as mídias: ${(err as Error).message}`, "error");
  }
}

/** From the export warning: pictures are drawn again, then one missing media asks for its file
 *  and several for a folder. */
export async function reconnectMissing(): Promise<void> {
  await redrawMissingPictures();
  const wanted = assetsNow().filter(needsRelink);
  if (wanted.length === 1) await relinkAsset(wanted[0].id);
  else if (wanted.length) await relinkMissingInFolder();
}

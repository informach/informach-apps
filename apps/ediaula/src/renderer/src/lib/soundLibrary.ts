import type { SoundEffectId } from "@shared/soundEffects";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { actions } from "./actions";
import { importMedia } from "./importMedia";

/**
 * The library's sound effects as media (shared/soundEffects.ts): the main process writes them as
 * WAV files in Documentos/EdiAula/Efeitos sonoros (made again when missing), and a lesson brings
 * one in as any other file, so it is packed, relinked and exported like the rest.
 */

let files: Promise<Map<SoundEffectId, string>> | null = null;

export function soundFiles(): Promise<Map<SoundEffectId, string>> {
  if (!files) {
    const loading = window.api.sounds
      .library()
      .then((list) => new Map(list.map((f) => [f.id, f.path] as const)));
    // A folder that could not be written is tried again next time.
    loading.catch(() => {
      if (files === loading) files = null;
    });
    files = loading;
  }
  return files;
}

/** The file of a sound effect, written again when it was deleted since the folder was listed. */
export async function soundPath(id: SoundEffectId, retry = true): Promise<string | undefined> {
  const path = (await soundFiles()).get(id);
  if (!path) return undefined;
  if (!(await window.api.exists([path]))[0]) {
    if (!retry) throw new Error(`${path} não foi gravado.`);
    files = null;
    return soundPath(id, false);
  }
  return path;
}

/** The sound effect as a media of this lesson (the one already there, if it is). */
export async function soundAsset(id: SoundEffectId): Promise<Asset | undefined> {
  try {
    const path = await soundPath(id);
    if (!path) return undefined;
    const [asset] = await importMedia([path]);
    return asset;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useApp.getState().toast(`O efeito sonoro não pôde ser preparado: ${message}`, "error");
    return undefined;
  }
}

/** "Aqui": the sound where the timeline's cursor is, on an "Efeitos sonoros" track. */
export async function placeSoundHere(id: SoundEffectId): Promise<void> {
  const asset = await soundAsset(id);
  if (asset) actions.placeSoundEffect(asset, usePlayback.getState().time);
}

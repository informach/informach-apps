import { fileName } from "@shared/relink";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { holdingSaves, useProject } from "@/state/project";
import { checkAssets } from "./relink";

/**
 * Lesson files as a whole (Duplicar, Renomear, Restaurar cópia de segurança), from the start
 * screen or the editor's File menu. The open lesson is written first,
 * so the file holds everything that was on screen.
 */

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const isOpen = (path: string): boolean =>
  useProject.getState().path?.toLowerCase() === path.toLowerCase();

/** Writes the open lesson when it is this one; false (with a warning) when that failed. */
async function settled(path: string): Promise<boolean> {
  if (!isOpen(path) || (await useProject.getState().flush())) return true;
  useApp
    .getState()
    .toast("A aula não foi salva agora. Resolva o salvamento antes de continuar.", "error");
  return false;
}

/** A copy of the lesson as a lesson of its own, beside it. Returns its path. */
export async function duplicateLesson(path: string): Promise<string | null> {
  const { toast } = useApp.getState();
  if (!(await settled(path))) return null;
  try {
    const copy = await window.api.duplicateProject(path);
    toast(`Cópia criada: ${fileName(copy).replace(/\.ediaula$/i, "")}.`, "success");
    return copy;
  } catch (err) {
    toast(`Não foi possível duplicar a aula: ${message(err)}`, "error");
    return null;
  }
}

/** A new name for the lesson and its file; the open lesson goes on under it. */
export async function renameLesson(path: string, name: string): Promise<string | null> {
  const { toast } = useApp.getState();
  const clean = name.trim();
  if (!clean) return null;
  if (!(await settled(path))) return null;
  try {
    // Saves wait while the file moves: an edit made meanwhile goes to the renamed file.
    const target = await holdingSaves(async () => {
      const moved = await window.api.renameProject(path, clean);
      if (isOpen(path)) useProject.getState().renamed(moved, clean);
      return moved;
    });
    toast(`Aula renomeada para ${clean}.`, "success");
    return target;
  } catch (err) {
    toast(`Não foi possível renomear a aula: ${message(err)}`, "error");
    return null;
  }
}

/**
 * Puts a backup back. What the lesson is now becomes a backup first, so this can be taken back
 * by restoring that one. The open lesson reopens as restored (its undo history starts again).
 */
export async function restoreLesson(path: string, id: string): Promise<boolean> {
  const { toast } = useApp.getState();
  if (!(await settled(path))) return false;
  try {
    const project = await window.api.restoreBackup(path, id);
    if (isOpen(path)) {
      playback.pause();
      const time = usePlayback.getState().time;
      useProject.getState().load(path, project);
      playback.seek(time);
      void checkAssets();
    }
    toast("Cópia de segurança restaurada. O estado de antes virou uma cópia também.", "success");
    return true;
  } catch (err) {
    toast(`Não foi possível restaurar a cópia: ${message(err)}`, "error");
    return false;
  }
}

import { withGroups } from "./groups.ts";
import type { Project } from "./types.ts";

/**
 * The clips an AI tool edits when it is given clip ids, as the editor does with a selection: the
 * other clips of their groups come along (Ctrl+G), and clips on a locked track are left as they
 * are. Every id is checked before anything changes.
 */
export interface ClipTargets {
  /** The clips to edit: the ids asked, their groups, without the locked ones. */
  ids: string[];
  /** Ids asked that are not in the lesson. */
  missing: string[];
  /** Clips left out because their track is locked (asked or in a group asked). */
  locked: string[];
}

export function clipTargets(
  p: Pick<Project, "clips" | "tracks">,
  asked: readonly string[],
  options: { groups?: boolean } = {},
): ClipTargets {
  const known = new Set(p.clips.map((c) => c.id));
  const missing = [...new Set(asked.filter((id) => !known.has(id)))];
  const present = asked.filter((id) => known.has(id));
  const wanted = new Set(options.groups === false ? present : withGroups(p.clips, present));
  const lockedTracks = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const ids: string[] = [];
  const locked: string[] = [];
  // In project order, so the answer lists them as the timeline has them.
  for (const c of p.clips) {
    if (!wanted.has(c.id)) continue;
    if (lockedTracks.has(c.trackId)) locked.push(c.id);
    else ids.push(c.id);
  }
  return { ids, missing, locked };
}

/** The line an answer adds about the clips a locked track kept as they were. */
export const lockedNote = (locked: readonly string[]): string =>
  locked.length
    ? ` ${locked.length === 1 ? "O clipe" : "Os clipes"} ${locked.join(", ")} ${locked.length === 1 ? "está numa faixa travada e ficou" : "estão em faixas travadas e ficaram"} como ${locked.length === 1 ? "estava" : "estavam"}: peça para a pessoa destravar a faixa se for para mudar.`
    : "";

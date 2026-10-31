import { backgroundAsset } from "./look.ts";
import type { Project } from "./types.ts";

/**
 * Every media the lesson still needs, to play, export or go on being edited: those on the
 * timeline, the source of a held frame and the screen under a drawing's pen (of those, and so on),
 * the background picture, the kids characters' videos and the stretches found in them, the music
 * waiting for the lesson to start and `keep` (media the person still has to decide about, such as
 * a presenter's video waiting to be placed). Takes recorded over and media removed from the
 * timeline are not in it.
 */
export function usedAssetIds(
  p: Pick<Project, "assets" | "clips" | "background" | "kids" | "pendingStart">,
  keep: Iterable<string> = [],
): Set<string> {
  const used = new Set<string>(keep);
  for (const c of p.clips) used.add(c.assetId);
  const background = backgroundAsset(p);
  if (background) used.add(background);
  for (const id of p.kids?.videos ?? []) used.add(id);
  for (const piece of p.kids?.pieces ?? []) {
    used.add(piece.assetId);
    used.add(piece.voice.assetId);
  }
  if (p.pendingStart?.music) used.add(p.pendingStart.music.assetId);
  // What a used media is made from is used too (a held frame of a held frame, a pen over a take).
  const byId = new Map(p.assets.map((a) => [a.id, a]));
  const todo = [...used];
  while (todo.length) {
    const a = byId.get(todo.pop() ?? "");
    for (const from of [a?.still?.assetId, a?.drawing?.pointer?.assetId])
      if (from && !used.has(from)) {
        used.add(from);
        todo.push(from);
      }
  }
  return used;
}

/**
 * The lesson with only the media in `used` (usedAssetIds), and nothing left pointing at the ones
 * that went: their protected stretches, the proposals anchored in them and the bits of exported
 * voices mapped to them.
 */
export function onlyUsedAssets(p: Project, used: ReadonlySet<string>): Project {
  const assets = p.assets.filter((a) => used.has(a.id));
  if (assets.length === p.assets.length) return p;
  const out: Project = { ...p, assets };
  if (p.protected) out.protected = p.protected.filter((r) => used.has(r.assetId));
  if (p.proposals)
    out.proposals = p.proposals.filter((x) =>
      x.items.every((i) => i.anchors.every((a) => used.has(a.assetId))),
    );
  if (p.voiceMasters)
    out.voiceMasters = p.voiceMasters.map((m) => ({
      ...m,
      pieces: m.pieces.map((piece) => ({
        ...piece,
        sourceMap: piece.sourceMap.filter((s) => used.has(s.assetId)),
      })),
    }));
  return out;
}

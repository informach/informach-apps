import {
  type ClosedSlivers,
  closeSlivers,
  findSlivers,
  type Hold,
  sliverCover,
} from "@shared/cutawayJoins";
import type { Asset, Project } from "@shared/types";
import { heldSecond, stillAsset } from "./stills";

/**
 * The slivers of screen between animations (shared/cutawayJoins.ts) covered in `p`: the held
 * frames they need are made here (a still picture of the animation's last frame, as "Estender
 * quadro" makes), the rest is shared/cutawayJoins.ts. A frame that cannot be made leaves the
 * animation slightly slower instead. Returns the new clips and the pictures to add to the lesson.
 */
export async function closeCutawaySlivers(
  p: Project,
  opts: { trackIds?: readonly string[]; min?: number } = {},
): Promise<ClosedSlivers & { assets: Asset[] }> {
  const slivers = findSlivers(p, opts);
  const key = (h: Pick<Hold, "clipId" | "side">): string => `${h.clipId}:${h.side}`;
  const made = new Map<string, Asset>();
  for (const s of slivers) {
    const { extend, hold, tiny } = sliverCover(p, s);
    if (!hold || tiny || made.has(key(hold))) continue;
    const clip = p.clips.find((c) => c.id === hold.clipId);
    const asset = clip && p.assets.find((a) => a.id === clip.assetId);
    if (!clip || !asset) continue;
    try {
      // The frame the animation ends on once it ran on (after), or the one it starts on (before).
      const at =
        hold.side === "after"
          ? heldSecond({ ...clip, duration: clip.duration + extend }, asset, Infinity)
          : heldSecond(clip, asset, clip.start);
      made.set(key(hold), await stillAsset(asset, at));
    } catch (err) {
      // Without the picture the animation slows down a little instead (closeSlivers).
      console.warn("[ediaula] sliver_still_failed", err instanceof Error ? err.message : err);
    }
  }
  const result = closeSlivers(p, slivers, (h) => made.get(key(h))?.id);
  const used = new Set(result.clips.map((c) => c.assetId));
  return { ...result, assets: [...made.values()].filter((a) => used.has(a.id)) };
}

/** What closing the slivers did, in a sentence (empty when there were none). */
export function sliverReport(r: ClosedSlivers, fmt: (t: number) => string): string {
  const parts: string[] = [];
  if (r.closed.length)
    parts.push(
      `${r.closed.length === 1 ? "Sobra de tela fechada" : `${r.closed.length} sobras de tela fechadas`} entre animações (${r.closed.map((s) => fmt(s.start)).join(", ")}): a animação de antes cobre até a seguinte, com uma transição só na troca.`,
    );
  for (const s of r.slowed)
    parts.push(
      `A animação [${s.clipId}] ficou ${Math.round((1 - s.speed) * 1000) / 10}% mais lenta para cobrir a sobra (o quadro parado não pôde ser feito).`,
    );
  if (r.left.length)
    parts.push(
      `Ficou como estava em ${r.left.map((s) => fmt(s.start)).join(", ")}: cobrir pediria deixar a animação mais de 5% mais lenta.`,
    );
  return parts.join(" ");
}

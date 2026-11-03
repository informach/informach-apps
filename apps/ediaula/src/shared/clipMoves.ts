import { clipEnd } from "./clipTime.ts";
import { withGroups } from "./groups.ts";
import { splitClip } from "./timeline.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Edits of the AI tools split_clip, move_clips and align_track_to: one clip split on its own
 * track, clips moved in time without ripple, and a track lined up with the clips of another.
 * Every function works out the whole result first and returns an error instead of a partial
 * change, so a refused call leaves the lesson as it was.
 */

const EPS = 1e-6;

const clock = (s: number): string => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
};

export type Refusal = { ok: false; error: string };

/** split_clip: the clip `id` in two at timeline second `at`. The other clips do not change. */
export function splitOneClip(
  p: Pick<Project, "clips" | "tracks">,
  id: string,
  at: number,
): { ok: true; clips: Clip[]; first: string; second: string } | Refusal {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return { ok: false, error: `Clipe não encontrado: ${id}. Nada foi feito.` };
  if (p.tracks.find((t) => t.id === c.trackId)?.locked)
    return {
      ok: false,
      error: `O clipe ${id} está numa faixa travada: nada foi feito. Peça para a pessoa destravar a faixa.`,
    };
  // Layout, speed, effects and group go to both halves; the entrance stays with the first and
  // the exit with the second, and the second starts in the media where the first ends.
  const parts = splitClip(c, at);
  if (!parts)
    return {
      ok: false,
      error: `${clock(at)} não está dentro do clipe ${id} (${clock(c.start)}–${clock(clipEnd(c))}), ou fica a menos de um quadro de uma borda. Nada foi feito.`,
    };
  const clips = p.clips.flatMap((x) => (x.id === id ? parts : [x]));
  return { ok: true, clips, first: parts[0].id, second: parts[1].id };
}

/** One clip to move: to `start`, or by `delta` seconds. */
export interface MoveRequest {
  id: string;
  start?: number;
  delta?: number;
}

export interface MovePlan {
  ok: true;
  clips: Clip[];
  /** Every clip that moved (the ones asked and their groups), with where it was and is now. */
  moved: { id: string; from: number; to: number }[];
  /** Clips asked (or in a group asked) left out because their track is locked. */
  locked: string[];
}

/**
 * move_clips: clips moved in time on their own tracks, without ripple. The groups move along,
 * as in the editor. Only the final state is checked, so clips may pass over each other on the
 * way: the call is refused, and nothing moves, when a clip would start before 0 or overlap
 * another clip on its track.
 */
export function planMoves(
  p: Pick<Project, "clips" | "tracks">,
  requests: readonly MoveRequest[],
): MovePlan | Refusal {
  const byId = new Map(p.clips.map((c) => [c.id, c]));
  const missing = requests.filter((r) => !byId.has(r.id)).map((r) => r.id);
  if (missing.length)
    return {
      ok: false,
      error: `Clipes não encontrados: ${[...new Set(missing)].join(", ")}. Nada foi feito. Use os ids de get_overview.`,
    };
  const lockedTracks = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  // How far each clip moves: its own request, or the request of a clip of its group.
  const deltas = new Map<string, { delta: number; by: string }>();
  for (const r of requests) {
    const c = byId.get(r.id)!;
    if ((r.start === undefined) === (r.delta === undefined))
      return {
        ok: false,
        error: `Para o clipe ${r.id}, informe start ou delta (um dos dois). Nada foi feito.`,
      };
    const delta = r.start !== undefined ? r.start - c.start : (r.delta ?? 0);
    for (const member of withGroups(p.clips, [r.id])) {
      const earlier = deltas.get(member);
      if (earlier && Math.abs(earlier.delta - delta) > EPS)
        return {
          ok: false,
          error: `O clipe ${member} receberia dois deslocamentos (${earlier.by} e ${r.id} estão no mesmo grupo ou repetidos). Nada foi feito: desagrupe os clipes ou mova o grupo de uma vez.`,
        };
      deltas.set(member, { delta, by: r.id });
    }
  }
  const locked: string[] = [];
  const moves = new Map<string, number>();
  for (const [id, { delta }] of deltas) {
    const c = byId.get(id)!;
    if (lockedTracks.has(c.trackId)) locked.push(id);
    else if (Math.abs(delta) > EPS) moves.set(id, c.start + delta);
  }
  for (const [id, start] of moves)
    if (start < -EPS)
      return {
        ok: false,
        error: `O clipe ${id} começaria antes do início da aula (${start.toFixed(2)} s). Nada foi feito.`,
      };
  const clips = p.clips.map((c) =>
    moves.has(c.id) ? { ...c, start: Math.max(0, moves.get(c.id)!) } : c,
  );
  const overlap = firstOverlap(clips, new Set(moves.keys()));
  if (overlap) return { ok: false, error: overlap };
  return {
    ok: true,
    clips,
    moved: [...moves].map(([id, to]) => ({ id, from: byId.get(id)!.start, to })),
    locked,
  };
}

/** The first overlap, on a track, between a moved clip and any other clip; null when none. */
function firstOverlap(clips: readonly Clip[], moved: ReadonlySet<string>): string | null {
  const tracks = new Set(clips.filter((c) => moved.has(c.id)).map((c) => c.trackId));
  for (const trackId of tracks) {
    const on = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length && on[j].start < clipEnd(on[i]) - EPS; j++) {
        const [a, b] = [on[i], on[j]];
        if (!moved.has(a.id) && !moved.has(b.id)) continue;
        const [x, y] = moved.has(a.id) ? [a, b] : [b, a];
        return `O clipe ${x.id} ficaria sobre o clipe ${y.id} na mesma faixa, de ${clock(Math.max(a.start, b.start))} a ${clock(Math.min(clipEnd(a), clipEnd(b)))}. Nada foi movido.`;
      }
  }
  return null;
}

export interface AlignPlan {
  ok: true;
  clips: Clip[];
  /** Timeline seconds where the content was split (in the track as it was). */
  splits: number[];
  /** Each piece: its id, where it started before and where it starts now. */
  pieces: { id: string; from: number; to: number }[];
  /** Reference length against content length, when they differ by more than 0,2 s. */
  warning?: string;
}

/** Above this difference between the reference and the content, align_track_to warns. */
export const ALIGN_TOLERANCE = 0.2;

/**
 * align_track_to: the content of `trackId` is taken as the clips of `referenceTrackId` joined
 * without their pauses (an avatar rendered from the whole narration). It is split where each
 * reference clip ends and each piece goes to the start of its reference clip, so the pauses come
 * back. The reference and every other track stay as they are.
 */
export function planAlign(
  p: Pick<Project, "clips" | "tracks">,
  trackId: string,
  referenceTrackId: string,
): AlignPlan | Refusal {
  const target = p.tracks.find((t) => t.id === trackId);
  const reference = p.tracks.find((t) => t.id === referenceTrackId);
  if (!target || !reference)
    return {
      ok: false,
      error: `Faixa não encontrada: ${[!target ? trackId : "", !reference ? referenceTrackId : ""].filter(Boolean).join(", ")}. Nada foi feito. Use os ids de get_overview.`,
    };
  if (trackId === referenceTrackId)
    return { ok: false, error: "A faixa a ajustar e a de referência são a mesma. Nada foi feito." };
  if (target.locked)
    return {
      ok: false,
      error: `A faixa ${target.name} está travada: nada foi feito. Peça para a pessoa destravar a faixa.`,
    };
  const content = p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  const refs = p.clips
    .filter((c) => c.trackId === referenceTrackId)
    .sort((a, b) => a.start - b.start);
  if (!content.length) return { ok: false, error: `A faixa ${target.name} não tem clipes.` };
  if (refs.length < 2)
    return {
      ok: false,
      error: `A faixa de referência ${reference.name} precisa de pelo menos dois clipes para haver pausas a devolver.`,
    };
  // A piece moved apart from its group would break the group: the editor moves groups whole.
  const ids = new Set(content.map((c) => c.id));
  const outside = withGroups(p.clips, [...ids]).filter((id) => !ids.has(id));
  if (outside.length)
    return {
      ok: false,
      error: `Clipes da faixa ${target.name} estão em grupo com clipes de outras faixas (${outside.join(", ")}). Nada foi feito: desagrupe antes de alinhar.`,
    };
  const origin = content[0].start;
  // Where each reference clip begins in the joined content (seconds from its start).
  const offsets: number[] = [];
  let total = 0;
  for (const r of refs) {
    offsets.push(total);
    total += r.duration;
  }
  const length = clipEnd(content[content.length - 1]) - origin;
  const warning =
    Math.abs(length - total) > ALIGN_TOLERANCE
      ? `A referência soma ${total.toFixed(1)} s e o conteúdo da faixa tem ${length.toFixed(1)} s (diferença de ${Math.abs(length - total).toFixed(1)} s): confira se a faixa é mesmo a referência emendada, sem as pausas.`
      : undefined;
  // Split at every reference boundary that falls inside a content clip.
  const splits = offsets.slice(1).map((o) => origin + o);
  let clips = [...p.clips];
  for (const at of splits) {
    const c = clips.find(
      (x) => x.trackId === trackId && x.start < at - EPS && clipEnd(x) > at + EPS,
    );
    if (!c) continue;
    const parts = splitClip(c, at);
    if (parts) clips = clips.flatMap((x) => (x.id === c.id ? parts : [x]));
  }
  // Each piece follows the reference clip its content belongs to.
  const pieces = clips.filter((c) => c.trackId === trackId);
  const requests: MoveRequest[] = pieces.map((c) => {
    const offset = c.start - origin;
    let k = 0;
    while (k + 1 < offsets.length && offsets[k + 1] <= offset + EPS) k++;
    return { id: c.id, delta: refs[k].start - (origin + offsets[k]) };
  });
  const plan = planMoves({ clips, tracks: p.tracks }, requests);
  if (!plan.ok) return plan;
  return {
    ok: true,
    clips: plan.clips,
    splits: splits.filter((at) => at < origin + length - EPS),
    pieces: pieces
      .map((c) => ({
        id: c.id,
        from: c.start,
        to: plan.clips.find((x) => x.id === c.id)?.start ?? c.start,
      }))
      .sort((a, b) => a.to - b.to),
    ...(warning ? { warning } : {}),
  };
}

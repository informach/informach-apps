/**
 * The preview's media elements, as pure logic (the DOM side is mediaPool.ts): each media of a
 * track plays through a pair of elements (a lane), never one per piece. The pieces of a lane
 * take turns by their order: even pieces on element A, odd ones on element B, so while one
 * piece plays, the other element waits already at the start of the next piece, decoded and
 * still; at the cut it plays from there and the first one moves on to the piece after. A lesson
 * cut in two hundred places keeps two decoders per file instead of one per piece in sight.
 *
 * Pieces of a lane may overlap only with their neighbors (the tail of a transition), and they
 * are on different elements by their order too. One clock rules them all (the playback clock);
 * the picture of a cut-out avatar follows its own voice, which follows the clock.
 */

/** A clip as a lane sees it, in timeline seconds (end includes a transition's tail). */
export interface PoolClip {
  id: string;
  start: number;
  end: number;
  /** Source second at `start`, and source seconds per timeline second. */
  in: number;
  speed: number;
}

/** What one element of a lane does now: play a piece from a source second, or wait at it. */
export interface SlotPlan {
  clipId: string;
  play: boolean;
  /** Source second the element should be at. */
  time: number;
}

export type LanePlan = [SlotPlan | null, SlotPlan | null];

/** The element (0 = A, 1 = B) that plays the piece at `index` of its lane. */
export const slotOf = (index: number): 0 | 1 => (index % 2 === 0 ? 0 : 1);

/** Pieces of each lane in order: what plays one file on one track in one role. */
export function buildLanes<T extends { lane: string; clip: PoolClip }>(
  entries: readonly T[],
): Map<string, PoolClip[]> {
  const lanes = new Map<string, PoolClip[]>();
  for (const { lane, clip } of entries) {
    const list = lanes.get(lane);
    if (list) list.push(clip);
    else lanes.set(lane, [clip]);
  }
  for (const list of lanes.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return lanes;
}

/** Index of the last piece starting at or before `t` (−1 when none). */
function lastStarted(clips: readonly PoolClip[], t: number): number {
  let lo = 0;
  let hi = clips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (clips[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

const sourceAt = (c: PoolClip, t: number): number => c.in + (t - c.start) * c.speed;

/**
 * What the two elements of a lane do at timeline second `t`: the pieces on screen play (two at
 * a transition), and an element left free waits at the start of the next piece that comes within
 * `lookahead` seconds.
 */
export function planLane(clips: readonly PoolClip[], t: number, lookahead: number): LanePlan {
  const plan: LanePlan = [null, null];
  const i = lastStarted(clips, t);
  for (const k of [i - 1, i])
    if (k >= 0 && t < clips[k].end)
      plan[slotOf(k)] = { clipId: clips[k].id, play: true, time: sourceAt(clips[k], t) };
  for (let k = i + 1; k < clips.length && k <= i + 2; k++) {
    const slot = slotOf(k);
    if (plan[slot] || clips[k].start - t > lookahead) continue;
    plan[slot] = { clipId: clips[k].id, play: false, time: clips[k].in };
  }
  return plan;
}

/** Which element serves each clip in a plan (only the clips in it). */
export function servedBy(
  plans: ReadonlyMap<string, LanePlan>,
): Map<string, { lane: string; slot: 0 | 1 }> {
  const out = new Map<string, { lane: string; slot: 0 | 1 }>();
  for (const [lane, plan] of plans)
    plan.forEach((p, slot) => {
      if (p) out.set(p.clipId, { lane, slot: slot === 0 ? 0 : 1 });
    });
  return out;
}

/**
 * Where a playing picture should be: on the clock, or, for the cut-out avatar, where its voice
 * is (the voice follows the clock and the picture follows the voice), while the voice plays the
 * same piece and is not seeking.
 */
export function pictureTarget(
  clock: number,
  voice: { time: number; playing: boolean; seeking: boolean } | null,
): number {
  return voice?.playing && !voice.seeking ? voice.time : clock;
}

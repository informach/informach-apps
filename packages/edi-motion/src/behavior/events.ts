import type { Animation } from "../model";
import type { TimelineEvent } from "./model";

export interface EventOccurrence {
  event: TimelineEvent;
  seconds: number;
  direction: "forward" | "reverse";
}
/** Clock time is monotonic even for ping-pong. Seeking/resetting is owned by
 * the caller and does not masquerade as traversing the timeline. */
export function timelineEventsBetween(
  events: readonly TimelineEvent[],
  clip: Animation,
  from: number,
  to: number,
  includeStart = false,
): EventOccurrence[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from)
    throw new Error("Intervalo de eventos inválido.");
  const duration = clip.frames / clip.fps,
    result: EventOccurrence[] = [];
  const period = clip.mode === "ping-pong" ? duration * 2 : duration;
  const first = clip.mode === "once" ? 0 : Math.max(0, Math.floor(from / period));
  const last = clip.mode === "once" ? 0 : Math.floor(to / period);
  if (last - first > 10000) throw new Error("Intervalo excede o orçamento de ciclos de eventos.");
  const add = (event: TimelineEvent, seconds: number, direction: "forward" | "reverse") => {
    if ((seconds > from || (includeStart && seconds === from)) && seconds <= to) {
      if (result.length >= 512)
        throw new Error("Orçamento de eventos por avanço excedido; reduza o intervalo.");
      result.push({ event, seconds, direction });
    }
  };
  for (const event of events) {
    if (event.animationId !== clip.id) continue;
    for (let cycle = first; cycle <= last; cycle++) {
      add(event, cycle * period + event.frame / clip.fps, "forward");
      if (clip.mode === "ping-pong" && event.frame > 0 && event.frame < clip.frames)
        add(event, (cycle + 1) * period - event.frame / clip.fps, "reverse");
    }
  }
  return result.sort(
    (a, b) =>
      a.seconds - b.seconds || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
  );
}

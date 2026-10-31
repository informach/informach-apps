import type { SetLog } from "./runner";

export interface SessionLike {
  startedAt: number;
  duration: number;
  logs: SetLog[];
}

const DAY = 86_400_000;
export const dayKey = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Dias seguidos com treino, terminando hoje ou ontem. */
export function streakDays(sessions: SessionLike[], now = Date.now()) {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  let d = dayKey(now);
  if (!days.has(d)) d -= DAY;
  let n = 0;
  while (days.has(d)) {
    n++;
    d = dayKey(d - DAY / 2);
  }
  return n;
}

export interface ExerciseRecord {
  exerciseId: string;
  bestSet: number;
  bestHold: number;
  totalReps: number;
  sets: number;
  lastAt: number;
}

export function records(sessions: SessionLike[]): ExerciseRecord[] {
  const map = new Map<string, ExerciseRecord>();
  for (const s of sessions)
    for (const l of s.logs) {
      const r = map.get(l.exerciseId) ?? {
        exerciseId: l.exerciseId,
        bestSet: 0,
        bestHold: 0,
        totalReps: 0,
        sets: 0,
        lastAt: 0,
      };
      r.bestSet = Math.max(r.bestSet, l.reps);
      r.bestHold = Math.max(r.bestHold, l.holdSeconds);
      r.totalReps += l.reps;
      r.sets++;
      r.lastAt = Math.max(r.lastAt, s.startedAt);
      map.set(l.exerciseId, r);
    }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/** Novos recordes batidos na sessão em relação às sessões anteriores. */
export function newRecords(previous: SessionLike[], logs: SetLog[]) {
  const before = new Map(records(previous).map((r) => [r.exerciseId, r]));
  const best = new Map<string, { kind: SetLog["kind"]; value: number }>();
  for (const l of logs) {
    const value = l.kind === "hold" ? l.holdSeconds : l.reps;
    const cur = best.get(l.exerciseId);
    if (!cur || value > cur.value) best.set(l.exerciseId, { kind: l.kind, value });
  }
  return [...best]
    .filter(([id, { kind, value }]) => {
      const b = before.get(id);
      return value > 0 && value > (kind === "hold" ? (b?.bestHold ?? 0) : (b?.bestSet ?? 0));
    })
    .map(([exerciseId, v]) => ({ exerciseId, ...v }));
}

/** Repetições por semana nas últimas `weeks` semanas (mais antiga primeiro). */
export function weeklyReps(sessions: SessionLike[], weeks = 8, now = Date.now()) {
  const start = dayKey(now) - ((new Date(now).getDay() + 6) % 7) * DAY; // segunda-feira
  return Array.from({ length: weeks }, (_, i) => {
    const from = start - (weeks - 1 - i) * 7 * DAY;
    const to = from + 7 * DAY;
    const inWeek = sessions.filter((s) => s.startedAt >= from && s.startedAt < to);
    return {
      from,
      reps: inWeek.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.reps, 0), 0),
      sessions: inWeek.length,
      minutes: Math.round(inWeek.reduce((t, s) => t + s.duration, 0) / 60),
    };
  });
}

/** Série de valores por sessão para um exercício (melhor série de cada sessão). */
export function exerciseHistory(sessions: SessionLike[], exerciseId: string) {
  return sessions
    .filter((s) => s.logs.some((l) => l.exerciseId === exerciseId))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const ls = s.logs.filter((l) => l.exerciseId === exerciseId);
      return {
        at: s.startedAt,
        best: Math.max(...ls.map((l) => (l.kind === "hold" ? l.holdSeconds : l.reps))),
        total: ls.reduce((t, l) => t + l.reps, 0),
      };
    });
}

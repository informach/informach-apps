const pad = (v: number, n = 2): string => String(Math.floor(v)).padStart(n, "0");

/** 00:01:23:12 (hours:minutes:seconds:frames). */
export function timecode(seconds: number, fps: number): string {
  const s = Math.max(0, seconds);
  const frames = Math.floor((s - Math.floor(s)) * fps + 1e-6);
  return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad(frames)}`;
}

/** 1:23 or 1:02:03 for durations. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s / 60) % 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 1:23.4 (minutes, seconds and tenths), for where something is placed on the timeline. */
export function clockTenths(seconds: number): string {
  // Rounded first, so 59,96 s is 1:00.0 and never 0:60.0.
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths - minutes * 600) / 10).toFixed(1).padStart(4, "0")}`;
}

/** Ruler label: 0:05, 1:30, 1:00:00 — with tenths when the step is below a second. */
export function rulerLabel(seconds: number, step: number): string {
  if (step < 1) return `${duration(Math.floor(seconds))}.${Math.round((seconds % 1) * 10)}`;
  return duration(seconds);
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

export function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} sem.`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function baseName(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "");
}

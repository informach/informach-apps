/**
 * The narration of a pipeline run in the editor: the stretch of the lesson's audio plays in the
 * preview with the animation it belongs to, and a bar over the timeline shows its sentences (the
 * current one lit; a click goes to it) over the waveform. It is a reference: never part of the
 * project's exports. A file holds one per animation (a lesson may have a full-screen scene and a
 * demonstration over the screen, each with its stretch of the narration); a run again for the same
 * animation replaces its own. They are kept on this computer by project
 * (src/main/pipelineReferences.ts), so the file opened again brings them back.
 */

export interface NarrationLine {
  text: string;
  /** Seconds from the start of the narration (= frame 0 of its animation). */
  start: number;
  end: number;
}

export interface Narration {
  /** The animation it plays with, and its name. */
  clipId: string;
  name: string;
  url: string;
  duration: number;
  /** Lesson second the narration starts at (for the export's name and the report). */
  lessonStart: number;
  lines: NarrationLine[];
  peaks: number[];
}

/** The narrations of the open file, by animation, each with its audio element. */
const parts = new Map<string, { narration: Narration; audio: HTMLAudioElement }>();
const of = (clipId: string | null | undefined) => (clipId ? parts.get(clipId) : undefined);

/** Peaks of the WAV for the bar (one per pixel column, 0..1); empty when it cannot be decoded. */
async function peaksOf(bytes: Uint8Array, columns = 600): Promise<number[]> {
  try {
    const context = new OfflineAudioContext(1, 1, 22050);
    const buffer = await context.decodeAudioData(bytes.slice().buffer);
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / columns));
    const out: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      let peak = 0;
      for (let j = i; j < Math.min(data.length, i + step); j++)
        peak = Math.max(peak, Math.abs(data[j] ?? 0));
      out.push(peak);
    }
    const top = Math.max(1e-6, ...out);
    return out.map((p) => p / top);
  } catch {
    return [];
  }
}

/**
 * The narration of an animation: added, or replacing the one that animation had. `live` is asked
 * after the peaks are read: when it says no (another file opened meanwhile), nothing is added and
 * the narrations of the file now open are left alone (null).
 */
export async function setNarration(
  value: Omit<Narration, "url" | "peaks"> & { bytes: Uint8Array },
  live: () => boolean = () => true,
): Promise<Narration | null> {
  dropNarration(value.clipId);
  const url = URL.createObjectURL(new Blob([value.bytes.slice().buffer], { type: "audio/wav" }));
  const { bytes, ...rest } = value;
  const narration: Narration = { ...rest, url, peaks: await peaksOf(bytes) };
  if (!live()) {
    URL.revokeObjectURL(url);
    return null;
  }
  // Another narration set for the same animation while the peaks were read: that one goes too.
  dropNarration(value.clipId);
  const audio = new Audio(url);
  audio.preload = "auto";
  // In the page (hidden), outside the markup the editor rebuilds: one element per narration.
  audio.hidden = true;
  audio.dataset.narration = "";
  document.body.append(audio);
  parts.set(narration.clipId, { narration, audio });
  return narration;
}

/** Takes away the narration of one animation. */
export function dropNarration(clipId: string): void {
  const part = parts.get(clipId);
  if (!part) return;
  part.audio.pause();
  part.audio.remove();
  URL.revokeObjectURL(part.narration.url);
  parts.delete(clipId);
}

/** Takes away every narration (another file opened). */
export function clearNarration(): void {
  for (const clipId of [...parts.keys()]) dropNarration(clipId);
}

export const narration = (clipId: string | null | undefined): Narration | null =>
  of(clipId)?.narration ?? null;

/**
 * Keeps the audio with the animation: playing from `seconds` while it plays (corrected when it
 * drifts), paused on the same second otherwise. Another animation open: silent.
 */
export function syncNarration(
  activeClipId: string | null,
  playing: boolean,
  seconds: number,
): void {
  for (const [clipId, { narration: current, audio }] of parts) {
    const mine = activeClipId === clipId;
    if (!mine || !playing || seconds >= current.duration) {
      if (!audio.paused) audio.pause();
      if (mine && Math.abs(audio.currentTime - seconds) > 0.05)
        audio.currentTime = Math.max(0, Math.min(current.duration, seconds));
      continue;
    }
    if (Math.abs(audio.currentTime - seconds) > 0.15) audio.currentTime = seconds;
    if (audio.paused) void audio.play().catch(() => undefined);
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * The bar over the timeline of the narration's animation, placed before `.timeline-body`; `seek`
 * goes to a second of it. Nothing when the open animation is another one.
 */
export function mountNarrationBar(
  root: ParentNode,
  activeClipId: string | null,
  seconds: number,
  seek: (seconds: number) => void,
): void {
  root.querySelector(".narration-bar")?.remove();
  const n = of(activeClipId)?.narration;
  if (!n) return;
  const body = root.querySelector(".timeline .timeline-body");
  if (!body) return;
  const bar = document.createElement("div");
  bar.className = "narration-bar";
  const pct = (s: number) => `${((s / n.duration) * 100).toFixed(3)}%`;
  const now = n.lines.find((l) => seconds >= l.start && seconds < l.end);
  bar.innerHTML = `<span class="narration-label" title="Trecho da aula de ${clock(n.lessonStart)} a ${clock(n.lessonStart + n.duration)}. Toca na prévia; não entra na exportação.">Narração</span><div class="narration-lane"><canvas class="narration-wave" aria-hidden="true"></canvas>${n.lines
    .map(
      (l, i) =>
        `<button type="button" class="narration-line${l === now ? " is-now" : ""}" data-line="${i}" style="left:${pct(l.start)};width:${pct(Math.max(0.05, l.end - l.start))}" title="${escapeHtml(`${clock(l.start)} · ${l.text}`)}">${escapeHtml(l.text)}</button>`,
    )
    .join("")}</div><span class="narration-now">${now ? escapeHtml(now.text) : ""}</span>`;
  body.before(bar);
  for (const button of bar.querySelectorAll<HTMLButtonElement>("[data-line]"))
    button.onclick = () => {
      const line = n.lines[Number(button.dataset.line)];
      if (line) seek(line.start);
    };
  const canvas = bar.querySelector("canvas");
  if (canvas && n.peaks.length) {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(79, 227, 193, 0.35)";
      for (let x = 0; x < width; x++) {
        const peak = n.peaks[Math.floor((x / width) * n.peaks.length)] ?? 0;
        const h = Math.max(1, peak * height);
        ctx.fillRect(x, (height - h) / 2, 1, h);
      }
    }
  }
}

/** Lights the sentence at `seconds` in the bar (each frame, without rebuilding it). */
export function markNarrationNow(
  root: ParentNode,
  activeClipId: string | null,
  seconds: number,
): void {
  const current = of(activeClipId)?.narration;
  if (!current) return;
  const bar = root.querySelector(".narration-bar");
  if (!bar) return;
  const index = current.lines.findIndex((l) => seconds >= l.start && seconds < l.end);
  for (const button of bar.querySelectorAll<HTMLButtonElement>("[data-line]"))
    button.classList.toggle("is-now", Number(button.dataset.line) === index);
  const label = bar.querySelector(".narration-now");
  const text = index >= 0 ? (current.lines[index]?.text ?? "") : "";
  if (label && label.textContent !== text) label.textContent = text;
}

/**
 * The name a video of the narration's animation is saved with: the animation's name and where it
 * starts in the lesson ("Narração · Cena animada do jogo (começa em 2m15,7s)"), to place it in
 * EdiAula over the narration. Undefined for any other animation.
 */
export function narrationExportName(clipId: string | undefined): string | undefined {
  const current = of(clipId)?.narration;
  if (!current) return undefined;
  // "2m15,7s": a colon is not allowed in a Windows file name; tenths keep the sync.
  const tenths = Math.floor(current.lessonStart * 10);
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1).replace(".", ",").padStart(4, "0");
  const label = `${minutes}m${seconds}s`;
  return `${current.name} (começa em ${label})`.replace(/[<>:"/\\|?*]/g, "-").slice(0, 120);
}

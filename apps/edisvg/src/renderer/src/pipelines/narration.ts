/**
 * The narration of a pipeline run in the editor: the stretch of the lesson's audio plays in the
 * preview with the animation it belongs to, and a bar over the timeline shows its sentences (the
 * current one lit; a click goes to it) over the waveform. It is a reference: never part of the
 * project's exports. It lasts while the file is open (a new run replaces it).
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

let current: Narration | null = null;
let audio: HTMLAudioElement | null = null;

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

export async function setNarration(
  value: Omit<Narration, "url" | "peaks"> & { bytes: Uint8Array },
): Promise<Narration> {
  clearNarration();
  const url = URL.createObjectURL(new Blob([value.bytes.slice().buffer], { type: "audio/wav" }));
  const { bytes, ...rest } = value;
  current = { ...rest, url, peaks: await peaksOf(bytes) };
  audio = new Audio(url);
  audio.preload = "auto";
  // In the page (hidden), outside the markup the editor rebuilds: one element per narration.
  audio.hidden = true;
  audio.dataset.narration = "";
  document.body.append(audio);
  return current;
}

export function clearNarration(): void {
  audio?.pause();
  audio?.remove();
  audio = null;
  if (current) URL.revokeObjectURL(current.url);
  current = null;
}

export const narration = (): Narration | null => current;

/**
 * Keeps the audio with the animation: playing from `seconds` while it plays (corrected when it
 * drifts), paused on the same second otherwise. Another animation open: silent.
 */
export function syncNarration(
  activeClipId: string | null,
  playing: boolean,
  seconds: number,
): void {
  if (!current || !audio) return;
  const mine = activeClipId === current.clipId;
  if (!mine || !playing || seconds >= current.duration) {
    if (!audio.paused) audio.pause();
    if (mine && Math.abs(audio.currentTime - seconds) > 0.05)
      audio.currentTime = Math.max(0, Math.min(current.duration, seconds));
    return;
  }
  if (Math.abs(audio.currentTime - seconds) > 0.15) audio.currentTime = seconds;
  if (audio.paused) void audio.play().catch(() => undefined);
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
  if (!current || activeClipId !== current.clipId) return;
  const body = root.querySelector(".timeline .timeline-body");
  if (!body) return;
  const n = current;
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
export function markNarrationNow(root: ParentNode, seconds: number): void {
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
 * starts in the lesson ("Narração · Cena animada do jogo (começa em 2m15s)"), to place it in
 * EdiAula over the narration. Undefined for any other animation.
 */
export function narrationExportName(clipId: string | undefined): string | undefined {
  if (!current || clipId !== current.clipId) return undefined;
  // "2m15s": a colon is not allowed in a Windows file name.
  const at = Math.floor(current.lessonStart);
  const label = `${Math.floor(at / 60)}m${(at % 60).toString().padStart(2, "0")}s`;
  return `${current.name} (começa em ${label})`.replace(/[<>:"/\\|?*]/g, "-").slice(0, 120);
}

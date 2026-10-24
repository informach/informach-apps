import { clockOffset, overAnchor } from "@shared/overNarration";
import { mediaUrl } from "@/lib/media";

/**
 * "Tela sobre a narração": the lesson's voice in the headphones while the screen is recorded.
 * The audio goes through an AudioContext, whose outputLatency and baseLatency say how far behind
 * the element's clock the sound reaches the ears. Every half second while it plays, the recorder
 * notes which timeline second was being heard and when, on the main process's clock (QPC): the
 * take is placed on the timeline from those notes (shared/overNarration.ts).
 */

const ANCHOR_MS = 500;

/** The window's clock against the main process's, by a few round trips. */
async function measureOffset(): Promise<number> {
  const samples: { sent: number; got: number; qpc: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const sent = performance.now();
    const qpc = await window.api.recorder.clock();
    samples.push({ sent, got: performance.now(), qpc });
  }
  return clockOffset(samples);
}

export class OverPlayer {
  private readonly audio: HTMLAudioElement;
  private readonly ctx: AudioContext;
  private readonly fileStart: number;
  private offset = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Called on every note with the second being heard (the recorder stops a redo at its end). */
  onHeard: (at: number) => void = () => undefined;
  onError: (message: string) => void = () => undefined;

  constructor(path: string, fileStart: number) {
    this.fileStart = fileStart;
    this.audio = new Audio();
    // media:// is another origin than the page: without CORS the AudioContext hears silence (the
    // element's clock still runs, so the karaoke moves with nothing in the headphones).
    // media:// sends the CORS headers, as the preview's elements count on (editor/mediaPool.ts).
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";
    this.audio.src = mediaUrl(path);
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx.createMediaElementSource(this.audio).connect(this.ctx.destination);
  }

  async load(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.audio.oncanplay = () => resolve();
      this.audio.onerror = () => reject(new Error("Não foi possível abrir a voz da aula."));
      this.audio.load();
    });
    this.offset = await measureOffset();
  }

  /** Seconds of sound still in the way to the headphones. */
  private latency(): number {
    return Math.max(0, (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0));
  }

  /** Timeline second being heard now. */
  heard(): number {
    return this.fileStart + this.audio.currentTime - this.latency();
  }

  /** Plays from timeline second `from` (or goes on where it paused). */
  async play(from?: number): Promise<void> {
    if (from !== undefined) this.audio.currentTime = Math.max(0, from - this.fileStart);
    await this.ctx.resume();
    await this.audio.play();
    clearInterval(this.timer);
    this.note();
    this.timer = setInterval(() => this.note(), ANCHOR_MS);
  }

  pause(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.audio.pause();
  }

  stop(): void {
    this.pause();
    void this.ctx.close();
  }

  private note(): void {
    if (this.audio.paused) return;
    const a = overAnchor({
      now: performance.now(),
      currentTime: this.audio.currentTime,
      fileStart: this.fileStart,
      latency: this.latency(),
      offset: this.offset,
    });
    window.api.recorder
      .overAnchor(a.at, a.qpc)
      .catch((error: unknown) =>
        this.onError(error instanceof Error ? error.message : String(error)),
      );
    this.onHeard(a.at);
  }
}

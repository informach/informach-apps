/**
 * The DOM side of the preview's pool (previewPool.ts): two media elements per lane, made once
 * and moved into the layer of the piece they serve (a move keeps the decoder and its position),
 * and their sound through WebAudio: each element feeds a gain node, which takes the clip's
 * volume (above 100% too), its volume envelope and the ducking, then a master node that is
 * measured for the checks.
 */

export type MediaKind = "video" | "audio";

interface Entry {
  els: [HTMLMediaElement | null, HTMLMediaElement | null];
  srcs: [string, string];
  kind: MediaKind;
}

export interface PoolStats {
  elements: number;
  lanes: number;
  playing: number;
  /** Frames the video elements dropped and showed, since they were made. */
  dropped: number;
  frames: number;
  /** Seeks while playing, since the pool was made (each is a hitch). */
  seeks: number;
  /** Loudness of the preview's sound right now, 0..1 (RMS of the master). */
  level: number;
  audio: AudioContextState | "none";
}

export class MediaPool {
  private readonly lanes = new Map<string, Entry>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private readonly gains = new WeakMap<HTMLMediaElement, GainNode>();
  private readonly parking: HTMLElement;
  /** Seeks made while an element was playing. */
  seeks = 0;
  /** Called when an element finished seeking (the preview places everything again). */
  onSeeked: (() => void) | null = null;

  constructor(parking: HTMLElement) {
    this.parking = parking;
  }

  /** The element of a lane's slot, made when needed and pointed at `src`. */
  element(
    lane: string,
    slot: 0 | 1,
    kind: MediaKind,
    src: string,
    className: string,
  ): HTMLMediaElement {
    let entry = this.lanes.get(lane);
    if (!entry || entry.kind !== kind) {
      if (entry) this.dropLane(lane);
      entry = { els: [null, null], srcs: ["", ""], kind };
      this.lanes.set(lane, entry);
    }
    let el = entry.els[slot];
    if (!el) {
      el = document.createElement(kind);
      // Same origin rules as fetch: media:// sends the CORS headers, so WebAudio hears it.
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      el.preservesPitch = true;
      el.className = className;
      el.addEventListener("seeked", () => this.onSeeked?.());
      this.parking.appendChild(el);
      entry.els[slot] = el;
    }
    if (entry.srcs[slot] !== src) {
      entry.srcs[slot] = src;
      el.src = src;
    }
    return el;
  }

  /** Puts the element in `host` (the layer of its piece); a move keeps it decoding. */
  host(el: HTMLMediaElement, host: HTMLElement | null | undefined): void {
    const target = host ?? this.parking;
    if (el.parentElement === target) return;
    const move = (target as HTMLElement & { moveBefore?: (n: Node, r: Node | null) => void })
      .moveBefore;
    if (move && el.isConnected) move.call(target, el, null);
    else target.appendChild(el);
  }

  /** The sound's gain (made the first time, which routes the element through WebAudio). */
  setGain(el: HTMLMediaElement, value: number): void {
    const node = this.gainOf(el);
    if (!node) return;
    const v = Math.max(0, Math.min(8, value));
    if (Math.abs(node.gain.value - v) > 1e-4) node.gain.value = v;
  }

  private gainOf(el: HTMLMediaElement): GainNode | null {
    let node = this.gains.get(el);
    if (node) return node;
    const ctx = this.audio();
    if (!ctx || !this.master) return null;
    node = ctx.createGain();
    ctx.createMediaElementSource(el).connect(node);
    node.connect(this.master);
    this.gains.set(el, node);
    return node;
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    this.ctx = new AudioContext({ latencyHint: "playback" });
    this.master = this.ctx.createGain();
    this.meter = this.ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.master.connect(this.meter);
    this.meter.connect(this.ctx.destination);
    return this.ctx;
  }

  /** WebAudio waits for the first play: resumed whenever something plays. */
  wake(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  /** Every element of the pool. */
  all(): HTMLMediaElement[] {
    const out: HTMLMediaElement[] = [];
    for (const e of this.lanes.values()) for (const el of e.els) if (el) out.push(el);
    return out;
  }

  /** Lanes not used any more (their media left the lesson) give their elements back. */
  keepOnly(lanes: ReadonlySet<string>): void {
    for (const key of [...this.lanes.keys()]) if (!lanes.has(key)) this.dropLane(key);
  }

  private dropLane(key: string): void {
    const entry = this.lanes.get(key);
    if (!entry) return;
    for (const el of entry.els) {
      if (!el) continue;
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
    this.lanes.delete(key);
  }

  stats(): PoolStats {
    const all = this.all();
    let dropped = 0;
    let frames = 0;
    for (const el of all)
      if (el instanceof HTMLVideoElement) {
        const q = el.getVideoPlaybackQuality();
        dropped += q.droppedVideoFrames;
        frames += q.totalVideoFrames;
      }
    let level = 0;
    if (this.meter) {
      const data = new Float32Array(this.meter.fftSize);
      this.meter.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      level = Math.sqrt(sum / data.length);
    }
    return {
      elements: all.length,
      lanes: this.lanes.size,
      playing: all.filter((el) => !el.paused).length,
      dropped,
      frames,
      seeks: this.seeks,
      level,
      audio: this.ctx?.state ?? "none",
    };
  }

  dispose(): void {
    for (const key of [...this.lanes.keys()]) this.dropLane(key);
    void this.ctx?.close();
    this.ctx = null;
  }
}

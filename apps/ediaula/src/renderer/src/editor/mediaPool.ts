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
  /** Each element's WebAudio nodes, disconnected when the element goes. */
  private readonly nodes = new Map<
    HTMLMediaElement,
    { source: MediaElementAudioSourceNode; gain: GainNode }
  >();
  private readonly parking: HTMLElement;
  /** Seeks made while an element was playing. */
  seeks = 0;
  private readonly tracks = new WeakMap<HTMLMediaElement, TextTrack>();
  private readonly captioned = new WeakMap<HTMLMediaElement, string>();
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
    const known = this.nodes.get(el);
    if (known) return known.gain;
    const ctx = this.audio();
    if (!ctx || !this.master) return null;
    const gain = ctx.createGain();
    const source = ctx.createMediaElementSource(el);
    source.connect(gain);
    gain.connect(this.master);
    this.nodes.set(el, { source, gain });
    return gain;
  }

  /**
   * Seconds between an element's position and the moment its sound is heard (WebAudio's own
   * buffering): a picture following a voice stays that much behind it.
   */
  latency(): number {
    if (!this.ctx) return 0;
    return (this.ctx.baseLatency ?? 0) + (this.ctx.outputLatency ?? 0);
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    // Interactive: the smallest buffering, so the sound stays with the picture.
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    // A limiter on the master: clips above 100% and the mix of several tracks never clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    this.meter = this.ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.master.connect(limiter);
    limiter.connect(this.meter);
    this.meter.connect(this.ctx.destination);
    return this.ctx;
  }

  /** WebAudio waits for the first play: resumed whenever something plays. */
  wake(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  /**
   * The words heard in the piece an element serves, as a captions track of the element (screen
   * readers and the browser's own captions), in its source seconds; made again only when the
   * piece or its words change.
   */
  captions(
    el: HTMLMediaElement,
    key: string,
    cues: readonly { start: number; end: number; text: string }[],
  ): void {
    if (this.captioned.get(el) === key) return;
    this.captioned.set(el, key);
    let track = this.tracks.get(el);
    if (!track) {
      track = el.addTextTrack("captions", "Falas da aula", "pt-BR");
      track.mode = "hidden";
      this.tracks.set(el, track);
    }
    for (const cue of [...(track.cues ?? [])]) track.removeCue(cue);
    for (const c of cues) if (c.end > c.start) track.addCue(new VTTCue(c.start, c.end, c.text));
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
      const routed = this.nodes.get(el);
      if (routed) {
        routed.source.disconnect();
        routed.gain.disconnect();
        this.nodes.delete(el);
      }
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

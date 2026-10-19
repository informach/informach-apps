import {
  ClipMeter,
  dbfs,
  excludesOwnAudio,
  floatLevels,
  MICROPHONE_CONSTRAINTS,
  SilenceMeter,
  sourceGain,
} from "@informach/edi-desktop/audio";

const METER_SECONDS = 0.1;

/**
 * The quick video's sound: the microphone and the computer's sound, each through its own gain
 * (volume/mute) and meter, mixed into one track for the recorder. Levels are measured after the
 * gain, so the meter shows what is being recorded.
 */
export class AudioMix {
  constructor() {
    this.context = new AudioContext();
    this.destination = this.context.createMediaStreamDestination();
    this.sources = new Map();
    this.timer = null;
  }
  /**
   * A context created without a click may start suspended, and resume() then waits for one.
   * Waits at most a second; false means the sound is not flowing and the caller must say so.
   */
  async start() {
    if (this.context.state === "suspended")
      await Promise.race([
        this.context.resume(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    return this.context.state === "running";
  }
  /** Opens the chosen microphone (empty id: the system default). */
  async addMicrophone({ deviceId, volume, muted }) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...MICROPHONE_CONSTRAINTS, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      video: false,
    });
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error("O microfone não entregou áudio.");
    return this.add("microphone", stream, { volume, muted, label: track.label });
  }
  /** Adds the computer's sound that came with the screen capture. */
  addSystem(stream, { volume, muted }) {
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error("O Windows não entregou o áudio do PC.");
    const source = this.add("system", new MediaStream([track]), { volume, muted });
    source.excludesApp = excludesOwnAudio(track.getSettings());
    return source;
  }
  add(kind, stream, { volume, muted, label = "" }) {
    this.remove(kind);
    const input = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 2048;
    gain.gain.value = sourceGain(volume, muted);
    input.connect(gain);
    gain.connect(analyser);
    gain.connect(this.destination);
    const source = {
      kind,
      label,
      stream,
      input,
      gain,
      analyser,
      volume,
      muted,
      buffer: new Float32Array(analyser.fftSize),
      silence: new SilenceMeter(),
      clip: new ClipMeter(),
      level: { peak: 0, rms: 0, db: Number.NEGATIVE_INFINITY, silentFor: 0, clipping: false },
      excludesApp: false,
    };
    this.sources.set(kind, source);
    return source;
  }
  remove(kind) {
    const source = this.sources.get(kind);
    if (!source) return;
    source.input.disconnect();
    source.gain.disconnect();
    for (const track of source.stream.getTracks()) track.stop();
    this.sources.delete(kind);
  }
  set(kind, { volume, muted }) {
    const source = this.sources.get(kind);
    if (!source) return;
    if (volume !== undefined) source.volume = volume;
    if (muted !== undefined) source.muted = muted;
    source.gain.gain.setTargetAtTime(
      sourceGain(source.volume, source.muted),
      this.context.currentTime,
      0.015,
    );
  }
  /** Measures every source ten times a second and reports the levels. */
  watch(report) {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      for (const source of this.sources.values()) {
        source.analyser.getFloatTimeDomainData(source.buffer);
        const { peak, rms } = floatLevels(source.buffer);
        source.level = {
          peak,
          rms,
          db: dbfs(rms),
          silentFor: source.muted ? 0 : source.silence.add(rms, METER_SECONDS),
          clipping: source.clip.add(peak, METER_SECONDS),
        };
      }
      report(this.levels());
    }, METER_SECONDS * 1000);
  }
  levels() {
    return Object.fromEntries([...this.sources].map(([kind, source]) => [kind, source.level]));
  }
  /** The mixed track, or null without sources. */
  track() {
    return this.sources.size ? (this.destination.stream.getAudioTracks()[0] ?? null) : null;
  }
  async close() {
    clearInterval(this.timer);
    for (const kind of [...this.sources.keys()]) this.remove(kind);
    for (const track of this.destination.stream.getTracks()) track.stop();
    if (this.context.state !== "closed") await this.context.close();
  }
}

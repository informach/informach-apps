import { excludesOwnAudio, SYSTEM_AUDIO_CONSTRAINTS } from "@shared/systemAudio";

/** The answer of SystemAudio.excludesApp, once per window. */
let probe: Promise<boolean> | null = null;

/**
 * The computer's sound (Windows loopback through Chromium, without the sound this window plays:
 * shared/systemAudio.ts), sent to the main process one second at a time so nothing waits in this
 * window's memory: a crash keeps what was already sent. It never pauses; the take's pauses are
 * cut on import like the other sources. The first chunk says when it started and the last when
 * it ended, so its drift can be measured.
 */

export class SystemAudio {
  private readonly rec: MediaRecorder;
  private readonly stream: MediaStream;
  private startedAt = 0;
  private first = true;
  private chain: Promise<void> = Promise.resolve();
  private readonly onError: (message: string) => void;
  /** The track leaves this window's own sound out (false on a Windows without process loopback). */
  excludesApp = false;

  private constructor(stream: MediaStream, onError: (message: string) => void) {
    this.stream = stream;
    this.onError = onError;
    this.rec = new MediaRecorder(new MediaStream(stream.getAudioTracks()), {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 160_000,
    });
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      const data = e.data;
      this.queue(async () => {
        const bytes = new Uint8Array(await data.arrayBuffer());
        await window.api.recorder.systemChunk(bytes, this.first ? this.startedAt : undefined);
        this.first = false;
      });
    };
  }

  /**
   * Whether this Windows leaves this window's own sound out of the computer's sound, asked once (a
   * capture opened and closed at once). False when the capture cannot be opened at all.
   */
  static excludesApp(): Promise<boolean> {
    probe ??= (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: SYSTEM_AUDIO_CONSTRAINTS,
      });
      try {
        const [track] = stream.getAudioTracks();
        return !!track && excludesOwnAudio(track.getSettings());
      } finally {
        for (const t of stream.getTracks()) t.stop();
      }
    })().catch(() => false);
    return probe;
  }

  static async start(onError: (message: string) => void): Promise<SystemAudio> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: SYSTEM_AUDIO_CONSTRAINTS,
    });
    for (const t of stream.getVideoTracks()) t.stop();
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error("sem trilha de áudio");
    const audio = new SystemAudio(stream, onError);
    audio.excludesApp = excludesOwnAudio(track.getSettings());
    await new Promise<void>((resolve) => {
      audio.rec.onstart = () => {
        audio.startedAt = Date.now();
        resolve();
      };
      audio.rec.start(1000);
    });
    return audio;
  }

  /** Chunks go out in order; one that fails is reported and the next ones still go. */
  private queue(send: () => Promise<void>): void {
    this.chain = this.chain.then(send).catch((error: unknown) => {
      this.onError(`Áudio do PC: ${(error as Error).message}`);
    });
  }

  /**
   * Stops and sends what is left, with the moment it ended: taken when the stop is asked for,
   * which is where the sound ends (the last chunk and "stop" come later, after encoding).
   */
  async finish(): Promise<void> {
    const endedAt = Date.now();
    if (this.rec.state !== "inactive")
      await new Promise<void>((resolve) => {
        this.rec.onstop = () => resolve();
        this.rec.stop();
      });
    this.release();
    this.queue(() =>
      window.api.recorder.systemChunk(
        new Uint8Array(0),
        this.first ? this.startedAt : undefined,
        endedAt,
      ),
    );
    await this.chain;
  }

  /** Stops without sending anything more (the take was thrown away). */
  cancel(): void {
    this.rec.ondataavailable = null;
    if (this.rec.state !== "inactive") this.rec.stop();
    this.release();
  }

  private release(): void {
    for (const t of this.stream.getTracks()) t.stop();
  }
}

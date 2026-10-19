import { type AudioAsset, parseAssetCatalog } from "../assets/model";
import type { AudioStatus } from "./model";
import { decodePcmAsset } from "./pcm";

export const MAX_AUDIO_VOICES = 32;
interface Voice {
  scope: readonly string[];
  volume: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  finish(stop: boolean): void;
}
/** One scene-owned bus/cache. Context creation is lazy and enable() must be
 * called by the host's user gesture. External contexts remain host-owned;
 * OfflineAudioContext is a real non-speaker rendering target, not a mock. */
export function createBrowserAudioMixer(
  input: readonly AudioAsset[],
  options: {
    context?: AudioContext | OfflineAudioContext;
    view?: Window & typeof globalThis;
    onError?: (error: Error) => void;
  } = {},
) {
  const assets = new Map(
      parseAssetCatalog(input).map((asset) => {
        if (asset.kind !== "audio") throw new Error("Mixer aceita somente recursos PCM.");
        return [asset.id, asset] as const;
      }),
    ),
    buffers = new Map<string, AudioBuffer>(),
    voices = new Map<number, Voice>(),
    observers = new Set<(status: AudioStatus) => void>(),
    envelope = new Map<number, { volume: number; end: number }>();
  let context: AudioContext | OfflineAudioContext | undefined = options.context,
    bus: GainNode | undefined,
    enabled = false,
    destroyed = false,
    generation = 0,
    serial = 0,
    stolen = 0,
    skippedLate = 0,
    master = 1,
    opening: Promise<void> | undefined,
    closing: Promise<void> | undefined;
  const live = () => {
    if (destroyed) throw new Error("Mixer encerrado.");
  };
  const report = (error: unknown) => {
    const reason = error instanceof Error ? error : new Error("Falha assíncrona de áudio.");
    if (options.onError) options.onError(reason);
    else
      queueMicrotask(() => {
        throw reason;
      });
  };
  const gain = (at = context?.currentTime ?? 0) => {
    if (!bus || !context) return;
    for (const [id, segment] of envelope) if (segment.end <= at) envelope.delete(id);
    const ends = new Map<number, number>();
    let sum = 0;
    for (const segment of envelope.values()) {
      sum += segment.volume;
      ends.set(segment.end, (ends.get(segment.end) ?? 0) + segment.volume);
    }
    // onended may be delivered while currentTime still exposes the start of
    // the final render quantum. The source's scheduled end, not JS delivery,
    // owns gain changes; otherwise the last samples can be amplified early.
    bus.gain.cancelScheduledValues(at);
    bus.gain.setValueAtTime(master / Math.max(1, sum), at);
    for (const [time, volume] of [...ends].sort((a, b) => a[0] - b[0])) {
      sum = Math.max(0, sum - volume);
      bus.gain.setValueAtTime(master / Math.max(1, sum), time);
    }
  };
  const stop = (scope: readonly string[] = []) => {
    if (scope.length > 8 || scope.some((id) => !/^node-[\w-]{1,100}$/.test(id)))
      throw new Error("Escopo de áudio inválido.");
    const errors: unknown[] = [];
    for (const voice of [...voices.values()])
      if (scope.every((id, index) => voice.scope[index] === id)) {
        try {
          voice.finish(true);
        } catch (error) {
          errors.push(error);
        }
      }
    if (errors.length) throw new AggregateError(errors, "Falha ao interromper vozes de áudio.");
  };
  const inspect = (): AudioStatus => ({
    enabled,
    activeVoices: voices.size,
    buffers: buffers.size,
    envelopeSegments: envelope.size,
    stolenVoices: stolen,
    skippedLate,
    masterVolume: master,
    contextState: context?.state ?? "not-created",
    destroyed,
  });
  const notify = () => {
    if (destroyed) return;
    const status = inspect(),
      errors: unknown[] = [];
    for (const observer of observers) {
      try {
        observer({ ...status });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Falha no observador de áudio.");
  };
  const stateChanged = () => {
    if (destroyed || !context) return;
    try {
      if (
        context.state === "closed" ||
        (!("startRendering" in context) && context.state !== "running" && enabled)
      ) {
        enabled = false;
        stop();
      }
      notify();
    } catch (error) {
      report(error);
    }
  };
  if (context) context.addEventListener("statechange", stateChanged);
  return {
    async enable() {
      live();
      if (enabled) return;
      if (opening) return opening;
      const request = generation;
      if (!context) {
        const view = options.view ?? window;
        if (!view.AudioContext) throw new Error("Web Audio indisponível nesta plataforma.");
        context = new view.AudioContext({ latencyHint: "interactive" });
        context.addEventListener("statechange", stateChanged);
      }
      const target = context;
      const task = async () => {
        if (!("startRendering" in target)) {
          const view = options.view ?? window;
          if (
            target.state !== "running" &&
            view.navigator.userActivation &&
            !view.navigator.userActivation.isActive
          )
            throw new Error("Ative o áudio a partir de um clique/tecla do usuário.");
          await target.resume();
        }
        if (destroyed || generation !== request)
          throw new DOMException("Ativação de áudio cancelada.", "AbortError");
        if (target.state === "closed") throw new Error("Contexto de áudio encerrado pelo host.");
        if (!("startRendering" in target) && target.state !== "running")
          throw new Error("O dispositivo de áudio não está ativo.");
        if (!bus) {
          bus = target.createGain();
          bus.connect(target.destination);
          gain();
        }
        enabled = true;
        notify();
      };
      const pending = task();
      opening = pending;
      try {
        await pending;
      } finally {
        if (opening === pending) opening = undefined;
      }
    },
    disable() {
      live();
      generation++;
      enabled = false;
      stop();
      notify();
    },
    stop(scope?: readonly string[]) {
      live();
      stop(scope);
    },
    setVolume(value: number) {
      live();
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error("Volume deve estar entre zero e um.");
      master = value;
      gain();
      notify();
    },
    play(
      assetId: string,
      volume = 1,
      offsetSeconds = 0,
      scope: readonly string[] = [],
    ): number | null {
      live();
      const asset = assets.get(assetId);
      if (
        !asset ||
        scope.length > 8 ||
        scope.some((id) => !/^node-[\w-]{1,100}$/.test(id)) ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 1 ||
        !Number.isFinite(offsetSeconds) ||
        offsetSeconds < 0
      )
        throw new Error("Recurso/volume/offset de áudio inválidos.");
      if (!enabled || volume === 0) return null;
      const target = context,
        output = bus;
      if (!target || !output) throw new Error("Áudio ativado sem contexto/bus.");
      if (offsetSeconds >= asset.frames / asset.sampleRate) {
        skippedLate++;
        notify();
        return null;
      }
      for (const [key, segment] of envelope)
        if (segment.end <= target.currentTime) envelope.delete(key);
      if (envelope.size >= 512) throw new Error("Orçamento de envelope de mixagem excedido.");
      let buffer = buffers.get(asset.id);
      if (!buffer) {
        const pcm = decodePcmAsset(asset);
        buffer = target.createBuffer(asset.channels, asset.frames, asset.sampleRate);
        for (const [channel, samples] of pcm.channels.entries())
          buffer.getChannelData(channel).set(samples);
        buffers.set(asset.id, buffer);
      }
      const source = target.createBufferSource(),
        control = target.createGain(),
        id = ++serial;
      source.buffer = buffer;
      control.gain.value = volume;
      const start = target.currentTime,
        end = start + buffer.duration - offsetSeconds;
      let finished = false,
        started = false;
      const voice: Voice = {
        scope: [...scope],
        volume,
        source,
        gain: control,
        finish(shouldStop) {
          if (finished) return;
          finished = true;
          source.onended = null;
          const existed = voices.delete(id);
          if (shouldStop) envelope.delete(id);
          const errors: unknown[] = [];
          for (const cleanup of [
            () => {
              if (shouldStop && started) source.stop(target.currentTime);
            },
            () => source.disconnect(),
            () => control.disconnect(),
            () => gain(),
            () => {
              if (existed) notify();
            },
          ]) {
            try {
              cleanup();
            } catch (error) {
              errors.push(error);
            }
          }
          if (errors.length) throw new AggregateError(errors, "Falha ao liberar voz de áudio.");
        },
      };
      source.onended = () => {
        try {
          voice.finish(false);
        } catch (error) {
          report(error);
        }
      };
      try {
        source.connect(control);
        control.connect(output);
        if (voices.size >= MAX_AUDIO_VOICES) {
          const oldest = voices.values().next().value;
          if (oldest) {
            oldest.finish(true);
            stolen++;
          }
        }
        voices.set(id, voice);
        envelope.set(id, { volume, end });
        gain(start);
        source.start(start, offsetSeconds);
        started = true;
        notify();
        return id;
      } catch (error) {
        try {
          voice.finish(true);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Falha ao iniciar/liberar voz de áudio.");
        }
        throw error;
      }
    },
    inspect,
    onChange(callback: (status: AudioStatus) => void) {
      live();
      if (observers.size >= 1000) throw new Error("Limite de observadores de áudio.");
      observers.add(callback);
      return () => {
        observers.delete(callback);
      };
    },
    destroy(): Promise<void> {
      if (closing) return closing;
      if (destroyed) return Promise.resolve();
      destroyed = true;
      observers.clear();
      generation++;
      enabled = false;
      const errors: unknown[] = [];
      for (const cleanup of [stop, () => bus?.disconnect()]) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      bus = undefined;
      buffers.clear();
      envelope.clear();
      assets.clear();
      const target = context;
      target?.removeEventListener("statechange", stateChanged);
      context = undefined;
      closing = (async () => {
        if (
          target &&
          !options.context &&
          !("startRendering" in target) &&
          target.state !== "closed"
        ) {
          try {
            await target.close();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Falha ao encerrar recursos de áudio.");
      })();
      return closing;
    },
  };
}

import { SYSTEM_AUDIO_CONSTRAINTS } from "@informach/edi-desktop/audio";
import { RecordingClock } from "./clock.mjs";

// One IPC packet at a time. The browser owns encoding buffers; admitted pending
// Blobs are capped independently, and are released only after durable ACK.
export const MAX_PENDING_BYTES = 32 * 1024 * 1024;
const BACKPRESSURE_BYTES = 4 * 1024 * 1024;
/**
 * `sound` (optional) gives the person's options and the mixer owned by the controller:
 * `{ options(): VideoOptions, mix(): AudioMix | null, release(): void }`. Without it the video is
 * recorded without sound, as before phase 5c.
 */
export function setupRecording(api, toast, sound = null) {
  let recording = null;
  let pendingStop = false;
  const phase = (value) => api.recordPhase(value).catch((error) => toast(error.message));
  function release(state) {
    clearInterval(state.timer);
    clearInterval(state.limit);
    state.clock.pause();
    state.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    // The mixed sound track belongs to the controller's mixer, which closes it.
    state.output?.getTracks().forEach((track) => {
      if (track !== state.soundTrack) track.stop();
    });
    state.video?.remove();
    sound?.release();
  }
  function stop(state) {
    state.stopRequested = true;
    state.clock.pause();
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
    release(state);
  }
  function settle(state, error) {
    for (const waiter of state.waiters.splice(0)) error ? waiter.reject(error) : waiter.resolve();
  }
  function drain(state) {
    if (state.draining) return state.draining;
    // Install ownership before the first async operation, and release it before
    // resolving the shared promise. Final events may arrive during phase IPC.
    state.draining = Promise.resolve().then(async () => {
      try {
        for (;;) {
          while (state.pending.length) {
            const part = state.pending[0];
            const end = Math.min(part.blob.size, part.offset + state.chunkBytes);
            const bytes = new Uint8Array(await part.blob.slice(part.offset, end).arrayBuffer());
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
            const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
              "",
            );
            const ack = await api.recordAppend({
              sessionId: state.sessionId,
              sequence: state.sequence,
              bytes,
              sha256,
              durationMs: part.durationMs,
            });
            if (ack.sequence !== state.sequence)
              throw new Error("Confirmação de gravação fora de ordem.");
            state.sequence++;
            part.offset = end;
            if (end === part.blob.size) {
              state.pendingBytes -= part.blob.size;
              state.pending.shift();
            }
          }
          // A pause the person asked for is theirs to end; only the disk's pause ends here.
          if (!state.stopRequested && !state.held && state.recorder.state === "paused") {
            state.recorder.resume();
            state.clock.resume();
            await api.recordPhase("recording");
            continue;
          }
          break;
        }
      } catch (error) {
        state.writeError = error;
        stop(state);
        await phase("failed");
        toast(
          `${error.message} Os trechos confirmados estão no disco; clique em Parar e salvar para repetir a parte pendente.`,
        );
        throw error;
      } finally {
        state.draining = null;
      }
    });
    return state.draining;
  }
  async function persist(state) {
    if (state.saving) return state.saving;
    state.saving = (async () => {
      if (state.overflow) throw state.overflow;
      await api.recordPhase("finalizing");
      await drain(state);
      if (
        !state.finalChunksReady ||
        !state.stopRequested ||
        state.pending.length ||
        state.pendingBytes ||
        state.sequence !== state.admittedParts
      )
        throw new Error("Aguarde a confirmação de todos os trechos finais antes de salvar.");
      await api.recordSave({ sessionId: state.sessionId, durationMs: state.clock.elapsed() });
      if (recording === state) recording = null;
      toast("Gravação salva na biblioteca.");
    })();
    try {
      await state.saving;
    } catch (error) {
      await phase("failed");
      throw error;
    } finally {
      state.saving = null;
    }
  }
  function finish() {
    pendingStop = true;
    const state = recording;
    if (!state) return Promise.resolve();
    // Failure UI can arrive before the failed drain releases its promise.
    // An explicit retry owns a new drain only after that failure has settled.
    if (state.writeError && state.draining) {
      const previousError = state.writeError;
      return state.draining
        .catch((error) => {
          if (error !== previousError) throw error;
        })
        .then(() => {
          if (recording !== state)
            throw new Error("A sessão mudou durante a repetição da gravação.");
          return finish();
        });
    }
    state.writeError = null;
    if (state.finalChunksReady) return persist(state);
    const completion = new Promise((resolve, reject) => state.waiters.push({ resolve, reject }));
    stop(state);
    return completion;
  }
  window.addEventListener("edicaptura-record", async ({ detail }) => {
    if (recording) return;
    const { rect, display, sessionId, chunkBytes, maxParts, maxDurationMs, maxBytes } = detail;
    const state = {
      pending: [],
      pendingBytes: 0,
      totalBytes: 0,
      admittedParts: 0,
      sequence: 0,
      waiters: [],
      sessionId,
      chunkBytes,
      clock: new RecordingClock(),
    };
    recording = state;
    try {
      if (pendingStop) throw new Error("Gravação encerrada antes do primeiro quadro.");
      if (
        !sessionId ||
        !Number.isInteger(chunkBytes) ||
        chunkBytes < 1 ||
        chunkBytes > 1024 * 1024 ||
        !Number.isInteger(maxParts) ||
        maxParts < 100
      )
        throw new Error("Sessão de gravação inválida.");
      const options = sound?.options();
      const mix = sound?.mix() ?? null;
      const system = !!(options?.system.enabled && mix);
      state.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: system ? SYSTEM_AUDIO_CONSTRAINTS : false,
      });
      // Permission completion never activates a session cancelled in the meantime.
      if (pendingStop || state.stopRequested || recording !== state)
        throw new Error("Gravação interrompida durante a permissão.");
      const video = document.createElement("video");
      state.video = video;
      video.muted = true;
      video.srcObject = state.stream;
      await video.play();
      if (pendingStop || state.stopRequested)
        throw new Error("Gravação interrompida antes do primeiro quadro.");
      const sx = video.videoWidth / display.width,
        sy = video.videoHeight / display.height;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round((rect.width * sx) / 2) * 2);
      canvas.height = Math.max(2, Math.round((rect.height * sy) / 2) * 2);
      const context = canvas.getContext("2d");
      const draw = () =>
        context.drawImage(
          video,
          rect.x * sx,
          rect.y * sy,
          rect.width * sx,
          rect.height * sy,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      draw();
      state.timer = setInterval(draw, 1000 / 30);
      state.output = canvas.captureStream(30);
      if (system) {
        if (state.stream.getAudioTracks().length) {
          const added = mix.addSystem(state.stream, options.system);
          if (!added.excludesApp)
            toast("Este Windows não separa o som do próprio app; o áudio do PC pode incluí-lo.");
        } else toast("O Windows não entregou o áudio do PC; gravando sem ele.");
      }
      const soundTrack = mix?.track() ?? null;
      state.soundTrack = soundTrack;
      if (soundTrack) state.output.addTrack(soundTrack);
      const types = soundTrack
        ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Este sistema não suporta gravação WebM.");
      const recorder = new MediaRecorder(state.output, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
        ...(soundTrack ? { audioBitsPerSecond: 160_000 } : {}),
      });
      state.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const packets = Math.ceil(event.data.size / chunkBytes);
        if (
          state.pendingBytes + event.data.size > MAX_PENDING_BYTES ||
          state.admittedParts + packets > maxParts
        ) {
          state.overflow = new Error(
            "O codificador excedeu o limite de 32 MiB pendentes ou de partes da sessão. Gravação interrompida; recupere os trechos já confirmados ao reabrir o app. A parte excedente não foi salva.",
          );
          stop(state);
          toast(state.overflow.message);
          return;
        }
        state.pending.push({ blob: event.data, offset: 0, durationMs: state.clock.elapsed() });
        state.pendingBytes += event.data.size;
        state.totalBytes += event.data.size;
        state.admittedParts += packets;
        if (state.pendingBytes >= BACKPRESSURE_BYTES && recorder.state === "recording") {
          recorder.pause();
          state.clock.pause();
          void phase("paused");
        }
        // Leave room for both the current encoder burst and the final stop event.
        if (
          state.totalBytes + MAX_PENDING_BYTES >= maxBytes ||
          state.admittedParts >= maxParts - 2 * Math.ceil(MAX_PENDING_BYTES / chunkBytes) - 2
        )
          stop(state);
        if (!state.writeError)
          void drain(state).catch(() => {
            /* drain retains the pending bytes and exposes retry UI. */
          });
      };
      recorder.onerror = (event) => {
        toast(event.error?.message || "Falha no codificador; preservando os trechos.");
        stop(state);
      };
      recorder.onstop = async () => {
        state.finalChunksReady = true;
        release(state);
        if (state.writeError || state.overflow) {
          settle(state, state.writeError || state.overflow);
          return;
        }
        try {
          await persist(state);
          settle(state);
        } catch (error) {
          toast(error.message);
          settle(state, error);
        }
      };
      state.stream.getVideoTracks()[0].onended = () => stop(state);
      await api.recordReady();
      if (pendingStop || state.stopRequested)
        throw new Error("Gravação interrompida antes do primeiro quadro.");
      recorder.start(250);
      state.clock.resume();
      state.limit = setInterval(() => {
        if (state.clock.elapsed() >= maxDurationMs) stop(state);
      }, 250);
      toast(`Gravando · até ${Math.floor(maxDurationMs / 60000)} min, conforme espaço em disco`);
    } catch (error) {
      release(state);
      recording = null;
      settle(state, error);
      await api.recordFailed(error.message);
    }
  });
  /** The person's pause: the recorder stops taking frames and sound, the clock stops. */
  function pause() {
    const state = recording;
    // Before the first frame (recorder still inactive) there is nothing to pause yet.
    if (
      !state?.recorder ||
      state.stopRequested ||
      state.held ||
      state.recorder.state === "inactive"
    )
      return false;
    state.held = true;
    if (state.recorder.state === "recording") {
      state.recorder.pause();
      state.clock.pause();
    }
    void phase("held");
    return true;
  }
  /** Ends the person's pause; while the disk still holds the recorder, its drain resumes it. */
  function resume() {
    const state = recording;
    if (!state?.recorder || state.stopRequested || !state.held) return false;
    state.held = false;
    if (state.recorder.state !== "paused") return true;
    // The drain only resumes a recorder that is still paused, so resuming here never doubles.
    if (state.pendingBytes < BACKPRESSURE_BYTES && !state.writeError) {
      state.recorder.resume();
      state.clock.resume();
      void phase("recording");
    } else void phase("paused");
    return true;
  }
  const toggle = () => (recording?.held ? resume() : pause());
  api.onStop(() => {
    void finish().catch((error) => toast(error.message));
  });
  api.onTogglePause?.(() => {
    toggle();
  });
  return { finish, pause, resume, toggle, held: () => !!recording?.held };
}

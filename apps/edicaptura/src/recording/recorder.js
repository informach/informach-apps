export function setupRecording(api, toast) {
  let recording = null;
  let pendingStop = false;
  async function persist(state) {
    if (state.saving) return state.saving;
    state.saving = (async () => {
      const blob = new Blob(state.chunks, { type: "video/webm" });
      if (!blob.size) throw new Error("A gravação não gerou quadros.");
      await api.recordSave(new Uint8Array(await blob.arrayBuffer()));
      if (recording === state) recording = null;
      toast("Gravação salva na biblioteca.");
    })();
    try {
      await state.saving;
    } finally {
      state.saving = null;
    }
  }
  function finish() {
    pendingStop = true;
    const state = recording;
    if (!state) return Promise.resolve();
    // stop() makes MediaRecorder inactive before its final dataavailable/onstop
    // events. Only onstop confirms that every chunk is available for persistence.
    if (state.finalChunksReady) return persist(state);
    state.stopRequested = true;
    const completion = new Promise((resolve, reject) => state.waiters.push({ resolve, reject }));
    if (state.recorder?.state === "recording") state.recorder.stop();
    return completion;
  }
  function settle(state, error) {
    for (const waiter of state.waiters.splice(0)) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }
  function release(state) {
    clearInterval(state.timer);
    clearTimeout(state.limit);
    state.stream?.getTracks().forEach((t) => {
      t.stop();
    });
    state.output?.getTracks().forEach((t) => {
      t.stop();
    });
    state.video?.remove();
  }
  window.addEventListener("edicaptura-record", async ({ detail: { rect, display } }) => {
    if (recording) return;
    const state = { chunks: [], bytes: 0, waiters: [] };
    recording = state;
    try {
      if (pendingStop) throw new Error("Gravação encerrada antes do primeiro quadro.");
      toast("Iniciando gravação…");
      state.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const video = document.createElement("video");
      state.video = video;
      video.muted = true;
      video.srcObject = state.stream;
      await video.play();
      const sx = video.videoWidth / display.width,
        sy = video.videoHeight / display.height;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round((rect.width * sx) / 2) * 2);
      canvas.height = Math.max(2, Math.round((rect.height * sy) / 2) * 2);
      const ctx = canvas.getContext("2d");
      const draw = () =>
        ctx.drawImage(
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
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      if (!mimeType) throw new Error("Este sistema não suporta gravação WebM.");
      const recorder = new MediaRecorder(state.output, { mimeType, videoBitsPerSecond: 6_000_000 });
      state.recorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          state.chunks.push(e.data);
          state.bytes += e.data.size;
          if (state.bytes > 300_000_000 && recorder.state === "recording") recorder.stop();
        }
      };
      recorder.onerror = async (e) => {
        toast(e.error?.message || "Falha ao gravar vídeo. Preservando os quadros disponíveis.");
      };
      recorder.onstop = async () => {
        state.finalChunksReady = true;
        release(state);
        if (state.failed) return;
        try {
          await persist(state);
          settle(state);
        } catch (e) {
          // Keep the bytes in memory so recovery can retry a failed disk write.
          toast(e.message);
          settle(state, e);
        }
      };
      state.stream.getVideoTracks()[0].onended = () => {
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.start(1000);
      if (state.stopRequested) recorder.stop();
      toast("Gravando região");
      state.limit = setTimeout(
        () => {
          if (recorder.state === "recording") recorder.stop();
        },
        5 * 60 * 1000,
      );
      await api.recordReady();
    } catch (e) {
      state.failed = true;
      release(state);
      recording = null;
      settle(state, e);
      await api.recordFailed(e.message);
    }
  });
  api.onStop(() => {
    void finish().catch((error) => toast(error.message));
  });
  return finish;
}

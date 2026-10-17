export function setupRecording(api, toast) {
  let recording = null;
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
    const state = { chunks: [], bytes: 0 };
    recording = state;
    try {
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
        state.failed = true;
        release(state);
        recording = null;
        await api.recordFailed(e.error?.message || "Falha ao gravar vídeo.");
      };
      recorder.onstop = async () => {
        release(state);
        recording = null;
        if (state.failed) return;
        try {
          const blob = new Blob(state.chunks, { type: "video/webm" });
          if (!blob.size) throw new Error("A gravação não gerou quadros.");
          await api.recordSave(new Uint8Array(await blob.arrayBuffer()));
          toast("Gravação salva na biblioteca.");
        } catch (e) {
          await api.recordFailed(e.message);
        }
      };
      state.stream.getVideoTracks()[0].onended = () => {
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.start(1000);
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
      await api.recordFailed(e.message);
    }
  });
  api.onStop(() => {
    if (recording?.recorder?.state === "recording") recording.recorder.stop();
  });
}

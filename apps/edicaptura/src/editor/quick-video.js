import "./quick-video.css";
import { gifEstimate, validateVideoRecipe } from "../domain/quick-video.ts";

export function mountQuickVideo({ api, current, changed, persist, toast, refreshed }) {
  const panel = document.createElement("section");
  panel.className = "quick-video";
  panel.hidden = true;
  panel.innerHTML = `<h2>Vídeo rápido</h2><p id="video-metadata" role="status"></p><button type="button" id="video-probe">Ler metadados novamente</button><fieldset id="video-edit"><legend>Aparar início e fim</legend><label>Início (s)<input id="video-start" type="number" min="0" step="0.1"></label><label>Fim (s)<input id="video-end" type="number" min="0.1" step="0.1"></label><button type="button" id="video-trim">Aplicar intervalo</button><button type="button" id="video-undo">Desfazer intervalo</button><button type="button" id="video-redo">Refazer intervalo</button><button type="button" id="video-reset">Usar original inteiro</button><p>O original é preservado. Reprodução e saídas usam o intervalo aplicado.</p><label>Largura máxima (px)<input id="video-width" type="number" min="2" max="1920" step="2" value="1280"></label><label>MP4<select id="video-quality"><option value="standard">Qualidade padrão</option><option value="compact">Arquivo mais compacto</option></select></label><button type="button" id="video-mp4">Salvar MP4</button><button type="button" id="video-frame">Salvar quadro atual em PNG</button><label>GIF — quadros por segundo<input id="video-fps" type="number" min="5" max="20" value="12"></label><p>GIF: até 30 segundos e 960 px de largura; sem áudio.</p><output id="video-estimate"></output><button type="button" id="video-gif-preview">Prévia real do GIF</button><button type="button" id="video-gif">Salvar GIF</button><img id="video-gif-image" alt="Prévia do intervalo como GIF" hidden></fieldset><progress id="video-progress" max="1" value="0" hidden></progress><button type="button" id="video-cancel" hidden>Cancelar processamento</button><p>Revise dados sensíveis antes de compartilhar. Este vídeo não aplica ocultação por intervalo.</p>`;
  document.querySelector(".desk").append(panel);
  const $ = (id) => panel.querySelector(`#${id}`),
    video = document.getElementById("video-preview");
  let active = null,
    past = [],
    future = [],
    job = null,
    visible = false,
    previewBytes = null;
  const safe = (action) => async () => {
    try {
      await action();
    } catch (error) {
      toast(error.message, true);
    }
  };
  const range = () => validateVideoRecipe(active.videoRecipe, active.media.durationSeconds);
  function render() {
    panel.hidden = !visible || active?.kind !== "video";
    if (panel.hidden) return;
    const ready = active.media?.status === "ready";
    $("video-metadata").textContent = ready
      ? `${active.media.width} × ${active.media.height} px · ${active.media.durationSeconds.toFixed(2)} s · ${active.media.hasAudio ? "com áudio" : "sem áudio"}`
      : active.media?.status === "failed"
        ? `Metadados indisponíveis: ${active.media.error}`
        : "Metadados pendentes — lendo vídeo…";
    $("video-edit").disabled = !ready || !!job;
    $("video-probe").disabled = !!job;
    $("video-progress").hidden = !job;
    $("video-cancel").hidden = !job;
    $("video-undo").disabled = !past.length;
    $("video-redo").disabled = !future.length;
    if (ready) {
      const recipe = range();
      $("video-start").value = recipe.start;
      $("video-end").value = recipe.end;
      $("video-start").max = $("video-end").max = active.media.durationSeconds;
      estimate();
    }
  }
  function estimate() {
    if (active?.media?.status !== "ready") return;
    const width = Math.max(
      2,
      Math.floor(Math.min(Number($("video-width").value), active.media.width, 960) / 2) * 2,
    );
    const height = Math.max(
      2,
      Math.round((width * active.media.height) / active.media.width / 2) * 2,
    );
    $("video-estimate").textContent =
      previewBytes !== null
        ? `GIF gerado: ${(previewBytes / 1_000_000).toFixed(2)} MB`
        : `Estimativa sem compressão: ${(gifEstimate(range(), width, height, Number($("video-fps").value)) / 1_000_000).toFixed(1)} MB. O tamanho real aparece após gerar.`;
  }
  function apply(recipe, history = true) {
    if (history) {
      past.push(structuredClone(active.videoRecipe));
      if (past.length > 100) past.shift();
      future = [];
    }
    active.videoRecipe = recipe;
    previewBytes = null;
    $("video-gif-image").hidden = true;
    $("video-gif-image").removeAttribute("src");
    video.pause();
    video.currentTime = range().start;
    changed();
    render();
  }
  $("video-trim").onclick = safe(() =>
    apply(
      validateVideoRecipe(
        { version: 1, start: Number($("video-start").value), end: Number($("video-end").value) },
        active.media.durationSeconds,
      ),
    ),
  );
  $("video-reset").onclick = safe(() => apply(null));
  $("video-undo").onclick = safe(() => {
    if (!past.length) return;
    future.push(structuredClone(active.videoRecipe));
    apply(past.pop(), false);
  });
  $("video-redo").onclick = safe(() => {
    if (!future.length) return;
    past.push(structuredClone(active.videoRecipe));
    apply(future.pop(), false);
  });
  for (const name of ["video-width", "video-fps"])
    $(name).oninput = () => {
      previewBytes = null;
      $("video-gif-image").hidden = true;
      estimate();
    };
  function clamp() {
    if (active?.media?.status !== "ready") return;
    const recipe = range();
    if (video.currentTime < recipe.start) video.currentTime = recipe.start;
    if (video.currentTime >= recipe.end) {
      video.pause();
      video.currentTime = recipe.start;
    }
  }
  let frameCallback;
  const watchFrame = () => {
    frameCallback = video.requestVideoFrameCallback(() => {
      clamp();
      if (!video.paused) watchFrame();
    });
  };
  video.addEventListener("play", () => {
    if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
    watchFrame();
  });
  video.addEventListener("pause", () => {
    if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
  });
  video.addEventListener("loadedmetadata", clamp);
  video.addEventListener("timeupdate", clamp);
  video.addEventListener("play", clamp);
  video.addEventListener("seeking", clamp);
  async function inspect() {
    const document = active;
    if (document?.kind !== "video") return;
    try {
      const result = await api.videoInspect(document.id);
      if (active !== document || current() !== document) return;
      document.media = result.media;
      document.preview = result.preview;
      render();
      await refreshed();
    } catch (error) {
      if (active === document) {
        document.media = { status: "failed", error: error.message };
        render();
      }
      throw error;
    }
  }
  $("video-probe").onclick = safe(inspect);
  async function output(format, preview = false) {
    const document = active;
    if (job || document !== current()) return;
    await persist();
    if (document !== current() || document !== active) return;
    job = crypto.randomUUID();
    render();
    $("video-progress").value = 0;
    try {
      const result = await api.videoOutput({
        id: document.id,
        jobId: job,
        recipe: structuredClone(document.videoRecipe),
        format,
        preview,
        width: Number($("video-width").value),
        fps: Number($("video-fps").value),
        quality: $("video-quality").value,
        at: video.currentTime,
      });
      if (!result || document !== active || document !== current()) return;
      if (preview) {
        previewBytes = result.bytes;
        $("video-gif-image").src = result.url;
        $("video-gif-image").hidden = false;
        $("video-estimate").textContent = `GIF gerado: ${(result.bytes / 1_000_000).toFixed(2)} MB`;
      } else toast("Arquivo salvo. Use Copiar arquivo exportado para compartilhar.");
    } finally {
      job = null;
      render();
    }
  }
  for (const format of ["mp4", "gif"]) $(`video-${format}`).onclick = safe(() => output(format));
  $("video-frame").onclick = safe(() => output("png"));
  $("video-gif-preview").onclick = safe(() => output("gif", true));
  $("video-cancel").onclick = safe(() => api.videoCancel(job));
  api.onVideoProgress((event) => {
    if (event.jobId === job) $("video-progress").value = event.ratio;
  });
  return {
    activate(document) {
      active = document;
      previewBytes = null;
      past = [];
      future = [];
      $("video-gif-image").hidden = true;
      $("video-gif-image").removeAttribute("src");
      render();
      if (document?.kind === "video") void inspect().catch((error) => toast(error.message, true));
    },
    show(value) {
      visible = value;
      render();
    },
    export: () => safe(() => output("mp4"))(),
  };
}

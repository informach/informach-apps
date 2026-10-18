import { hydrateIcons } from "../shared/icons.js";
import { RecordingClock } from "./clock.mjs";
import { setupRecording } from "./recorder.js";
import { setupScrollControls } from "./scroll-controls.js";

hydrateIcons();
const $ = (id) => document.getElementById(id),
  api = window.edi;
let state = await api.controlState();
const scrollControls = setupScrollControls(api, error);
const source = document.createElement("div");
source.className = "capture-source";
source.textContent =
  state?.mode === "photo"
    ? state.cancelShortcut
      ? "Prepare o menu ou tooltip · Ctrl+Shift+Esc cancela"
      : "Use Cancelar para interromper a captura"
    : state?.mode === "photo"
      ? state.cancelShortcut
        ? "Prepare o menu ou tooltip · Ctrl+Shift+Esc cancela"
        : "Use Cancelar para interromper a captura"
      : state
        ? `${state.monitor} · ${state.width} × ${state.height} px`
        : "";
source.title = source.textContent;
document.querySelector("header").after(source);
let acknowledged = 0;
const clock = new RecordingClock();
const shutter = new Audio("./shutter.wav");
shutter.volume = 0.5;
function confirmCapture() {
  if (state?.mode !== "scroll") return;
  $("capture-feedback").hidden = false;
  $("capture-feedback").textContent = state.feedback || "Foto capturada. Pode continuar.";
  if (state.count > acknowledged) {
    acknowledged = state.count;
    shutter.currentTime = 0;
    shutter.play().catch(() => {
      $("capture-feedback").textContent += " (Som indisponível.)";
    });
    $("capture-feedback").classList.remove("confirmed");
    void $("capture-feedback").offsetWidth;
    $("capture-feedback").classList.add("confirmed");
  }
}
function render() {
  confirmCapture();
  if (!state) return;
  if (state.mode === "photo") {
    $("title").textContent =
      state.phase === "composing" ? "Compondo a imagem…" : `Captura em ${state.remaining ?? 0} s`;
    $("timer").textContent = "";
    $("scroll-controls").hidden = true;
    $("finish").hidden = true;
    $("stop-hint").hidden = true;
    $("cancel").hidden = false;
    $("cancel").textContent = "Cancelar";
    return;
  }
  if (state.mode === "photo") {
    $("title").textContent =
      state.phase === "composing" ? "Compondo a imagem…" : `Captura em ${state.remaining ?? 0} s`;
    $("timer").textContent = "";
    $("scroll-controls").hidden = true;
    $("finish").hidden = true;
    $("stop-hint").hidden = true;
    $("cancel").hidden = false;
    $("cancel").textContent = "Cancelar";
    return;
  }
  if (state.mode === "video" && state.phase === "recording") clock.resume();
  else clock.pause();
  renderClock();
  $("title").textContent =
    state.mode === "video"
      ? state.phase === "recording"
        ? "Gravando região"
        : state.phase === "finalizing"
          ? "Finalizando e salvando…"
          : state.phase === "failed"
            ? "Não salvo — clique em Parar e salvar para tentar novamente"
            : state.phase === "paused"
              ? "Aguardando confirmação do disco…"
              : "Preparando gravação…"
      : "Captura com rolagem";
  $("scroll-controls").hidden = state.mode !== "scroll";
  $("cancel").hidden = state.mode !== "scroll";
  $("stop-hint").hidden = state.mode !== "video";
  $("finish-text").textContent = state.mode === "video" ? "Parar e salvar" : "Pronto · unir imagem";
  $("count").textContent = state.count + " trecho" + (state.count === 1 ? "" : "s");
  $("overlap").max = (state.axis === "horizontal" ? state.width : state.height) - 1;
  if (state.mode === "scroll") scrollControls.render(state);
}
function error(e) {
  $("error").textContent = e.message || e;
  $("error").hidden = !$("error").textContent;
}
function renderClock() {
  if (state?.mode === "photo") return;
  if (state?.mode === "photo") return;
  const s = Math.floor(clock.elapsed() / 1000);
  $("timer").textContent =
    String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
render();
setInterval(renderClock, 1000);
$("next").onclick = async () => {
  $("next").disabled = true;
  try {
    await api.nextSegment($("overlap").value.trim() === "" ? null : Number($("overlap").value));
  } catch (e) {
    error(e);
  } finally {
    $("next").disabled = false;
  }
};
$("finish").onclick = async () => {
  try {
    $("finish").disabled = true;
    await api.finish(null);
  } catch (e) {
    error(e);
  } finally {
    $("finish").disabled = false;
  }
};
$("cancel").onclick = () => api.cancel();
api.onControl((value) => {
  state = value;
  render();
});
api.onControlError(error);
api.onRecordProgress((value) => {
  $("stop-hint").textContent = `${(value.bytes / 1024 / 1024).toFixed(1)} MB no disco`;
});
const finishRecording = setupRecording(api, (message) => {
  $("title").textContent = message;
});
window.ediSuite.onRecovery(() => (state?.mode === "scroll" ? api.finish(null) : finishRecording()));
if (state?.mode === "video") {
  try {
    await api.beginRecording();
  } catch (e) {
    error(e);
    await api.recordFailed(e.message);
  }
}

import { hydrateIcons } from "../shared/icons.js";
import { setupRecording } from "./recorder.js";

hydrateIcons();
const $ = (id) => document.getElementById(id),
  api = window.edi;
let state = await api.controlState();
const source = document.createElement("div");
source.className = "capture-source";
source.textContent = state ? `${state.monitor} · ${state.width} × ${state.height} px` : "";
source.title = source.textContent;
document.querySelector("header").after(source);
let acknowledged = 0;
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
  $("title").textContent = state.mode === "video" ? "Gravando região" : "Captura com rolagem";
  $("scroll-controls").hidden = state.mode !== "scroll";
  $("cancel").hidden = state.mode !== "scroll";
  $("stop-hint").hidden = state.mode !== "video";
  $("finish-text").textContent = state.mode === "video" ? "Parar e salvar" : "Pronto · unir imagem";
  $("count").textContent = state.count + " trecho" + (state.count === 1 ? "" : "s");
  $("overlap").max = state.height - 1;
}
function error(e) {
  $("error").textContent = e.message || e;
  $("error").hidden = !$("error").textContent;
}
render();
const started = Date.now();
setInterval(() => {
  const s = Math.floor((Date.now() - started) / 1000);
  $("timer").textContent =
    String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}, 1000);
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
    await api.finish($("overlap").value.trim() === "" ? null : Number($("overlap").value));
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
setupRecording(api, (message) => {
  $("title").textContent = message;
});
if (state?.mode === "video") {
  try {
    await api.beginRecording();
  } catch (e) {
    error(e);
    await api.recordFailed(e.message);
  }
}

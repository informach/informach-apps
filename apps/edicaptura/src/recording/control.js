import { hydrateIcons } from "../shared/icons.js";
import { AudioMix } from "./audio-mix.js";
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
  if (state.mode === "video") {
    $("pause").hidden = !["recording", "paused", "held"].includes(state.phase);
    $("pause").textContent = state.phase === "held" ? "Retomar" : "Pausar";
    $("pause").setAttribute("aria-pressed", String(state.phase === "held"));
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
              : state.phase === "held"
                ? "Pausado · Ctrl+Shift+F9 retoma"
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
let options = null,
  mix = null,
  recordingStarted = false;
const sound = {
  options: () => options,
  mix: () => mix,
  release() {
    const closing = mix;
    mix = null;
    void closing?.close();
  },
};
const recorder = setupRecording(
  api,
  (message) => {
    $("title").textContent = message;
  },
  sound,
);
window.ediSuite.onRecovery(() => (state?.mode === "scroll" ? api.finish(null) : recorder.finish()));
$("pause").onclick = () => recorder.toggle();

const METER_FLOOR = -60;
const SOURCES = [
  { id: "mic", key: "microphone", name: "Microfone" },
  { id: "system", key: "system", name: "Áudio do PC" },
];
// Each source line shows the device message (which microphone, fallback, failure) and, after
// it, what the meter finds; the meter never erases the device message.
const notes = { mic: { device: "", level: "" }, system: { device: "", level: "" } };
function showNote(id) {
  $(`${id}-status`).textContent = [notes[id].device, notes[id].level].filter(Boolean).join(" · ");
}
function deviceNote(id, text) {
  notes[id].device = text;
  showNote(id);
}
function showLevels(levels) {
  for (const { id, key, name } of SOURCES) {
    const level = levels[key];
    $(`${id}-level`).value = level ? Math.max(METER_FLOOR, level.db) : METER_FLOOR;
    const note = !level
      ? ""
      : level.clipping
        ? `${name} alto demais: baixe o volume.`
        : key === "microphone" && level.silentFor >= 10
          ? "Microfone em silêncio há mais de 10 s."
          : "";
    if (note === notes[id].level) continue;
    notes[id].level = note;
    showNote(id);
  }
}
function ensureMix() {
  if (!mix) {
    mix = new AudioMix();
    mix.watch(showLevels);
  }
  return mix;
}
async function saveOptions() {
  try {
    options = await api.recordOptionsSave(options);
  } catch (e) {
    error(e);
  }
}
/** Lists the microphones; returns true when the saved one is gone and the default is used. */
async function listMicrophones() {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "audioinput" && device.deviceId !== "default",
  );
  const select = $("mic-device");
  select.replaceChildren(new Option("Padrão do Windows", ""));
  for (const device of devices)
    select.append(new Option(device.label || "Microfone sem nome", device.deviceId));
  const missing =
    !!options.microphone.deviceId &&
    !devices.some((device) => device.deviceId === options.microphone.deviceId);
  if (missing) options.microphone.deviceId = "";
  select.value = options.microphone.deviceId;
  return missing;
}
async function openMicrophone() {
  mix?.remove("microphone");
  if (!options.microphone.enabled) return;
  try {
    let opened,
      fellBack = false;
    try {
      opened = await ensureMix().addMicrophone(options.microphone);
    } catch (error) {
      // The saved microphone is not connected: fall back to the Windows default.
      if (
        !options.microphone.deviceId ||
        !["OverconstrainedError", "NotFoundError"].includes(error?.name)
      )
        throw error;
      options.microphone.deviceId = "";
      fellBack = true;
      opened = await ensureMix().addMicrophone(options.microphone);
    }
    await mix.start();
    if (await listMicrophones()) fellBack = true;
    if (fellBack) {
      // Saved, so the next recording starts on the default without the same failure.
      await saveOptions();
      deviceNote("mic", "O microfone escolhido não está conectado; usando o padrão do Windows.");
    } else deviceNote("mic", opened.label ? `Ouvindo: ${opened.label}` : "");
  } catch (e) {
    deviceNote("mic", `Microfone indisponível: ${e.message} A gravação segue sem ele.`);
  }
}
function renderSound() {
  for (const { id, key } of SOURCES) {
    const source = options[key];
    $(`${id}-enabled`).checked = source.enabled;
    $(`${id}-enabled`).disabled = recordingStarted;
    $(`${id}-volume`).value = String(source.volume);
    $(`${id}-volume`).disabled = !source.enabled;
    $(`${id}-mute`).disabled = !source.enabled;
    $(`${id}-mute`).setAttribute("aria-pressed", String(source.muted));
  }
  $("mic-device").disabled = recordingStarted || !options.microphone.enabled;
  $("countdown").value = String(options.countdown);
  $("start-row").hidden = recordingStarted;
}
function bindSound() {
  for (const { id, key } of SOURCES) {
    $(`${id}-enabled`).onchange = async () => {
      options[key].enabled = $(`${id}-enabled`).checked;
      renderSound();
      await saveOptions();
      if (key === "microphone") await openMicrophone();
      else if (options.system.enabled) ensureMix();
    };
    $(`${id}-volume`).oninput = () => {
      options[key].volume = Number($(`${id}-volume`).value);
      mix?.set(key, { volume: options[key].volume });
    };
    $(`${id}-volume`).onchange = () => {
      if (!recordingStarted) void saveOptions();
    };
    $(`${id}-mute`).onclick = () => {
      options[key].muted = !options[key].muted;
      mix?.set(key, { muted: options[key].muted });
      renderSound();
      if (!recordingStarted) void saveOptions();
    };
  }
  $("mic-device").onchange = async () => {
    options.microphone.deviceId = $("mic-device").value;
    await saveOptions();
    await openMicrophone();
  };
}
/** Counts down, unless the person starts now or cancels; resolves true to record. */
function countdown() {
  return new Promise((resolve) => {
    let left = 0,
      timer = null;
    const done = (record) => {
      clearInterval(timer);
      $("countdown-status").textContent = "";
      resolve(record);
    };
    const tick = () => {
      if (left <= 0) return done(true);
      $("countdown-status").textContent = String(left);
      left--;
    };
    const restart = () => {
      clearInterval(timer);
      left = options.countdown;
      tick();
      if (left >= 0 && options.countdown > 0) timer = setInterval(tick, 1000);
    };
    $("countdown").onchange = async () => {
      options.countdown = Number($("countdown").value);
      await saveOptions();
      restart();
    };
    $("start-now").onclick = () => done(true);
    $("cancel-start").onclick = () => done(false);
    restart();
  });
}
async function prepareVideo() {
  const { error: problem, ...saved } = await api.recordOptions();
  options = saved;
  if (problem) error(problem);
  $("sound").hidden = false;
  renderSound();
  bindSound();
  if (options.microphone.enabled) await openMicrophone();
  else if (options.system.enabled) ensureMix();
  if (!(await countdown())) {
    sound.release();
    await api.cancel();
    return false;
  }
  recordingStarted = true;
  renderSound();
  if (mix && !(await mix.start()))
    error("O som não iniciou neste computador; a gravação segue só com a imagem.");
  return true;
}
if (state?.mode === "video") {
  try {
    if (await prepareVideo()) await api.beginRecording();
  } catch (e) {
    error(e);
    sound.release();
    await api.recordFailed(e.message);
  }
}

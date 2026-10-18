import { xmlEscape } from "../../shared/scene.js";
import { activeClip } from "./clipPose";
import { activeTimelineClip } from "./timelineState";

export { activeClip, objectPose } from "./clipPose";

export function clipTimeline(state, button) {
  const clip = activeTimelineClip(state);
  if (!clip) throw new Error("Selecione uma prancheta/animação para abrir a timeline.");
  return `<section class="timeline"><div class="timeline-header"><select id="clip-select" aria-label="Animação por objeto">${state.motion.animations.map((item) => `<option value="${item.id}" ${item.id === clip.id ? "selected" : ""}>${xmlEscape(item.name)}</option>`).join("")}</select>${button("clip-settings", "Configurar")}${button("clip-duplicate", "Duplicar")}${button("clip-new", "+ Animação")}<select id="loop-mode" aria-label="Modo de reprodução">${[
    ["loop", "Loop"],
    ["ping-pong", "Ping-pong"],
    ["once", "Uma vez"],
  ]
    .map(
      ([id, label]) =>
        `<option value="${id}" ${clip.mode === id ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select><div class="transport">${button("start", "|◁")}${button("previous", "‹")}${button("play", state.playing ? "Ⅱ" : "▶", "play")}${button("next", "›")}${button("end", "▷|")}</div><span id="timecode" class="timecode"></span><span class="push"></span>${button("add-key", "◇ Gravar pose")}${button("auto", "◆ Autochave", state.auto ? "selected" : "")}${button("edit-key", "Editar chave")}${button("retime-keys", "Mover / copiar")}${button("onion", "Onion skin", state.onion ? "selected" : "")}<label class="work-range-label">Área <input data-work-range="start" aria-label="Início da área de trabalho" type="number" min="0" max="${clip.frames}" value="${state.workRange?.clipId === clip.id ? state.workRange.start : 0}"> — <input data-work-range="end" aria-label="Fim da área de trabalho" type="number" min="0" max="${clip.frames}" value="${state.workRange?.clipId === clip.id ? state.workRange.end : clip.frames}"></label>${button("timeline-zoom-out", "− Tempo")}${button("timeline-zoom-in", "+ Tempo")}${button("delete-key", "Excluir chave", state.selectedKey ? "" : "unavailable")}</div><div class="timeline-body virtual-timeline-body"><div data-timeline-panel></div></div><footer class="statusbar"><span class="live-dot"></span><span data-local-save></span><span class="push">${clip.tracks.length} trilhas · ${clip.fps} FPS · interpolação compartilhada</span></footer></section>`;
}

/** Dialog owns presentation only. The shared transaction validates and commits. */
export function openClipDialog(state, { transact, render, notify }, create = false) {
  state.playing = false;
  render();
  const clip = create ? null : activeClip(state);
  const dialog = document.querySelector("#clip-dialog");
  dialog.innerHTML = `<form><div class="dialog-heading"><h2>${create ? "Nova animação" : "Configurar animação"}</h2><button type="button" data-close-clip aria-label="Fechar">×</button></div><div class="help-content"><label class="scene-field">Nome<input name="name" maxlength="120" required value="${xmlEscape(clip?.name ?? "Animação")}"></label><label class="scene-field">Quadros por segundo<input name="fps" type="number" min="1" max="240" step="1" required value="${clip?.fps ?? 60}"></label><label class="scene-field">Duração em quadros<input name="frames" type="number" min="1" max="360000" step="1" required value="${clip?.frames ?? 120}"></label><p class="micro">A duração não pode excluir chaves (inclusive rig) ou eventos existentes. Alterar FPS mantém os quadros e altera a duração em segundos.</p></div><div class="dialog-footer">${clip ? '<button type="button" data-delete-clip>Excluir animação</button>' : ""}<button type="submit" class="primary">${create ? "Criar" : "Salvar"}</button></div></form>`;
  dialog.querySelector("[data-close-clip]").onclick = () => dialog.close();
  dialog.querySelector("[data-delete-clip]")?.addEventListener("click", () => {
    if (
      !window.confirm(
        "Excluir esta animação, suas trilhas/canais e seus eventos/vínculos de áudio em todas as pranchetas? Os recursos do catálogo serão mantidos. Máquinas e componentes que ainda a utilizam impedem a exclusão.",
      )
    )
      return;
    try {
      transact([{ type: "motion", command: { type: "delete-animation", animationId: clip.id } }]);
      state.activeClipId = state.motion.animations[0]?.id ?? null;
      render();
    } catch (error) {
      notify(error.message);
    }
  });
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const metadata = {
      name: String(form.get("name")).trim(),
      fps: Number(form.get("fps")),
      frames: Number(form.get("frames")),
      mode: clip?.mode ?? "loop",
    };
    const id = clip?.id ?? `animation-${crypto.randomUUID()}`;
    try {
      transact([
        {
          type: "motion",
          command: create
            ? { type: "create-animation", animation: { id, ...metadata, tracks: [] } }
            : { type: "update-animation", animationId: id, ...metadata },
        },
      ]);
      state.activeClipId = id;
      state.view = "animate";
      state.frame = Math.min(state.frame, metadata.frames);
      render();
    } catch (error) {
      notify(error.message);
    }
  };
  dialog.showModal();
}

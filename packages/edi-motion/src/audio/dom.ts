import type { AudioControlHandle, AudioStatus } from "./model";
/** Plain DOM counterpart of the React controls, for standalone offline HTML. */
export function mountAudioControls(host: HTMLElement, player: AudioControlHandle) {
  const document = host.ownerDocument,
    view = document.defaultView;
  if (!view) throw new Error("Controles requerem janela DOM ativa.");
  const owner = new view.AbortController(),
    fieldset = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    button = document.createElement("button"),
    label = document.createElement("label"),
    volume = document.createElement("input"),
    status = document.createElement("p"),
    captions = document.createElement("ol"),
    omitted = document.createElement("p"),
    error = document.createElement("p");
  let live = true,
    opening = false,
    total = 0,
    closed = false;
  const cleanups: (() => void)[] = [];
  legend.textContent = "Áudio";
  fieldset.setAttribute("aria-label", "Áudio da animação");
  button.type = "button";
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  label.textContent = "Volume do áudio";
  label.append(volume);
  captions.setAttribute("aria-live", "polite");
  captions.setAttribute("aria-label", "Alternativas dos efeitos de áudio");
  error.setAttribute("role", "alert");
  error.hidden = true;
  fieldset.append(legend, button, label, status, captions, omitted, error);
  host.append(fieldset);
  const report = (reason: unknown) => {
    if (!live) return;
    error.hidden = false;
    error.textContent = reason instanceof Error ? reason.message : "Operação de áudio recusada.";
  };
  const paint = (value: AudioStatus) => {
    if (!live) return;
    closed = value.destroyed;
    button.textContent = opening ? "Ativando…" : value.enabled ? "Desativar áudio" : "Ativar áudio";
    button.disabled = opening || closed;
    volume.disabled = closed;
    volume.value = String(value.masterVolume);
    status.textContent = `${value.activeVoices}/32 vozes · ${value.stolenVoices} substituídas por limite · ${value.skippedLate} efeitos já encerrados no avanço`;
  };
  const dispose = () => {
    if (!live) return;
    live = false;
    owner.abort();
    for (const cleanup of cleanups.reverse()) cleanup();
    fieldset.remove();
  };
  try {
    paint(player.inspectAudio());
    cleanups.push(player.onAudioStateChange(paint));
    cleanups.push(
      player.onAudioCue((cue) => {
        if (!live) return;
        total++;
        const item = document.createElement("li");
        item.textContent = cue.caption;
        captions.append(item);
        while (captions.children.length > 16) captions.firstElementChild?.remove();
        omitted.textContent =
          total > 16 ? `${total - 16} alternativas anteriores fora da janela de 16.` : "";
      }),
    );
    button.addEventListener(
      "click",
      async () => {
        if (opening || !live || closed) return;
        opening = true;
        error.hidden = true;
        paint(player.inspectAudio());
        try {
          if (player.inspectAudio().enabled) player.disableAudio();
          else await player.enableAudio();
        } catch (reason) {
          report(reason);
        } finally {
          opening = false;
          if (live && !closed) paint(player.inspectAudio());
        }
      },
      { signal: owner.signal },
    );
    volume.addEventListener(
      "input",
      () => {
        try {
          player.setAudioVolume(Number(volume.value));
        } catch (reason) {
          report(reason);
        }
      },
      { signal: owner.signal },
    );
    return dispose;
  } catch (reason) {
    dispose();
    throw reason;
  }
}

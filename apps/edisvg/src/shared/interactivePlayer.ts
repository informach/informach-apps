import { mountAudioControls } from "@informach/edi-motion/audio/dom";
import {
  createInteractiveSvgPlayerAsync,
  createVisualSvgPlayerAsync,
  documentAudioAssets,
  type InteractiveDocument,
  type InteractivePlayerOptions,
} from "@informach/edi-motion/runtime";

export async function mountInteractivePlayer(
  data: InteractiveDocument,
  options: InteractivePlayerOptions,
) {
  const root = document.querySelector("#edi-artwork>svg"),
    toggle = document.querySelector("#play-toggle"),
    reset = document.querySelector("#player-reset"),
    status = document.querySelector("#player-status"),
    controls = document.querySelector("#player-inputs");
  if (
    !(root instanceof SVGSVGElement) ||
    !(toggle instanceof HTMLButtonElement) ||
    !(reset instanceof HTMLButtonElement) ||
    !status ||
    !controls
  )
    throw new Error("Controles interativos ausentes.");
  const owner = new AbortController(),
    fields = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const report = (error: unknown) => {
    status.textContent = error instanceof Error ? error.message : "Operação recusada.";
  };
  const announce = (playing: boolean) => {
    toggle.textContent = playing ? "Pausar" : "Reproduzir";
  };
  const abandon = () => owner.abort();
  window.addEventListener("pagehide", abandon, { signal: owner.signal, once: true });
  const factory = data.version >= 6 ? createVisualSvgPlayerAsync : createInteractiveSvgPlayerAsync;
  const player = await factory(
    root,
    data,
    {
      ...options,
      onPlaybackChange: announce,
      onError: report,
    },
    owner.signal,
  ).finally(() => window.removeEventListener("pagehide", abandon));
  const run = (action: () => void) => {
    try {
      action();
      status.textContent = "";
    } catch (error) {
      report(error);
    }
  };
  const audioHost = documentAudioAssets(data).length
    ? document.createElement("section")
    : undefined;
  let disposeAudio: (() => void) | undefined;
  if (audioHost) {
    audioHost.id = "player-audio";
    controls.after(audioHost);
    try {
      disposeAudio = mountAudioControls(audioHost, player);
    } catch (error) {
      audioHost.remove();
      owner.abort();
      player.destroy();
      throw error;
    }
  }
  for (const input of data.behavior.inputs) {
    if (input.kind === "trigger") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Disparar ${input.name}`;
      button.addEventListener("click", () => run(() => player.trigger(input.id)), {
        signal: owner.signal,
      });
      controls.append(button);
      continue;
    }
    const label = document.createElement("label");
    label.textContent = input.name;
    const field =
      input.kind === "enum"
        ? document.createElement("select")
        : input.kind === "string"
          ? document.createElement("textarea")
          : document.createElement("input");
    field.id = `edi-input-${input.id}`;
    field.name = input.id;
    field.setAttribute("aria-label", input.name);
    field.disabled =
      data.behavior.data?.links.some(
        (link) => link.inputId === input.id && link.direction === "one-way",
      ) ?? false;
    label.htmlFor = field.id;
    if (field instanceof HTMLInputElement) {
      field.type =
        input.kind === "boolean" ? "checkbox" : input.kind === "color" ? "color" : "number";
      if (input.kind === "number") {
        field.min = String(input.min);
        field.max = String(input.max);
        field.step = "any";
      }
      if (input.kind === "boolean") field.checked = player.getInput(input.id) === true;
    }
    if (field instanceof HTMLTextAreaElement) field.maxLength = 10000;
    if (field instanceof HTMLSelectElement && input.kind === "enum")
      for (const value of input.values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        field.append(option);
      }
    field.value = String(player.getInput(input.id));
    field.addEventListener(
      "change",
      () =>
        run(() => {
          if (input.kind === "number" && !field.value.trim()) throw new Error("Informe um número.");
          player.setInput(
            input.id,
            input.kind === "number"
              ? Number(field.value)
              : input.kind === "boolean" && field instanceof HTMLInputElement
                ? field.checked
                : field.value,
          );
        }),
      { signal: owner.signal },
    );
    fields.set(input.id, field);
    controls.append(label, field);
  }
  const unsubscribe = player.onInputChange((id, value) => {
    const field = fields.get(id);
    if (!field) return;
    if (field instanceof HTMLInputElement && field.type === "checkbox")
      field.checked = value === true;
    else field.value = String(value);
  });
  toggle.addEventListener(
    "click",
    () =>
      run(() => {
        if (player.playing) player.pause();
        else player.play();
      }),
    { signal: owner.signal },
  );
  reset.addEventListener("click", () => run(() => player.reset()), { signal: owner.signal });
  const destroy = () => {
    owner.abort();
    disposeAudio?.();
    audioHost?.remove();
    unsubscribe();
    player.destroy();
    fields.clear();
  };
  window.addEventListener(
    "pagehide",
    (event) => {
      if (event.persisted) player.pause();
      else destroy();
    },
    { signal: owner.signal },
  );
  announce(player.playing);
  Reflect.set(window, "ediSVGInteractivePlayer", player);
  return { player, destroy };
}

import type {
  createSvgPlayer,
  PlayerOptions,
  RuntimeDocument,
} from "@informach/edi-motion/runtime";

/** Compiled by the offline entry with the evaluator and all its dependencies. */
export function mountClipPlayer(
  factory: typeof createSvgPlayer,
  data: RuntimeDocument,
  options: PlayerOptions,
) {
  const svg = document.querySelector("svg"),
    toggle = document.querySelector("#play-toggle");
  if (!svg || !(toggle instanceof HTMLButtonElement))
    throw new Error("Controles do player ausentes.");
  const announce = (playing: boolean) => {
    toggle.textContent = playing ? "Pausar" : "Reproduzir";
  };
  const player = factory(svg, data, { ...options, onPlaybackChange: announce });
  Reflect.set(window, "ediSVGPlayer", player);
  announce(player.playing);
  toggle.onclick = () => {
    if (player.playing) player.pause();
    else player.play();
  };
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) player.pause();
    else player.destroy();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) announce(player.playing);
  });
}

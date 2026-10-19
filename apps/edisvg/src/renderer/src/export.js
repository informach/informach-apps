import { createPlaybackContext, evaluatePlaybackStaticFrame } from "@informach/edi-motion";
import { geometryPath } from "@informach/edi-motion/geometry";
import { animations, poseAt } from "../../shared/animation.js";
import { compileArtboard } from "../../shared/components";
import { requiresInteractiveExport } from "../../shared/interactiveCapabilities";
import { compileLottie } from "../../shared/lottie/compile";
import { lottieOptionsSchema } from "../../shared/lottie/prepare";
import { artboardScene, snapshot } from "../../shared/project.js";
import { serializeProject } from "../../shared/projectPolicy";
import { flattenScene, renderScene, xmlEscape } from "../../shared/scene.js";
import { buildInteractiveExport } from "./behavior/export";
import { buildReactExport } from "./behavior/react-export";
import { buildClipExport } from "./clipExport.ts";
import { runLottieTask } from "./lottieTaskRunner";

function lottieOptions(state, options) {
  return lottieOptionsSchema.parse({
    artboardId: state.activeArtboardId ?? state.defaultArtboardId,
    animationId: state.activeClipId,
    subdivisions: options.subdivisions ?? 1,
    confirmSampling: options.confirmSampling ?? false,
    confirmRendererPrecision: options.confirmRendererPrecision ?? false,
    confirmAnimationOnly: options.confirmAnimationOnly ?? false,
    alt: options.alt,
  });
}

/** Pure export boundary; transport and downloads do not own animation rules. */
export function buildExport(state, options, demoSvg = "", runtimeSource = "") {
  const project = snapshot(state);
  if (
    !["html", "interactive-html", "svg", "json", "lottie"].includes(options.format) ||
    typeof options.alt !== "string" ||
    options.alt.length > 200
  )
    throw new Error("Opções de exportação inválidas.");
  if (options.format === "lottie") return compileLottie(project, lottieOptions(state, options));
  if (options.format === "json")
    return {
      extension: "edisvg.json",
      type: "application/json",
      content: serializeProject(project),
    };
  if (options.format === "interactive-html")
    return buildInteractiveExport(
      project,
      { ...options, artboardId: state.activeArtboardId, animationId: state.activeClipId },
      runtimeSource,
    );
  const board = project.artboards.find(
    (board) => board.id === (state.activeArtboardId ?? project.defaultArtboardId),
  );
  if (requiresInteractiveExport(project, board?.id) && options.confirmAnimationOnly !== true)
    throw new Error(
      "Este formato exporta apenas a animação, sem lógica/dados/eventos/áudio/layout responsivo. Use HTML interativo ou confirme a conversão explicitamente.",
    );
  if (state.activeClipId)
    return buildClipExport(
      project,
      state.activeClipId,
      { ...options, artboardId: state.activeArtboardId },
      runtimeSource,
    );
  const scene = artboardScene(project, state.activeArtboardId ?? project.defaultArtboardId);
  const composition = scene
    ? compileArtboard(project, state.activeArtboardId ?? project.defaultArtboardId)
    : null;
  if (composition && flattenScene(composition.scene).some(({ node }) => node.effects))
    throw new Error(
      "Recortes/máscaras requerem HTML interativo ou React; este formato não preserva esse perfil.",
    );
  if (composition?.playback.drivers.length && options.format !== "json")
    throw new Error("Selecione uma animação por objeto para exportar os relógios dos componentes.");
  const outputScene = composition ? structuredClone(composition.scene) : null;
  if (composition?.playback.rigScopes?.length && outputScene) {
    const evaluated = evaluatePlaybackStaticFrame(createPlaybackContext(composition.playback));
    for (const { node } of flattenScene(outputScene)) {
      node.transform = evaluated.poses.get(node.id) ?? node.transform;
      const geometry = evaluated.geometry.get(node.id);
      if (geometry) node.attrs.d = geometryPath(geometry);
      if (evaluated.visibility.get(node.id) === false) node.visible = false;
    }
  }
  const svg = outputScene
    ? renderScene(outputScene, { compiled: true, assets: project.assets, verifyFonts: true })
    : demoSvg;
  if (!svg.startsWith("<svg") && !svg.startsWith("<?xml")) throw new Error("SVG indisponível.");
  const name = project.animation,
    frames = animations[name].frames,
    mode = project.modes[name],
    t = project.transforms;
  const viewBox = scene ? scene.viewBox.join(" ") : "0 0 260 360";
  const preserveAspectRatio = scene?.preserveAspectRatio ?? "xMidYMid meet";
  const origin = scene ? "50% 50%" : "50% 80%";
  const transform = (p) =>
    `translate(${t.x}px,${t.y + p.y}px) rotate(${t.rotation + p.rotation}deg) scale(${t.sx * p.scale},${t.sy * p.scale})`;
  // SVG has no JS evaluator: sample the shared evaluator at the document's 60 Hz.
  // Report the approximation instead of claiming exact parity at arbitrary times.
  const samples = Array.from(
    { length: frames + 1 },
    (_, frame) => `${(frame / frames) * 100}%{transform:${transform(poseAt(name, frame, frames))}}`,
  ).join("");
  const css = `@keyframes edi-motion{${samples}}.motion{transform-box:view-box;transform-origin:${origin};opacity:${t.opacity / 100};animation:edi-motion ${frames / 60}s linear ${mode === "once" ? "1" : "infinite"} ${mode === "ping-pong" ? "alternate" : "normal"} both}${options.reduced ? "@media(prefers-reduced-motion:reduce){.motion{animation:none!important}}" : ""}`;
  const root = svg.indexOf("<svg"),
    start = svg.indexOf(">", root);
  const body = svg.slice(start + 1, svg.lastIndexOf("</svg>"));
  const animated = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="${xmlEscape(preserveAspectRatio)}" role="img" aria-label="${xmlEscape(options.alt)}"><title>${xmlEscape(options.alt)}</title><style>${css}</style><g class="motion ${name}" style="transform:${transform(poseAt(name, 0, frames))}">${body}</g></svg>`;
  if (options.format === "json")
    return {
      extension: "edisvg.json",
      type: "application/json",
      content: serializeProject(project),
    };
  if (options.format === "svg")
    return {
      extension: "svg",
      type: "image/svg+xml",
      content: animated.replace(
        "<title>",
        "<desc>Movimento global amostrado a 60 Hz; interpolação CSS linear entre amostras.</desc><title>",
      ),
    };
  const data = JSON.stringify({
    name,
    frames,
    mode,
    t,
    presets: Object.fromEntries(
      Object.entries(animations).map(([id, preset]) => [
        id,
        { frames: preset.frames, mode: project.modes[id] },
      ]),
    ),
    reduced: !!options.reduced,
    offscreen: !!options.offscreen,
    interactive: !scene,
  }).replace(/</g, "\\u003c");
  if (typeof runtimeSource !== "string" || !runtimeSource.includes("mountLegacyPlayer"))
    throw new Error("Bundle offline indisponível.");
  const runtime = `${runtimeSource.replace(/<\/script/gi, "<\\/script")}\nEdiSVGRuntime.mountLegacyPlayer(${data});`;
  return {
    extension: "html",
    type: "text/html",
    content: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEscape(project.name)} — EdiSVG</title><style>body{margin:0;min-height:100dvh;display:grid;place-content:center;text-align:center;background:#f2efe8;font:14px system-ui;color:#0c2044}.artwork{width:360px;max-width:90vw;height:440px;padding:0;border:0;background:none}.artwork>svg{width:100%;height:100%}button{font:inherit;padding:.6em 1em}button:focus-visible{outline:2px solid #0c2044}</style></head><body>${scene ? `<div class="artwork">${animated}</div>` : `<button type="button" class="artwork" aria-label="Interagir com ${xmlEscape(project.name)}">${animated}</button>`}<button id="play-toggle" type="button">Pausar</button><p>${xmlEscape(name)} · ${xmlEscape(mode)} · movimento global predefinido${scene ? "" : ". Passe o mouse para acenar; clique para pular."}</p><script>${runtime}</script></body></html>`,
  };
}

export async function exportProject(state, options, task = {}) {
  const captured = {
    ...snapshot(state),
    activeClipId: state.activeClipId,
    activeArtboardId: state.activeArtboardId,
  };
  let runtimeSource = "";
  let licenses = "";
  if (options.format === "react") {
    const results = await Promise.all([
      fetch("edi-react-player.mjs"),
      fetch("edi-player.licenses.txt"),
    ]);
    if (results.some((response) => !response.ok))
      throw new Error("Não foi possível carregar o pacote React/licenças.");
    [runtimeSource, licenses] = await Promise.all(results.map((response) => response.text()));
  }
  if (options.format === "html" || options.format === "interactive-html") {
    const response = await fetch("edi-player.global.js");
    if (!response.ok) throw new Error("Não foi possível carregar o runtime de exportação.");
    runtimeSource = await response.text();
  }
  let demo = "";
  if (
    options.format !== "json" &&
    !artboardScene(captured, captured.activeArtboardId ?? captured.defaultArtboardId)
  ) {
    const response = await fetch("assets/zeze.svg");
    if (!response.ok) throw new Error("Mascote indisponível.");
    demo = await response.text();
  }
  const { content, extension, type } =
    options.format === "lottie"
      ? await runLottieTask(
          snapshot(captured),
          lottieOptions(captured, options),
          "compile",
          task.signal,
          task.onProgress,
        ).then((result) => {
          if (result.kind !== "export") throw new Error("Resposta Lottie inesperada.");
          return { content: result.content, extension: "lottie.json", type: "application/json" };
        })
      : options.format === "react"
        ? buildReactExport(
            snapshot(captured),
            {
              ...options,
              artboardId: captured.activeArtboardId,
              animationId: captured.activeClipId,
            },
            runtimeSource,
            licenses,
          )
        : buildExport(captured, options, demo, runtimeSource);
  if (task.signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
  if (globalThis.window?.desktop) {
    if (content instanceof Uint8Array) {
      let binary = "";
      for (let offset = 0; offset < content.length; offset += 32768)
        binary += String.fromCharCode(...content.subarray(offset, offset + 32768));
      return window.desktop.exportFile({ content: btoa(binary), extension, encoding: "base64" });
    }
    return window.desktop.exportFile({ content, extension });
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `projeto.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

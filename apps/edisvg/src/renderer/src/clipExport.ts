import {
  createPlaybackContext,
  evaluatePlaybackFrame,
  type Transform,
} from "@informach/edi-motion";
import { geometryPath } from "@informach/edi-motion/geometry";
import { rigOwners } from "@informach/edi-motion/rig";
import { compileArtboard } from "../../shared/components";
import { requiresInteractiveExport } from "../../shared/interactiveCapabilities";
import type { Project } from "../../shared/project";
import { serializeProject } from "../../shared/projectPolicy";
import { flattenScene, renderScene, xmlEscape } from "../../shared/scene.js";

/** Export is a validated document snapshot, not a second animation model. */
interface Options {
  format: "html" | "svg" | "json";
  alt: string;
  reduced: boolean;
  offscreen: boolean;
  artboardId?: string | null;
  confirmAnimationOnly?: boolean;
}
export function buildClipExport(
  project: Project,
  clipId: string,
  options: Options,
  runtimeSource: string,
) {
  if (options.format === "json")
    return {
      extension: "edisvg.json",
      type: "application/json",
      content: serializeProject(project),
    };
  const boardId = options.artboardId ?? project.defaultArtboardId;
  if (!boardId) throw new Error("Prancheta indisponível.");
  const { scene, playback: data } = compileArtboard(project, boardId);
  if (flattenScene(scene).some(({ node }) => node.effects))
    throw new Error(
      "Recortes/máscaras animados requerem HTML interativo ou React; o exportador de clip não preserva esse perfil.",
    );
  if (requiresInteractiveExport(project, boardId) && options.confirmAnimationOnly !== true)
    throw new Error(
      "Este formato exporta apenas a animação, sem lógica/dados/eventos/áudio/layout responsivo. Use HTML interativo ou confirme a conversão explicitamente.",
    );
  const objects = data.objects;
  const playbackContext = createPlaybackContext(data);
  const clip = data.motion.animations.find((item) => item.id === clipId);
  if (!clip) throw new Error("Animação por objeto indisponível.");
  const t = project.transforms;
  const globalTransform = `translate(${t.x}px,${t.y}px) rotate(${t.rotation}deg) scale(${t.sx},${t.sy});opacity:${t.opacity / 100}`;
  let svg = renderScene(scene, {
    runtime: true,
    compiled: true,
    assets: project.assets,
    verifyFonts: true,
  })
    .replace("<svg ", () => `<svg role="img" aria-label="${xmlEscape(options.alt)}" `)
    .replace(/(<svg[^>]*>)/, (opening) => `${opening}<title>${xmlEscape(options.alt)}</title>`);
  svg = svg.replace(
    'data-scene-motion="" style="',
    `data-scene-motion="" style="transform:${globalTransform};`,
  );
  if (options.format === "svg") {
    const meshed = new Set(
      data.objects.flatMap((object) =>
        "tag" in object && object.tag === "image" && object.geometry ? [object.id] : [],
      ),
    );
    if (
      data.rigScopes?.some((scope) =>
        [...(scope.rig.skins ?? []), ...(scope.rig.morphs ?? [])].some((deformer) =>
          meshed.has(deformer.targetId),
        ),
      )
    )
      throw new Error(
        "Malha raster deformada não tem representação SVG/SMIL neste perfil. Use HTML, React ou vídeo.",
      );
    if (clip.drawOrders || data.drivers.some((driver) => driver.animation.drawOrders))
      throw new Error(
        "Ordem de desenho animada não tem representação SVG/SMIL: o SVG empilha os filhos na ordem do documento. Use HTML, React ou vídeo.",
      );
    const targets = new Set(
      [...clip.tracks, ...data.drivers.flatMap((driver) => driver.animation.tracks)].map(
        (track) => track.targetId,
      ),
    );
    const geometrySamples = new Map<string, string[]>(),
      // Trim may change topology or empty the path each frame: SMIL cannot interpolate between
      // different command lists, so these paths step exactly at each sampled frame.
      discreteGeometry = new Set<string>(),
      baseGeometry = new Map(
        objects.flatMap((object) =>
          object.geometry ? [[object.id, object.geometry] as const] : [],
        ),
      ),
      visibilitySamples = new Map<string, string[]>(),
      visible = new Map(flattenScene(scene).map(({ node }) => [node.id, node.visible]));
    for (const scope of data.rigScopes ?? []) {
      for (const id of rigOwners(scope.rig)) targets.add(id);
      for (const morph of scope.rig.morphs ?? []) geometrySamples.set(morph.targetId, []);
      for (const skin of scope.rig.skins ?? []) geometrySamples.set(skin.targetId, []);
      for (const trim of scope.rig.trims ?? []) {
        geometrySamples.set(trim.targetId, []);
        discreteGeometry.add(trim.targetId);
      }
      for (const solo of scope.rig.solos ?? [])
        for (const id of solo.children) {
          targets.add(id);
          visibilitySamples.set(id, []);
        }
    }
    const steps = clip.frames * (clip.mode === "ping-pong" ? 2 : 1);
    const geometryCost = objects
      .filter((object) => geometrySamples.has(object.id))
      .reduce(
        (sum, object) =>
          sum +
          (object.geometry ?? []).reduce(
            (sum, contour) =>
              sum +
              contour.points.reduce(
                (sum, point) => sum + 1 + Number(!!point.in) + Number(!!point.out),
                0,
              ),
            0,
          ),
        0,
      );
    if ((steps + 1) * geometryCost > 100000)
      throw new Error(
        "SVG deformado excede orçamento de amostragem de geometria; use HTML ou reduza o projeto.",
      );
    if ((steps + 1) * Math.max(1, targets.size) > 100000)
      throw new Error(
        "SVG amostrado excede o orçamento de exportação. Use HTML ou diminua a duração/quantidade de objetos.",
      );
    const samples = new Map<string, Transform[]>([...targets].map((id) => [id, []]));
    for (let step = 0; step <= steps; step++) {
      const frame = step <= clip.frames ? step : steps - step;
      const evaluated = evaluatePlaybackFrame(playbackContext, clip, frame),
        pose = evaluated.poses;
      for (const [id, values] of geometrySamples) {
        const geometry =
          evaluated.geometry.get(id) ??
          (discreteGeometry.has(id) ? baseGeometry.get(id) : undefined);
        if (!geometry) throw new Error("Geometria amostrada ausente.");
        // An emptied path keeps a valid, invisible command so the value list stays parseable.
        values.push(geometryPath(geometry) || "M0 0");
      }
      for (const [id, values] of visibilitySamples)
        values.push(
          evaluated.visibility.get(id) === false || visible.get(id) === false ? "none" : "inline",
        );
      for (const object of objects)
        if (targets.has(object.id)) {
          const sequence = samples.get(object.id);
          if (!sequence) throw new Error("Sequência de exportação ausente.");
          sequence.push({ ...object.transform, ...pose.get(object.id) });
        }
    }
    for (const [id, poses] of samples) {
      const timing = `dur="${steps / clip.fps}s" repeatCount="${clip.mode === "once" ? "1" : "indefinite"}" fill="freeze" calcMode="linear"`;
      const geometry = geometrySamples.get(id),
        visibility = visibilitySamples.get(id),
        // keyTimes pin each discrete value to its frame instead of SMIL's equal intervals.
        geometryTiming = discreteGeometry.has(id)
          ? `${timing.replace('calcMode="linear"', 'calcMode="discrete"')} keyTimes="${Array.from({ length: steps + 1 }, (_, step) => step / steps).join(";")}"`
          : timing;
      if (geometry)
        svg = svg.replace(
          new RegExp(`(<g data-edi-object="${id}"[^>]*>)(<path[^>]*>)`),
          (_, group, path) =>
            `${group}${path}<animate attributeName="d" ${geometryTiming} values="${geometry.join(";")}"/>`,
        );
      const transform = (
        kind: "translate" | "rotate" | "scale" | "skewX",
        values: (string | number)[],
        additive = false,
      ) =>
        `<animateTransform attributeName="transform" type="${kind}"${additive ? ' additive="sum"' : ""} ${timing} values="${values.join(";")}"/>`;
      const animation =
        transform(
          "translate",
          poses.map((p) => `${p.x + (p.px ?? 0)} ${p.y + (p.py ?? 0)}`),
        ) +
        transform(
          "rotate",
          poses.map((p) => p.rotation),
          true,
        ) +
        transform(
          "skewX",
          poses.map((p) => p.skewX ?? 0),
          true,
        ) +
        transform(
          "scale",
          poses.map((p) => `${p.sx} ${p.sy}`),
          true,
        ) +
        transform(
          "translate",
          poses.map((p) => `${-(p.px ?? 0)} ${-(p.py ?? 0)}`),
          true,
        ) +
        `<animate attributeName="opacity" ${timing} values="${poses.map((p) => p.opacity / 100).join(";")}"/>` +
        (visibility
          ? `<animate attributeName="display" ${timing.replace('calcMode="linear"', 'calcMode="discrete"')} values="${visibility.join(";")}"/>`
          : "");
      svg = svg.replace(
        new RegExp(`(<g data-edi-object="${id}"[^>]*>)`),
        (_, opening) => opening + animation,
      );
    }
    const reduce = options.reduced
      ? "<style>[data-edi-still]{display:none}@media(prefers-reduced-motion:reduce){[data-edi-animated]{display:none}[data-edi-still]{display:inline}}</style>"
      : "";
    if (options.reduced) {
      const start = svg.indexOf(">") + 1;
      const body = svg.slice(start, svg.lastIndexOf("</svg>"));
      const stillScene = structuredClone(scene);
      const initial = evaluatePlaybackFrame(playbackContext, clip, 0),
        firstPose = initial.poses;
      for (const { node } of flattenScene(stillScene)) {
        node.transform = { ...node.transform, ...firstPose.get(node.id) };
        const geometry = initial.geometry.get(node.id);
        if (geometry) node.attrs.d = geometryPath(geometry);
        if (initial.visibility.get(node.id) === false) node.visible = false;
      }
      const still = renderScene(stillScene, {
        runtime: true,
        compiled: true,
        assets: project.assets,
      })
        .replace(
          'data-scene-motion="" style="',
          `data-scene-motion="" style="transform:${globalTransform};`,
        )
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, "");
      svg =
        svg.slice(0, start) +
        reduce +
        `<g data-edi-animated="">${body}</g><g data-edi-still="">${still}</g></svg>`;
    }
    return {
      extension: "svg",
      type: "image/svg+xml",
      content: svg.replace(
        /(<svg[^>]*>)/,
        "$1<desc>Trilhas amostradas no FPS do documento; interpolação linear entre amostras. Sem estados.</desc>",
      ),
    };
  }
  if (
    typeof runtimeSource !== "string" ||
    !runtimeSource.includes("createSvgPlayer") ||
    !runtimeSource.includes("mountClipPlayer")
  )
    throw new Error("Bundle do runtime indisponível.");
  const script = `${runtimeSource.replace(/<\/script/gi, "<\\/script")}\nEdiSVGRuntime.mountClipPlayer(EdiSVGRuntime.createSvgPlayer,${JSON.stringify(data).replace(/</g, "\\u003c")},${JSON.stringify({ animationId: clip.id, respectReducedMotion: !!options.reduced, pauseOffscreen: !!options.offscreen })});`;
  return {
    extension: "html",
    type: "text/html",
    content: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEscape(project.name)} — EdiSVG</title><style>body{margin:0;min-height:100dvh;display:grid;place-content:center;text-align:center;background:#f2efe8;font:14px system-ui;color:#0c2044}.artwork{width:360px;max-width:90vw;height:440px}.artwork>svg{width:100%;height:100%}button{font:inherit;padding:.6em 1em}</style></head><body><div class="artwork">${svg}</div><button id="play-toggle" type="button">Pausar</button><p>${xmlEscape(clip.name)} · ${clip.fps} FPS · ${xmlEscape(clip.mode)}</p><script>${script}</script></body></html>`,
  };
}

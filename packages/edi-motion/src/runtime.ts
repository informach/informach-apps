import { transformAttribute } from "./affine";
import { drawOrderScopes } from "./drawOrder";
import { createDrawOrderBinding } from "./drawOrderDom";
import { frameAtSeconds } from "./evaluator";
import { createFrameLoop, type FrameLoopOptions } from "./frameLoop";
import { geometryPath } from "./geometry";
import { paintLayerPaths, writeShapePath } from "./graphics/paintLayers";
import { createPlaybackContext, evaluatePlaybackFrame } from "./playbackFrame";
import { createImageMeshBinding, renderedImageMesh } from "./visual/imageMeshDom";

export type { AudioCueEmission, AudioStatus } from "./audio/model";
export {
  INTERACTIVE_VERSION,
  type InteractiveDocument,
  parseInteractiveDocument,
} from "./interactiveDocument";
export { documentAudioAssets } from "./interactiveResources";
export {
  type BehaviorDebug,
  createInteractiveSvgPlayer,
  createInteractiveSvgPlayerAsync,
  createVisualSvgPlayerAsync,
  type InteractivePlayerOptions,
} from "./interactiveRuntime";
export type { RigDiagnostic } from "./rig/playbackRig";

import type { Transform } from "./model";
import {
  type LegacyPlaybackDocument,
  type PlaybackDocument,
  parsePlaybackDocument,
} from "./playback";

export type RuntimeDocument = PlaybackDocument | LegacyPlaybackDocument;
export interface PlayerOptions extends FrameLoopOptions {
  animationId?: string;
  autoplay?: boolean;
  respectReducedMotion?: boolean;
  pauseOffscreen?: boolean;
  onPlaybackChange?: (playing: boolean) => void;
}

/** An offline SVG runtime. The host owns the SVG DOM; no arbitrary markup,
 * network, Electron, editor session or AI provider is required by this API. */
export function createSvgPlayer(root: SVGSVGElement, input: unknown, options: PlayerOptions = {}) {
  const document = parsePlaybackDocument(input);
  const playbackContext = createPlaybackContext(document);
  const bases = new Map<string, Transform>();
  for (const object of document.objects) {
    if (bases.has(object.id)) throw new Error("ID de objeto duplicado no runtime.");
    bases.set(object.id, object.transform);
  }
  const motion = document.motion;
  const identities = new Map(
    document.sources.map((source) => [
      JSON.stringify([source.objectId, source.instancePath]),
      source.id,
    ]),
  );
  const elements = new Map<string, SVGElement>();
  const baseDisplays = new Map<string, string | null>();
  const basePaths = new Map<string, string | null>();
  for (const element of root.querySelectorAll("[data-edi-object]")) {
    const id = element.getAttribute("data-edi-object");
    if (
      !(element instanceof (root.ownerDocument.defaultView?.SVGElement ?? SVGElement)) ||
      !id ||
      elements.has(id) ||
      !bases.has(id)
    )
      throw new Error("Identidade SVG incompatível com o documento de runtime.");
    elements.set(id, element);
    baseDisplays.set(id, element.getAttribute("display"));
    if (element.firstElementChild?.localName === "path")
      basePaths.set(id, element.firstElementChild.getAttribute("d"));
  }
  if (elements.size !== bases.size)
    throw new Error("O SVG não contém todos os objetos do documento.");
  // Meshed images carry their grid in markup and their rest vertices as geometry.
  const meshes = new Map<string, ReturnType<typeof createImageMeshBinding>>();
  for (const object of document.objects) {
    const shape = elements.get(object.id)?.firstElementChild,
      mesh = shape ? renderedImageMesh(shape) : undefined;
    if (shape && mesh && object.geometry) {
      const image = root.querySelector(
          `image[id="edi-${shape.getAttribute("data-edi-image") ?? ""}"]`,
        ),
        width = Number(image?.getAttribute("width")),
        height = Number(image?.getAttribute("height"));
      if (!(width > 0 && height > 0)) throw new Error("Malha raster sem recurso de imagem.");
      meshes.set(
        object.id,
        createImageMeshBinding(shape, mesh, { width, height }, object.geometry),
      );
    } else if (object.geometry && !basePaths.has(object.id))
      throw new Error("Geometria requer caminho SVG correspondente.");
  }
  let animation =
    motion.animations.find((clip) => clip.id === options.animationId) ??
    (options.animationId ? undefined : motion.animations[0]);
  if (!animation) throw new Error("Escolha uma animação válida.");
  let seconds = 0,
    destroyed = false;
  let frame = evaluatePlaybackFrame(playbackContext, animation, 0),
    stillFrame = frame;
  // Paint layer paths are keyed `objectId#layerId` and belong to their object.
  for (const key of frame.geometry.keys()) {
    const id = key.split("#")[0] ?? key;
    if (!meshes.has(id) && elements.get(id)?.firstElementChild?.localName !== "path")
      throw new Error("Geometria requer caminho SVG correspondente.");
  }
  const changed = new Set<string>();
  const previous = new Map<string, string>();
  const drawOrderBinding = createDrawOrderBinding(
    elements,
    drawOrderScopes([...motion.animations, ...document.drivers.map((driver) => driver.animation)]),
  );
  function assertLive() {
    if (destroyed) throw new Error("O player foi encerrado.");
  }
  function current() {
    if (!animation) throw new Error("Animação ausente.");
    return animation;
  }
  function setPose(id: string, transform: Transform) {
    const element = elements.get(id);
    if (!element) throw new Error("Objeto não encontrado no SVG.");
    const value = transformAttribute(transform);
    const stamp = `${value}:${transform.opacity}`;
    if (previous.get(id) !== stamp) {
      element.setAttribute("transform", value);
      element.setAttribute("opacity", String(transform.opacity / 100));
      previous.set(id, stamp);
    }
  }
  function paint(reduced: boolean) {
    const evaluated = reduced ? stillFrame : frame,
      pose = evaluated.poses;
    for (const [id, element] of elements) {
      const geometry = evaluated.geometry.get(id),
        mesh = meshes.get(id);
      if (mesh) mesh.paint(geometry);
      else if (geometry || basePaths.has(id)) {
        const shape = element.firstElementChild;
        if (shape?.localName !== "path")
          throw new Error("Geometria requer caminho SVG correspondente.");
        writeShapePath(
          shape,
          (geometry ? geometryPath(geometry) : basePaths.get(id)) ?? null,
          paintLayerPaths(evaluated.geometry, id),
        );
      }
      const visible = evaluated.visibility.get(id),
        display = visible === false ? "none" : baseDisplays.get(id);
      if (display === null || display === undefined) element.removeAttribute("display");
      else element.setAttribute("display", display);
    }
    drawOrderBinding.paint(evaluated.orders);
    for (const id of changed)
      if (!pose.has(id)) {
        const base = bases.get(id);
        if (!base) throw new Error("Pose de referência ausente.");
        setPose(id, base);
      }
    changed.clear();
    for (const [id, patch] of pose) {
      const base = bases.get(id);
      if (!base) throw new Error("Pose de referência ausente.");
      setPose(id, { ...base, ...patch });
      changed.add(id);
    }
  }
  for (const [id, base] of bases) setPose(id, base);
  const loop = createFrameLoop(
    root,
    {
      paint,
      advance(delta) {
        const clip = current();
        const nextTime =
            clip.mode === "once"
              ? Math.min(clip.frames / clip.fps, seconds + delta)
              : seconds + delta,
          next = evaluatePlaybackFrame(playbackContext, clip, frameAtSeconds(nextTime, clip));
        seconds = nextTime;
        frame = next;
        return clip.mode !== "once" || seconds < clip.frames / clip.fps;
      },
      beforePlay() {
        const clip = current();
        if (clip.mode === "once" && seconds >= clip.frames / clip.fps) {
          seconds = 0;
          frame = stillFrame;
        }
      },
    },
    options,
  );
  return {
    get animationId() {
      return current().id;
    },
    get playing() {
      return loop.playing;
    },
    get time() {
      return seconds;
    },
    /** Stable authoring identity; compiled symbols are deliberately opaque. */
    findObject(objectId: string, instancePath: readonly string[] = []) {
      assertLive();
      return identities.get(JSON.stringify([objectId, instancePath])) ?? null;
    },
    play() {
      assertLive();
      loop.play();
    },
    pause() {
      assertLive();
      loop.pause();
    },
    seek(time: number) {
      assertLive();
      if (!Number.isFinite(time) || time < 0) throw new Error("Tempo inválido.");
      const next = evaluatePlaybackFrame(
        playbackContext,
        current(),
        frameAtSeconds(time, current()),
      );
      seconds = time;
      frame = next;
      loop.invalidate();
    },
    setAnimation(id: string) {
      assertLive();
      const next = motion.animations.find((clip) => clip.id === id);
      if (!next) throw new Error("Animação não encontrada.");
      const nextFrame = evaluatePlaybackFrame(playbackContext, next, 0);
      animation = next;
      seconds = 0;
      frame = nextFrame;
      stillFrame = nextFrame;
      loop.invalidate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.destroy();
      drawOrderBinding.destroy();
    },
  };
}

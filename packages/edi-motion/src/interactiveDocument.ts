import { z } from "zod";
import { fontFallbackIdsSchema, fontStackIds } from "./assets/fontStack";
import { slicedImageSchema } from "./assets/imagePresentation";
import { type Asset, type AudioAsset, assetIdSchema, parseAssetCatalog } from "./assets/model";
import { type AudioDocument, parseAudioDocument } from "./audio/model";
import { type Behavior, parseBehavior } from "./behavior/model";
import { geometryCost } from "./geometry";
import { effectSourcePaints, isPaintedMask } from "./graphics/effectPaint";
import { type Filter, filterDefinitions, filterSchema } from "./graphics/filters";
import {
  type GradientPaints,
  gradientDefinitions,
  gradientPaintsSchema,
  gradientTags,
  hasPattern,
} from "./graphics/gradients";
import { nativeEffectSources } from "./graphics/nativeEffectSources";
import { playbackVectorEffectContext, vectorEffectsSchema } from "./graphics/vectorEffects";
import { type LayoutDocument, parseLayout } from "./layout/model";
import { objectIdSchema } from "./model";
import { type PlaybackDocument, parsePlaybackDocument } from "./playback";
import { rigCost } from "./rig/cost";
import { playbackParameterContext } from "./rig/playbackRig";
import { parseSvgPath } from "./svgPath";
import { svgPrimitivePathData } from "./svgPrimitive";
import {
  type VisualScene,
  visualContentSchema,
  visualSceneSchema,
  visualTagSchema,
} from "./visual/model";
import { semanticSchema } from "./visual/semantics";
import { textDirectionSchema } from "./visual/textDirection";
import { textPathCost } from "./visual/textPath";
import { validateVisualDocument } from "./visual/validation";
export const INTERACTIVE_VERSION = 12;

export const interactiveContentSchema = z.strictObject({
  id: objectIdSchema,
  parentId: objectIdSchema.nullable().optional(),
  isComponent: z.boolean().optional(),
  intrinsic: z
    .strictObject({
      x: z.number().min(-100000).max(100000),
      y: z.number().min(-100000).max(100000),
      width: z.number().positive().max(100000),
      height: z.number().positive().max(100000),
    })
    .optional(),
  name: z.string().trim().min(1).max(120),
  assetId: assetIdSchema.optional(),
  imageSlice: slicedImageSchema.optional(),
  gradients: gradientPaintsSchema.optional(),
  filter: filterSchema.optional(),
  effects: vectorEffectsSchema.optional(),
  visual: visualContentSchema.optional(),
  fontAssetId: assetIdSchema.optional(),
  fontFallbackIds: fontFallbackIdsSchema.optional(),
  semantics: semanticSchema.optional(),
  tag: visualTagSchema,
  lineHeight: z.number().min(0.25).max(10).optional(),
  textDirection: textDirectionSchema.optional(),
});
const interactiveSchema = z.strictObject({
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
    z.literal(INTERACTIVE_VERSION),
  ]),
  playback: z.unknown(),
  behavior: z.unknown(),
  content: z.array(interactiveContentSchema).max(2000),
  layout: z.unknown().optional(),
  audio: z.unknown().optional(),
  audioAssets: z.unknown().optional(),
  assets: z.unknown().optional(),
  visual: visualSceneSchema.optional(),
  animationId: z
    .string()
    .regex(/^[a-z]+-[\w-]{1,100}$/)
    .optional(),
  components: z
    .array(
      z.strictObject({
        rootId: objectIdSchema,
        instanceId: objectIdSchema,
        instancePath: z.array(objectIdSchema).min(1).max(8),
        speed: z.number().min(0.01).max(100).default(1),
        document: z.unknown(),
      }),
    )
    .max(128)
    .optional(),
});
export interface InteractiveComponent {
  rootId: string;
  instanceId: string;
  instancePath: string[];
  speed: number;
  document: InteractiveDocument;
}
export interface InteractiveDocument {
  version: z.infer<typeof interactiveSchema>["version"];
  playback: PlaybackDocument;
  behavior: Behavior;
  content: z.infer<typeof interactiveContentSchema>[];
  layout?: LayoutDocument;
  audio?: AudioDocument;
  /** Shared root-only PCM catalog. Child scopes contain bindings, not blobs. */
  audioAssets?: AudioAsset[];
  /** Portable v6: one root catalog for PNG/font/PCM; scopes hold only IDs. */
  assets?: Asset[];
  visual?: VisualScene;
  animationId?: string;
  components?: InteractiveComponent[];
}
/** Bound the whole expanded scene before validating individual scopes. Shared
 * input references are permitted; cycles and oversized structures are not. */
function preflight(input: unknown) {
  let work = 0,
    text = 0;
  const ancestors = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (++work > 2_000_000 || depth > 100)
      throw new Error("Documento interativo excede o orçamento estrutural.");
    if (typeof value === "string") {
      text += value.length;
      if (text > 8_000_000) throw new Error("Documento interativo excede o orçamento textual.");
    } else if (value && typeof value === "object") {
      if (ancestors.has(value)) throw new Error("Documento interativo contém ciclo estrutural.");
      ancestors.add(value);
      if (Array.isArray(value)) {
        if (value.length > 100000) throw new Error("Coleção interativa excede o orçamento.");
        for (const child of value) visit(child, depth + 1);
      } else {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
          throw new Error("Documento requer objetos de dados simples.");
        const entries = Object.entries(value);
        if (entries.length > 10000) throw new Error("Objeto interativo excede o orçamento.");
        for (const [key, child] of entries) {
          visit(key, depth + 1);
          visit(child, depth + 1);
        }
      }
      ancestors.delete(value);
    }
  }
  visit(input, 0);
}
export function parseInteractiveDocument(input: unknown): InteractiveDocument {
  preflight(input);
  const ids = new Set<string>(),
    gradients: GradientPaints[] = [],
    filters: Filter[] = [],
    audioById = new Map<string, Asset>(),
    assetReferences = new Set<string>(),
    absolutePaths = new Set<string>();
  let portable = false,
    rootVersion: InteractiveDocument["version"] | undefined,
    scopes = 0,
    graphicNodes = 0,
    audioBindings = 0,
    effectReferences = 0,
    tracks = 0,
    keys = 0,
    logic = 0,
    bones = 0,
    constraints = 0,
    vertices = 0,
    controls = 0,
    deformers = 0;
  function parse(
    input: unknown,
    depth: number,
    parentPath: string[] = [],
    parentSpeed = 1,
  ): InteractiveDocument {
    if (depth > 8 || ++scopes > 128)
      throw new Error("Cena excede o orçamento de componentes interativos.");
    const parsed = interactiveSchema.parse(input, { jitless: true }),
      playback = parsePlaybackDocument(parsed.playback),
      content = new Map(parsed.content.map((object) => [object.id, object]));
    if (depth === 0) {
      portable = parsed.version >= 6;
      rootVersion = parsed.version;
    }
    if (parsed.version >= 6 !== portable || (portable && parsed.version !== rootVersion))
      throw new Error("Contrato visual portátil requer raiz/escopos de mesma versão.");
    if (
      parsed.version < 6 &&
      (parsed.assets !== undefined ||
        parsed.visual !== undefined ||
        parsed.content.some((object) => object.visual))
    )
      throw new Error("Conteúdo visual portátil requer blueprint v6.");
    if (parsed.version >= 6 && (playback.version !== 3 || parsed.audioAssets !== undefined))
      throw new Error(
        "Blueprint v6 requer playback espacial v3 e catálogo unificado, sem audioAssets duplicado.",
      );
    let assets: Asset[] | undefined;
    if (parsed.assets !== undefined || parsed.visual !== undefined) {
      if (depth !== 0) throw new Error("Cena e catálogo portátil pertencem somente à raiz.");
      if (parsed.assets === undefined || parsed.visual === undefined)
        throw new Error("Cena portátil requer metadados e catálogo juntos.");
      assets = parseAssetCatalog(parsed.assets);
      for (const asset of assets) {
        audioById.set(asset.id, asset);
        assetReferences.add(asset.id);
      }
    }
    if ((parsed.audio !== undefined || parsed.audioAssets !== undefined) && parsed.version < 3)
      throw new Error("Áudio interativo requer blueprint v3.");
    let audioAssets: AudioAsset[] | undefined;
    if (parsed.audioAssets !== undefined) {
      if (depth !== 0) throw new Error("Recursos de áudio pertencem somente à raiz.");
      audioAssets = [];
      for (const asset of parseAssetCatalog(parsed.audioAssets)) {
        if (asset.kind !== "audio")
          throw new Error("Catálogo de áudio contém recurso incompatível.");
        audioById.set(asset.id, asset);
        assetReferences.add(asset.id);
        audioAssets.push(asset);
      }
    }
    for (const scope of playback.rigScopes ?? []) {
      if (scope.rig.version >= 4 && parsed.version < 11)
        throw new Error("Rig v4 requer blueprint v11.");
      if (scope.rig.version >= 3 && parsed.version < 10)
        throw new Error("Rig v3 requer blueprint v10.");
      for (const trim of scope.rig.trims ?? []) {
        const source = content.get(trim.targetId);
        if (!source?.visual || /[aA]/.test(source.visual.attrs.d ?? ""))
          throw new Error(
            "Trim requer caminho visual sem arcos nativos; converta explicitamente antes.",
          );
      }
      const cost = rigCost(scope.rig);
      vertices += cost.vertices;
      controls += cost.controls;
      deformers += cost.deformers;
      bones += scope.rig.bones.length;
      constraints += scope.rig.constraints.length;
      for (const clip of scope.rig.parameterClips ?? []) {
        tracks += clip.tracks.length;
        keys += clip.tracks.reduce((sum, track) => sum + track.keys.length, 0);
      }
    }
    if (bones > 1000 || constraints > 256)
      throw new Error("Cena interativa excede orçamento agregado de rig.");
    for (const object of playback.objects)
      vertices += (object.geometry ?? []).reduce((sum, contour) => sum + contour.points.length, 0);
    if (vertices > 100000 || controls > 100000 || deformers > 256)
      throw new Error("Cena interativa excede orçamento agregado de deformação/geometria.");
    for (const object of parsed.content) {
      if (object.filter) {
        if (parsed.version < 12) throw new Error("Filtros requerem blueprint v12.");
        filters.push(object.filter);
      }
      if (object.effects && parsed.version < 5)
        throw new Error("Recortes/máscaras requerem blueprint v5.");
      effectReferences += Number(!!object.effects?.clip) + Number(!!object.effects?.mask);
      if (effectReferences > 256) throw new Error("Cena interativa excede 256 recortes/máscaras.");
      if (object.gradients) {
        if (parsed.version < 4 || !gradientTags.has(object.tag))
          throw new Error("Gradiente requer forma/texto e blueprint v4.");
        if (hasPattern(object.gradients) && parsed.version < 12)
          throw new Error("Padrões requerem blueprint v12.");
        gradients.push(object.gradients);
      }
      graphicNodes +=
        1 +
        (object.semantics && object.semantics.kind !== "decorative" && object.semantics.description
          ? 1
          : 0) +
        (object.imageSlice ? 18 : 0) +
        (object.effects?.clip ? 2 : 0) +
        (object.effects?.mask ? 2 : 0);
      if (graphicNodes > 2000) throw new Error("Cena excede orçamento agregado de células SVG.");
      if (object.assetId) assetReferences.add(object.assetId);
      if (object.fontFallbackIds !== undefined && parsed.version < 7)
        throw new Error("Fallback de fontes requer blueprint v7.");
      if (object.semantics !== undefined && parsed.version < 8)
        throw new Error("Semântica configurável requer blueprint v8.");
      for (const id of fontStackIds(object)) assetReferences.add(id);
      if (assetReferences.size > 256)
        throw new Error("Cena excede orçamento agregado de referências a recursos.");
      if (ids.has(object.id)) throw new Error("ID compartilhado por dois escopos interativos.");
      ids.add(object.id);
      if (ids.size > 2000)
        throw new Error("Cena interativa excede o orçamento agregado de objetos.");
    }
    for (const clip of [
      ...playback.motion.animations,
      ...playback.drivers.map((driver) => driver.animation),
    ]) {
      tracks += clip.tracks.length;
      keys += clip.tracks.reduce((sum, track) => sum + track.keys.length, 0);
      for (const drawOrder of clip.drawOrders ?? [])
        for (const key of drawOrder.keys) keys += 1 + key.order.length;
    }
    if (tracks > 12000 || keys > 100000)
      throw new Error("Cena interativa excede o orçamento agregado de animação.");
    if (
      content.size !== parsed.content.length ||
      content.size !== playback.objects.length ||
      playback.objects.some((object) => !content.has(object.id))
    )
      throw new Error("Conteúdo interativo não corresponde aos objetos.");
    const effects = new Map(
      parsed.content.flatMap((object) =>
        object.effects ? [[object.id, object.effects] as const] : [],
      ),
    );
    const primitiveSources = nativeEffectSources(
      parsed.content.map((object) => ({ ...object, attrs: object.visual?.attrs })),
      effects,
    );
    if (primitiveSources.size && parsed.version < 9)
      throw new Error("Primitivas nativas como fontes de efeitos requerem blueprint v9.");
    const geometryIds = new Set(
      playback.objects.filter((object) => object.geometry).map((object) => object.id),
    );
    for (const [id, shape] of primitiveSources)
      if (!geometryIds.has(id)) vertices += geometryCost(parseSvgPath(svgPrimitivePathData(shape)));
    for (const object of parsed.content) vertices += textPathCost(object.visual?.textPath);
    if (vertices > 100000)
      throw new Error("Cena interativa excede geometria agregada incluindo efeitos nativos.");
    if (parsed.version < 12 && [...effects.values()].some((value) => value.mask?.mode))
      throw new Error("Modos de máscara requerem blueprint v12.");
    if (
      parsed.version < 12 &&
      [...playback.motion.animations, ...playback.drivers.map((driver) => driver.animation)].some(
        (clip) => clip.drawOrders,
      )
    )
      throw new Error("Ordem de desenho animável requer blueprint v12.");
    playbackVectorEffectContext(
      playback,
      effects,
      undefined,
      primitiveSources,
      effectSourcePaints(
        parsed.content.map((object) => ({
          ...object,
          parentId: object.parentId ?? null,
          attrs: object.visual?.attrs,
        })),
        new Map([...effects].filter(([, value]) => isPaintedMask(value))),
      ),
    );
    if (effects.size || portable)
      for (const object of playback.objects) {
        const details = content.get(object.id);
        if (!details || details.tag !== object.tag || details.parentId !== object.parentId)
          throw new Error("Hierarquia visual do efeito não corresponde ao playback.");
      }
    for (const value of content.values())
      if (
        (value.tag === "image") !== (value.assetId !== undefined) ||
        (value.assetId && parsed.version < 3)
      )
        throw new Error("Referência de imagem interativa requer blueprint v3 e assetId tipado.");
      else if (value.fontAssetId && (value.tag !== "text" || parsed.version < 3))
        throw new Error("Referência de fonte requer texto e blueprint v3.");
      else if (value.imageSlice && (value.tag !== "image" || parsed.version < 4))
        throw new Error("Nine-slice requer imagem e blueprint v4.");
      else if (
        (value.isComponent && (value.tag !== "g" || !value.intrinsic)) ||
        (!value.isComponent && value.intrinsic)
      )
        throw new Error("Medidas intrínsecas requerem instância de componente válida.");
      else if (value.lineHeight !== undefined && value.tag !== "text")
        throw new Error("Layout interativo requer texto.");
      else if (value.textDirection && (value.tag !== "text" || parsed.version < 12))
        throw new Error("Direção automática requer texto e blueprint v12.");
      else if (value.visual?.textPath && parsed.version < 12)
        throw new Error("Texto em caminho requer blueprint v12.");
    const authored = new Map(
      playback.sources
        .filter((source) => source.instancePath.length === 0)
        .flatMap((source) => {
          const object = content.get(source.id);
          return object ? [[source.id, object] as const] : [];
        }),
    );
    if (authored.size === 0 && playback.objects.length > 0)
      throw new Error("Conteúdo interativo requer mapa de identidades de autoria.");
    const behavior = parseBehavior(
      parsed.behavior,
      authored,
      playback.motion.animations,
      playbackParameterContext(playback),
    );
    const audio =
      parsed.audio === undefined
        ? undefined
        : parseAudioDocument(
            parsed.audio,
            audioById,
            new Set(behavior.events.map((event) => event.id)),
          );
    audioBindings += audio?.bindings.length ?? 0;
    if (audioBindings > 256)
      throw new Error("Cena excede orçamento agregado de vínculos de áudio.");
    logic +=
      behavior.inputs.length +
      behavior.bindings.length +
      behavior.listeners.length +
      behavior.events.length +
      behavior.machines.reduce(
        (sum, machine) =>
          sum +
          machine.layers.reduce(
            (sum, layer) => sum + layer.states.length + layer.transitions.length,
            0,
          ),
        0,
      );
    if (logic > 20000) throw new Error("Cena interativa excede o orçamento agregado de lógica.");
    if (
      parsed.animationId &&
      (!playback.motion.animations.some((clip) => clip.id === parsed.animationId) ||
        behavior.machines.length > 0)
    )
      throw new Error("Clip inicial requer cena sem máquina e animação válida.");
    let layout: ReturnType<typeof parseLayout> | undefined;
    if (parsed.layout !== undefined) {
      const objects = new Map<
        string,
        { tag: string; parentId: string | null; isComponent?: boolean }
      >();
      for (const [id, value] of authored) {
        if (value.parentId === undefined)
          throw new Error("Layout requer hierarquia explícita do conteúdo.");
        objects.set(id, {
          tag: value.tag,
          parentId: value.parentId,
          isComponent: value.isComponent,
        });
      }
      layout = parseLayout(parsed.layout, objects);
    }
    if (parsed.version === 1 && parsed.components?.length)
      throw new Error("Componentes independentes requerem documento interativo v2.");
    const roots = new Set<string>(),
      paths = new Set<string>();
    const components = parsed.components?.map((component) => {
      const root = content.get(component.rootId),
        instance = content.get(component.instanceId),
        identity = playback.sources.find((source) => source.id === component.instanceId),
        path = JSON.stringify(component.instancePath);
      if (
        root?.tag !== "svg" ||
        root.parentId !== component.instanceId ||
        !instance?.isComponent ||
        !identity ||
        JSON.stringify([...identity.instancePath, identity.objectId]) !== path ||
        roots.has(component.rootId) ||
        paths.has(path)
      )
        throw new Error("Raiz/caminho de componente interativo inválido.");
      roots.add(component.rootId);
      paths.add(path);
      const absolute = [...parentPath, ...component.instancePath],
        key = JSON.stringify(absolute),
        speed = parentSpeed * component.speed;
      if (absolute.length > 8 || absolutePaths.has(key) || speed > 100)
        throw new Error("Caminho/velocidade agregada de componente inválido.");
      absolutePaths.add(key);
      return { ...component, document: parse(component.document, depth + 1, absolute, speed) };
    });
    return {
      version: parsed.version,
      playback,
      behavior,
      content: parsed.content,
      ...(parsed.animationId ? { animationId: parsed.animationId } : {}),
      ...(layout ? { layout } : {}),
      ...(audio ? { audio } : {}),
      ...(audioAssets ? { audioAssets } : {}),
      ...(assets ? { assets } : {}),
      ...(parsed.visual ? { visual: parsed.visual } : {}),
      ...(components?.length ? { components } : {}),
    };
  }
  const result = parse(input, 0);
  gradientDefinitions(gradients);
  filterDefinitions(filters);
  validateVisualDocument(result);
  return result;
}

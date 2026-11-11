import type { Animation } from "@informach/edi-motion";
import type { Artboard, Project } from "./project";

/**
 * Artboards of another project brought into this one, with what makes them work: the artboards
 * their components show, the animations that move them (only their tracks), and the images, fonts
 * and sounds they use. Ids that already exist here get new ones, everywhere they are cited.
 */

const ARTBOARD_LIMIT = 100;
const ANIMATION_LIMIT = 100;

/** Every string in a value (deep), keys of objects included. */
function strings(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, into);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      strings(item, into);
    }
  return into;
}

/** The values of every `id` property in a value (deep): the things it defines. */
function definedIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) definedIds(item, into);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      if (key === "id" && typeof item === "string") into.add(item);
      else definedIds(item, into);
    }
  return into;
}

/** The value with every string (and object key) found in `map` replaced. */
function rename<T>(value: T, map: Map<string, string>): T {
  if (typeof value === "string") return (map.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => rename(item, map)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [map.get(key) ?? key, rename(item, map)]),
    ) as T;
  return value;
}

/** The chosen artboards and every artboard they show as a component, in the source's order. */
function withComponents(source: Project, ids: readonly string[]): Artboard[] {
  const boards = new Map(source.artboards.map((board) => [board.id, board]));
  const chosen = new Set<string>();
  const queue = [...ids];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const board = boards.get(id);
    if (!board) throw new Error("Prancheta não encontrada no projeto escolhido.");
    if (chosen.has(id)) continue;
    chosen.add(id);
    for (const cited of strings(board))
      if (boards.has(cited) && !chosen.has(cited)) queue.push(cited);
  }
  return source.artboards.filter((board) => chosen.has(board.id));
}

/** The source's animations, each with only what touches `defined`; the ones left empty go. */
function animationsFor(source: Project, defined: Set<string>, cited: Set<string>): Animation[] {
  return source.motion.animations.flatMap((animation) => {
    const tracks = animation.tracks.filter((track) => defined.has(track.targetId));
    const drawOrders = animation.drawOrders?.filter(
      (order) =>
        (order.scopeId === null || defined.has(order.scopeId)) &&
        order.keys.every((key) => key.order.every((id) => defined.has(id))),
    );
    if (!tracks.length && !drawOrders?.length && !cited.has(animation.id)) return [];
    const copy: Animation = { ...structuredClone(animation), tracks: structuredClone(tracks) };
    if (drawOrders?.length) copy.drawOrders = structuredClone(drawOrders);
    else delete copy.drawOrders;
    return [copy];
  });
}

/** `name`, or `name 2`, `name 3`… when it is taken. */
function freeName(name: string, taken: Set<string>): string {
  let next = name;
  for (let n = 2; taken.has(next); n++) next = `${name.slice(0, 110)} ${n}`;
  taken.add(next);
  return next;
}

export interface ImportableArtboard {
  id: string;
  name: string;
  width: number;
  height: number;
  /** The animations that move it. */
  animations: string[];
  /** Other artboards that come with it (its components). */
  components: string[];
  componentIds: string[];
}

/** What the import dialog lists for each artboard of the source. */
export function importableArtboards(source: Project): ImportableArtboard[] {
  return source.artboards.map((board) => {
    const boards = withComponents(source, [board.id]);
    const defined = definedIds(boards);
    return {
      id: board.id,
      name: board.name,
      width: board.scene.viewBox[2],
      height: board.scene.viewBox[3],
      animations: animationsFor(source, defined, strings(boards)).map((a) => a.name),
      components: boards.filter((b) => b.id !== board.id).map((b) => b.name),
      componentIds: boards.filter((b) => b.id !== board.id).map((b) => b.id),
    };
  });
}

export interface ImportResult {
  /** The new ids of the chosen artboards (the components that came along are not listed). */
  artboardIds: string[];
  artboards: number;
  animations: number;
  assets: number;
  /** How many ids got a new one because the project already had them. */
  renamed: number;
}

/** Brings `ids` of `source` into `target` (changed in place). */
export function importArtboards(
  target: Project,
  source: Project,
  ids: readonly string[],
): ImportResult {
  if (!ids.length) throw new Error("Escolha ao menos uma prancheta.");
  const boards = withComponents(source, ids).map((board) => {
    const copy = structuredClone(board);
    // The lesson stretches name animations of the other project's lesson link: not this one's.
    delete copy.lessonClips;
    return copy;
  });
  const defined = definedIds(boards);
  const animations = animationsFor(source, defined, strings(boards));
  if (target.artboards.length + boards.length > ARTBOARD_LIMIT)
    throw new Error(
      `O projeto ficaria com ${target.artboards.length + boards.length} pranchetas; o limite é ${ARTBOARD_LIMIT}.`,
    );
  if (target.motion.animations.length + animations.length > ANIMATION_LIMIT)
    throw new Error(
      `O projeto ficaria com ${target.motion.animations.length + animations.length} animações; o limite é ${ANIMATION_LIMIT}.`,
    );
  // Images, fonts and sounds are named by their content: one already here is the same file.
  const cited = strings([boards, animations]);
  const have = new Set(target.assets.map((asset) => asset.id));
  const assets = source.assets.filter((asset) => cited.has(asset.id) && !have.has(asset.id));
  // Ids defined both here and in what comes get new ones (projects made from the same file, or
  // by the assistant, share ids like "artboard-main" or "track-mascote-y").
  const taken = definedIds(target);
  const map = new Map<string, string>();
  for (const id of definedIds([boards, animations]))
    if (taken.has(id) && !id.startsWith("asset-"))
      map.set(id, `${id.match(/^[a-z]+/)?.[0] ?? "id"}-${crypto.randomUUID()}`);
  const newBoards = rename(boards, map);
  const newAnimations = rename(animations, map);
  const boardNames = new Set(target.artboards.map((board) => board.name));
  for (const board of newBoards) board.name = freeName(board.name, boardNames);
  const animationNames = new Set(target.motion.animations.map((animation) => animation.name));
  for (const animation of newAnimations) animation.name = freeName(animation.name, animationNames);
  target.artboards.push(...newBoards);
  target.motion.animations.push(...newAnimations);
  target.assets.push(...structuredClone(assets));
  return {
    artboardIds: ids.map((id) => map.get(id) ?? id),
    artboards: newBoards.length,
    animations: newAnimations.length,
    assets: assets.length,
    renamed: map.size,
  };
}

import { KIND_LABEL } from "./annotation.ts";
import { ASSET_RUNTIME_FIELDS } from "./history.ts";
import { sourceEnd, timelineAt } from "./timeline.ts";
import { TRANSITIONS } from "./transitions.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";

/**
 * What an AI edit (or a step of "Preparar aula") would change, as items the person reads and
 * accepts or rejects one by one before anything reaches the project (the draft, state/project.ts).
 * Each item holds the field changes of one or a few entities (clip, track, media, project), so it
 * can be applied to the project as it is now or left out on its own.
 */

export type DiffKind =
  | "clip-created"
  | "clip-removed"
  | "clip-moved"
  | "clip-trimmed"
  | "clip-changed"
  | "annotation-created"
  | "annotation-changed"
  | "zoom"
  | "transition"
  | "palette"
  | "track"
  | "media"
  | "setting";

export type DiffEntity = "clip" | "track" | "asset" | "project";

/**
 * One entity going from `before` to `after`. null on one side is a creation or a removal (the
 * whole object on the other side); otherwise both hold only the `fields` that change, and a field
 * missing from one side is a field that is not set there.
 */
export interface Patch {
  entity: DiffEntity;
  /** Clip, track or media id; "" for the project itself. */
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  fields?: string[];
  /** A track created at this position (top to bottom). */
  index?: number;
}

export interface DiffItem {
  id: string;
  kind: DiffKind;
  /** In Portuguese, for the review bar. */
  label: string;
  /** Timeline second it is about, to go and listen. */
  at?: number;
  /** Clips it changes, highlighted on the timeline. */
  clips: string[];
  /** Entities it patches ("clip:<id>", "track:<id>", "asset:<id>", "project:<field>"). */
  keys: string[];
  /** Entities created by another item that this one cannot stand without. */
  needs: string[];
  patches: Patch[];
  status: "pending" | "rejected";
}

/** Deep equality of JSON values (the project is plain JSON; key order does not matter). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => same(v, b[i]))
    );
  const set = (o: object): string[] =>
    Object.keys(o).filter((k) => Reflect.get(o, k) !== undefined);
  const ka = set(a);
  const kb = set(b);
  return ka.length === kb.length && ka.every((k) => same(Reflect.get(a, k), Reflect.get(b, k)));
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const secs = (s: number): string => `${Math.abs(s).toFixed(1).replace(".", ",")} s`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Project fields that are not edits a draft carries (review state, history, timestamps). */
const NOT_EDITS = new Set([
  "assets",
  "tracks",
  "clips",
  "updatedAt",
  "createdAt",
  "exportedAt",
  "stats",
  "proposals",
  "voiceMasters",
  "prepare",
  "reviewedSeams",
  "version",
  "id",
]);
const RUNTIME = new Set<string>(ASSET_RUNTIME_FIELDS);

const SETTING_LABEL: Record<string, string> = {
  captions: "Legenda",
  captionBreaks: "Quebras da legenda",
  cueStyles: "Estilo de legendas",
  cleanup: "Escolhas da limpeza",
  publish: "Dados de publicação",
  script: "Roteiro",
  protected: "Trechos protegidos",
  settings: "Formato da aula",
  name: "Nome da aula",
  course: "Curso",
};

const CLIP_GROUPS: { kind: DiffKind; fields: string[] }[] = [
  { kind: "clip-moved", fields: ["start", "trackId"] },
  { kind: "clip-trimmed", fields: ["in", "duration", "speed"] },
  { kind: "annotation-changed", fields: ["annotation", "assetId"] },
  { kind: "transition", fields: ["transition"] },
  { kind: "zoom", fields: ["zoomLayer"] },
];

const OTHER_LABEL: Record<string, string> = {
  transform: "posição",
  keyframes: "movimento",
  fadeIn: "entrada",
  fadeOut: "saída",
  enter: "entrada",
  exit: "saída",
  volume: "volume",
  denoise: "redução de ruído",
  mutedFor: "som do apresentador",
  insertId: "inserção do roteiro",
  assetId: "mídia",
};

const keysOf = (...objects: (object | undefined)[]): string[] => [
  ...new Set(objects.flatMap((o) => (o ? Object.keys(o) : []))),
];

const pick = (o: object, fields: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = Reflect.get(o, f);
    if (v !== undefined) out[f] = v;
  }
  return out;
};

const changedFields = (a: object, b: object, skip: ReadonlySet<string> = new Set()): string[] =>
  keysOf(a, b).filter((k) => !skip.has(k) && !same(Reflect.get(a, k), Reflect.get(b, k)));

const changePatch = (
  entity: DiffEntity,
  id: string,
  a: object,
  b: object,
  fields: string[],
): Patch => ({ entity, id, before: pick(a, fields), after: pick(b, fields), fields });

let counter = 0;
const itemId = (): string => `d${(++counter).toString(36)}${Date.now().toString(36).slice(-4)}`;

const item = (
  kind: DiffKind,
  label: string,
  patches: Patch[],
  extra: { at?: number; clips?: string[]; needs?: string[] } = {},
): DiffItem => ({
  id: itemId(),
  kind,
  label,
  ...(extra.at !== undefined ? { at: extra.at } : {}),
  clips: extra.clips ?? [],
  keys: [
    ...new Set(
      patches.flatMap((p) =>
        p.entity === "project" ? (p.fields ?? []).map((f) => `project:${f}`) : [key(p)],
      ),
    ),
  ],
  needs: extra.needs ?? [],
  patches,
  status: "pending",
});

const key = (p: Pick<Patch, "entity" | "id">): string => `${p.entity}:${p.id}`;

/** How a clip is named in the review: the annotation's text, or its media. */
function clipName(c: Clip, assets: Map<string, Asset>): string {
  if (c.annotation) {
    const text = c.annotation.text?.replace(/\s+/g, " ").trim();
    const kind = KIND_LABEL[c.annotation.kind] ?? "Anotação";
    return text ? `${kind} "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : kind;
  }
  if (c.zoomLayer) return "Camada de zoom";
  return assets.get(c.assetId)?.name ?? "clipe";
}

/**
 * The readable changes from `a` to `b`: clips created, removed, moved or trimmed, annotations
 * created or changed, zooms, transitions, the palette, tracks, media and lesson settings. Clips
 * that only moved by the same amount are one item; the media a new clip shows comes with it.
 */
export function diffProjects(a: Project, b: Project): DiffItem[] {
  const out: DiffItem[] = [];
  const assetsA = new Map(a.assets.map((x) => [x.id, x]));
  const assetsB = new Map(b.assets.map((x) => [x.id, x]));
  const tracksA = new Map(a.tracks.map((t) => [t.id, t]));
  const tracksB = new Map(b.tracks.map((t) => [t.id, t]));
  const clipsA = new Map(a.clips.map((c) => [c.id, c]));
  const clipsB = new Map(b.clips.map((c) => [c.id, c]));
  const names = new Map([...assetsA, ...assetsB]);

  // The lesson's own settings.
  const fields = changedFields(a, b, NOT_EDITS);
  const paletteFields: string[] = fields.filter((f) => f === "palette" || f === "paletteFonts");
  if (paletteFields.length)
    out.push(
      item(
        "palette",
        `Paleta ${b.palette ?? "EdiAula"}${b.paletteFonts ? ", com as fontes do tema" : a.paletteFonts ? ", com a fonte padrão" : ""}`,
        [changePatch("project", "", a, b, paletteFields)],
      ),
    );
  for (const f of fields.filter((x) => !paletteFields.includes(x))) {
    const label =
      f === "captions"
        ? `Legenda ${b.captions?.burn ? "gravada no vídeo" : "fora do vídeo"}${b.captions ? `, ${b.captions.size.toFixed(1).replace(".", ",")}% da altura` : ""}`
        : `${SETTING_LABEL[f] ?? f} mudou`;
    out.push(item("setting", label, [changePatch("project", "", a, b, [f])]));
  }

  // Tracks.
  b.tracks.forEach((t, index) => {
    if (!tracksA.has(t.id))
      out.push(
        item("track", `Faixa nova: ${t.name}`, [
          { entity: "track", id: t.id, before: null, after: { ...t }, index },
        ]),
      );
  });
  for (const t of a.tracks) {
    const now = tracksB.get(t.id);
    if (!now) {
      out.push(
        item("track", `Faixa removida: ${t.name}`, [
          { entity: "track", id: t.id, before: { ...t }, after: null },
        ]),
      );
      continue;
    }
    const changed = changedFields(t, now);
    if (!changed.length) continue;
    const what = changed
      .map((f) =>
        f === "music"
          ? now.music
            ? "marcada como música"
            : "deixou de ser música"
          : f === "muted"
            ? now.muted
              ? "sem som"
              : "com som"
            : f === "hidden"
              ? now.hidden
                ? "oculta"
                : "visível"
              : f === "locked"
                ? now.locked
                  ? "travada"
                  : "destravada"
                : f === "name"
                  ? `agora se chama ${now.name}`
                  : f,
      )
      .join(", ");
    out.push(
      item("track", `Faixa ${t.name}: ${what}`, [changePatch("track", t.id, t, now, changed)]),
    );
  }

  // Clips created: with the media they bring, depending on a track created for them.
  const newAssets = new Set(b.assets.filter((x) => !assetsA.has(x.id)).map((x) => x.id));
  const claimed = new Set<string>();
  const assetPatch = (id: string): Patch[] => {
    if (!newAssets.has(id) || claimed.has(id)) return [];
    claimed.add(id);
    return [{ entity: "asset", id, before: null, after: { ...assetsB.get(id) } }];
  };
  const needsOf = (c: Clip): string[] => [
    ...(!tracksA.has(c.trackId) ? [`track:${c.trackId}`] : []),
    ...(newAssets.has(c.assetId) ? [`asset:${c.assetId}`] : []),
  ];
  // Media changes that belong to a clip's annotation (its redrawn picture).
  const pictureOf = new Map<string, string>();
  for (const c of b.clips)
    if (c.annotation && (!clipsA.has(c.id) || !same(clipsA.get(c.id)?.annotation, c.annotation)))
      pictureOf.set(c.assetId, c.id);
  const assetChanges = new Map<string, Patch>();
  for (const x of b.assets) {
    const before = assetsA.get(x.id);
    if (!before) continue;
    const changed = changedFields(before, x, RUNTIME);
    if (changed.length) assetChanges.set(x.id, changePatch("asset", x.id, before, x, changed));
  }
  const usedPicture = (assetId: string): Patch[] => {
    const p = assetChanges.get(assetId);
    if (!p || !pictureOf.has(assetId)) return [];
    assetChanges.delete(assetId);
    return [p];
  };

  for (const c of b.clips) {
    if (clipsA.has(c.id)) continue;
    const patches = [
      ...assetPatch(c.assetId),
      ...usedPicture(c.assetId),
      { entity: "clip" as const, id: c.id, before: null, after: { ...c } },
    ];
    const kind: DiffKind = c.annotation
      ? "annotation-created"
      : c.zoomLayer
        ? "zoom"
        : "clip-created";
    const label =
      kind === "annotation-created"
        ? `${clipName(c, names)} em ${clock(c.start)}`
        : kind === "zoom"
          ? `Camada de zoom em ${clock(c.start)}, ${secs(c.duration)}`
          : `Clipe novo: ${clipName(c, names)} em ${clock(c.start)}`;
    out.push(
      item(kind, label, patches, {
        at: c.start,
        clips: [c.id],
        needs: needsOf(c).filter((k) => !patches.some((p) => key(p) === k)),
      }),
    );
  }
  for (const c of a.clips) {
    if (clipsB.has(c.id)) continue;
    out.push(
      item(
        "clip-removed",
        `Clipe removido: ${clipName(c, names)} de ${clock(c.start)}`,
        [{ entity: "clip", id: c.id, before: { ...c }, after: null }],
        { at: c.start, clips: [c.id] },
      ),
    );
  }

  // Clips changed, one item per kind of change; pure moves by the same amount are grouped.
  const shifts = new Map<
    string,
    { delta: number; patches: Patch[]; clips: string[]; at: number }
  >();
  for (const c of b.clips) {
    const before = clipsA.get(c.id);
    if (!before) continue;
    const changed = changedFields(before, c);
    if (!changed.length) continue;
    const left = new Set(changed);
    for (const group of CLIP_GROUPS) {
      const f = group.fields.filter((x) => left.has(x));
      // The picture of a clip is part of its annotation only when it is an annotation.
      if (group.kind === "annotation-changed" && !c.annotation && !before.annotation) continue;
      if (!f.length) continue;
      for (const x of f) left.delete(x);
      const patch = changePatch("clip", c.id, before, c, f);
      if (group.kind === "clip-moved" && !f.includes("trackId")) {
        const delta = Math.round((c.start - before.start) * 1000) / 1000;
        const k = String(delta);
        const s = shifts.get(k) ?? { delta, patches: [], clips: [], at: before.start };
        s.patches.push(patch);
        s.clips.push(c.id);
        s.at = Math.min(s.at, before.start);
        shifts.set(k, s);
        continue;
      }
      const label =
        group.kind === "clip-moved"
          ? `${clipName(c, names)} foi para a faixa ${tracksB.get(c.trackId)?.name ?? c.trackId}`
          : group.kind === "clip-trimmed"
            ? `${clipName(c, names)} aparado: ${secs(before.duration)} para ${secs(c.duration)}`
            : group.kind === "annotation-changed"
              ? `${clipName(c, names)} mudou`
              : group.kind === "transition"
                ? c.transition
                  ? `Transição ${TRANSITIONS.find((t) => t.id === c.transition?.kind)?.label ?? c.transition.kind} em ${clock(c.start)}`
                  : `Transição removida em ${clock(c.start)}`
                : "Camada de zoom mudou";
      const picture =
        group.kind === "annotation-changed"
          ? [...assetPatch(c.assetId), ...usedPicture(c.assetId)]
          : [];
      out.push(
        item(group.kind, label, [...picture, patch], {
          at: c.start,
          clips: [c.id],
          needs: needsOf(c),
        }),
      );
    }
    if (left.size) {
      const f = [...left];
      const what = [...new Set(f.map((x) => OTHER_LABEL[x] ?? x))].join(", ");
      out.push(
        item(
          "clip-changed",
          `${clipName(c, names)}: ${what}`,
          [changePatch("clip", c.id, before, c, f)],
          { at: c.start, clips: [c.id] },
        ),
      );
    }
  }
  for (const s of shifts.values()) {
    const only = s.clips.length === 1 ? clipsB.get(s.clips[0]) : undefined;
    const side = s.delta > 0 ? "a direita" : "a esquerda";
    out.push(
      item(
        "clip-moved",
        only
          ? `${clipName(only, names)} andou ${secs(s.delta)} para ${side}`
          : `${plural(s.clips.length, "clipe", "clipes")} a partir de ${clock(s.at)} andaram ${secs(s.delta)} para ${side}`,
        s.patches,
        { at: s.at, clips: s.clips },
      ),
    );
  }

  // Media: zooms, other changes, media brought in without a clip.
  for (const [id, patch] of assetChanges) {
    const x = assetsB.get(id);
    if (!x) continue;
    // Every clip of the media shows the change: those are highlighted.
    const shown = b.clips.filter((c) => c.assetId === id);
    const clips = shown.map((c) => c.id);
    if (patch.fields?.length === 1 && patch.fields[0] === "zooms") {
      const auto = (x.zooms ?? []).filter((z) => z.auto).length;
      // Where the first new zoom shows on the timeline, to go and listen.
      const known = new Set((assetsA.get(id)?.zooms ?? []).map((z) => JSON.stringify(z)));
      const first = (x.zooms ?? [])
        .filter((z) => !known.has(JSON.stringify(z)))
        .sort((p, q) => p.start - q.start)[0];
      const through = first && shown.find((c) => first.start >= c.in && first.start < sourceEnd(c));
      out.push(
        item(
          "zoom",
          `Zoom em ${x.name}: ${plural((x.zooms ?? []).length, "zoom", "zooms")}${auto ? `, ${auto} automático${auto === 1 ? "" : "s"}` : ""}`,
          [patch],
          {
            clips,
            ...(first && through ? { at: timelineAt(through, first.start) } : {}),
          },
        ),
      );
    } else
      out.push(
        item(
          "media",
          patch.fields?.includes("cursorFx")
            ? `Cursor de ${x.name} ajustado`
            : patch.fields?.includes("key")
              ? `Remoção de fundo de ${x.name}`
              : `${x.name} mudou`,
          [patch],
          { clips, ...(shown.length ? { at: Math.min(...shown.map((c) => c.start)) } : {}) },
        ),
      );
  }
  for (const id of newAssets) {
    if (claimed.has(id)) continue;
    out.push(item("media", `Mídia nova: ${assetsB.get(id)?.name ?? id}`, assetPatch(id)));
  }
  for (const x of a.assets)
    if (!assetsB.has(x.id))
      out.push(
        item("media", `Mídia removida: ${x.name}`, [
          { entity: "asset", id: x.id, before: { ...x }, after: null },
        ]),
      );

  const rank = (i: DiffItem): number =>
    i.kind === "palette" || i.kind === "setting" ? -2 : i.kind === "track" ? -1 : (i.at ?? 1e9);
  return out.sort((x, y) => rank(x) - rank(y));
}

/** The working copy of a project while patches are applied (maps, rebuilt once at the end). */
interface Work {
  project: Project;
  fields: Map<string, unknown>;
  tracks: Track[];
  assets: Map<string, Asset>;
  clips: Map<string, Clip>;
  clipOrder: string[];
  assetOrder: string[];
}

const work = (p: Project): Work => ({
  project: p,
  fields: new Map(),
  tracks: [...p.tracks],
  assets: new Map(p.assets.map((x) => [x.id, x])),
  clips: new Map(p.clips.map((c) => [c.id, c])),
  clipOrder: p.clips.map((c) => c.id),
  assetOrder: p.assets.map((x) => x.id),
});

const fieldOf = (w: Work, f: string): unknown =>
  w.fields.has(f) ? w.fields.get(f) : Reflect.get(w.project, f);

function current(w: Work, p: Patch): object | undefined {
  if (p.entity === "clip") return w.clips.get(p.id);
  if (p.entity === "asset") return w.assets.get(p.id);
  if (p.entity === "track") return w.tracks.find((t) => t.id === p.id);
  return Object.fromEntries((p.fields ?? []).map((f) => [f, fieldOf(w, f)]));
}

const has = (v: unknown, keys: readonly string[], type: "string" | "number" | "boolean"): boolean =>
  !!v && typeof v === "object" && keys.every((k) => typeof Reflect.get(v, k) === type);

/** What a created clip, track or media must at least be (the patches come from a project). */
const isClip = (v: unknown): v is Clip =>
  has(v, ["id", "assetId", "trackId"], "string") &&
  has(v, ["start", "in", "duration", "volume"], "number");
const isTrack = (v: unknown): v is Track =>
  has(v, ["id", "kind", "name"], "string") && has(v, ["muted", "hidden", "locked"], "boolean");
const isAsset = (v: unknown): v is Asset =>
  has(v, ["id", "name", "path", "kind", "proxyStatus"], "string") &&
  has(v, ["duration", "width", "height", "fps", "size"], "number") &&
  has(v, ["hasVideo", "hasAudio"], "boolean");

const whole = (p: Patch): boolean =>
  p.entity === "clip"
    ? isClip(p.after)
    : p.entity === "track"
      ? isTrack(p.after)
      : p.entity === "asset"
        ? isAsset(p.after)
        : true;

/** Whether `p` can go from its `before` to its `after` on the project as it is in `w`. */
function fits(w: Work, p: Patch): boolean {
  const now = current(w, p);
  if (p.before === null) return whole(p) && (!now || same(now, p.after));
  if (p.after === null) return !now || same(now, p.before);
  if (!now) return false;
  return (p.fields ?? []).every(
    (f) => same(Reflect.get(now, f), p.before?.[f]) || same(Reflect.get(now, f), p.after?.[f]),
  );
}

/** `now` with the patch's fields set as they are after it (a field not set there is removed). */
function merged<T extends object>(now: T, p: Patch): T {
  const out = { ...now };
  for (const f of p.fields ?? []) {
    const v = p.after?.[f];
    if (v === undefined) Reflect.deleteProperty(out, f);
    else Reflect.set(out, f, v);
  }
  return out;
}

function writeEntity<T extends object>(
  map: Map<string, T>,
  order: string[],
  p: Patch,
  is: (v: unknown) => v is T,
): void {
  if (p.after === null) map.delete(p.id);
  else if (p.before === null) {
    if (!is(p.after)) return;
    if (!map.has(p.id)) order.push(p.id);
    map.set(p.id, { ...p.after });
  } else {
    const now = map.get(p.id);
    if (now) map.set(p.id, merged(now, p));
  }
}

function write(w: Work, p: Patch): void {
  if (p.entity === "project") {
    for (const f of p.fields ?? []) w.fields.set(f, p.after?.[f]);
    return;
  }
  if (p.entity === "track") {
    const at = w.tracks.findIndex((t) => t.id === p.id);
    if (p.after === null) {
      if (at >= 0) w.tracks.splice(at, 1);
    } else if (p.before === null) {
      if (at < 0 && isTrack(p.after))
        w.tracks.splice(Math.min(p.index ?? 0, w.tracks.length), 0, { ...p.after });
    } else if (at >= 0) w.tracks[at] = merged(w.tracks[at], p);
    return;
  }
  if (p.entity === "clip") writeEntity(w.clips, w.clipOrder, p, isClip);
  else writeEntity(w.assets, w.assetOrder, p, isAsset);
}

function done(w: Work): Project {
  const out: Project = {
    ...w.project,
    tracks: w.tracks,
    assets: w.assetOrder.flatMap((id) => {
      const x = w.assets.get(id);
      return x ? [x] : [];
    }),
    clips: [...new Set(w.clipOrder)].flatMap((id) => {
      const c = w.clips.get(id);
      return c ? [c] : [];
    }),
  };
  for (const [f, v] of w.fields) {
    if (v === undefined) Reflect.deleteProperty(out, f);
    else Reflect.set(out, f, v);
  }
  return out;
}

/**
 * `project` with the pending items applied, in order. An item that no longer fits (the project
 * changed there since the draft was made, or an item it depends on was left out) is skipped
 * whole and listed in `conflicts`.
 */
export function applyItems(
  project: Project,
  items: readonly DiffItem[],
): { project: Project; conflicts: string[] } {
  const w = work(project);
  const conflicts: string[] = [];
  let changed = false;
  for (const i of items) {
    if (i.status !== "pending") continue;
    if (!i.patches.every((p) => fits(w, p))) {
      conflicts.push(i.id);
      continue;
    }
    for (const p of i.patches) write(w, p);
    changed = true;
  }
  // Nothing applied: the same project, so what depends on it is not computed again.
  return { project: changed ? done(w) : project, conflicts };
}

/**
 * The items that cannot stand without `id`: later items that touched the same entities, and
 * items (in any order) that need what it creates, and so on.
 */
export function dependents(items: readonly DiffItem[], id: string): DiffItem[] {
  const out = new Map<string, DiffItem>();
  const queue = items.filter((i) => i.id === id);
  for (let x = queue.shift(); x; x = queue.shift()) {
    const at = items.indexOf(x);
    const keys = new Set(x.keys);
    items.forEach((other, j) => {
      if (other.id === id || out.has(other.id)) return;
      const later = j > at && other.keys.some((k) => keys.has(k));
      const needs = other.needs.some((k) => keys.has(k));
      if (later || needs) {
        out.set(other.id, other);
        queue.push(other);
      }
    });
  }
  return [...out.values()];
}

/**
 * Leaves item `id` out of the draft: it and every item that depends on it (dependents) become
 * rejected, and `conflicts` tells which of those the person had not rejected yet. `project` is
 * `base` with what is still pending.
 */
export function revertItem(
  base: Project,
  items: readonly DiffItem[],
  id: string,
): { project: Project; items: DiffItem[]; conflicts: DiffItem[] } {
  const deps = dependents(items, id);
  const off = new Set([id, ...deps.map((d) => d.id)]);
  const next = items.map((i) => (off.has(i.id) ? { ...i, status: "rejected" as const } : i));
  return {
    project: applyItems(base, next).project,
    items: next,
    conflicts: deps.filter((d) => d.status === "pending"),
  };
}

/** Brings an item back into the draft (what it depends on stays as the person left it). */
export const includeItem = (items: readonly DiffItem[], id: string): DiffItem[] =>
  items.map((i) => (i.id === id ? { ...i, status: "pending" as const } : i));

/** Clips the pending items change, for the timeline highlight. */
export const draftClips = (items: readonly DiffItem[]): Set<string> =>
  new Set(items.filter((i) => i.status === "pending").flatMap((i) => i.clips));

import type { Asset, Project } from "./types.ts";

/**
 * The lesson packed in one ZIP (Arquivo › Empacotar a aula): the project with its media, the
 * cursor data, the transcripts, the guided runs, the voices exported for the presenter's video
 * and the narrations of the guided plans, each under media/<name>; the paths in the packed
 * project point there. The cursor images a recording saved beside its cursor data
 * (cursors/<hash>.png, named by their content) go to media/cursors/, beside the packed cursor
 * data, which names them the same way. What the app makes again by itself (proxies, thumbnails, waveforms,
 * filmstrips, the avatar cut out, the treated voice, the pictures of annotations and held
 * frames) stays out. Opening the package extracts it into a folder of its own and puts absolute
 * paths back before the lesson opens (main/package.ts); nothing in it may point elsewhere.
 */

export const PACKAGE_PROJECT = "aula.ediaula";
export const PACKAGE_MEDIA = "media/";
/** The folder of the cursor images inside the package, beside the cursor data. */
export const PACKAGE_CURSORS = `${PACKAGE_MEDIA}cursors/`;
/** A cursor image as the recorder saves it: the hash of its pixels. */
export const CURSOR_IMAGE = /^[0-9a-f]{16}\.png$/;

/** Fields of a media pointing at files that travel in the package. */
const CARRIED = ["path", "cursor", "transcript", "guidedRun"] as const;
type Carried = (typeof CARRIED)[number];
/** Caches of a media, made again on the other computer. */
const DROPPED = [
  "thumb",
  "waveform",
  "proxy",
  "keyed",
  "keyedId",
  "treated",
  "filmstrip",
  "motion",
] as const;

const SUFFIX: Record<Carried, string> = {
  path: "",
  cursor: "cursor",
  transcript: "transcricao",
  guidedRun: "guided-run",
};

/** A file name that is safe inside the archive and on Windows. */
export function packName(name: string): string {
  const clean = [...name]
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return clean.slice(0, 120) || "arquivo";
}

const extOf = (path: string): string => {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(path);
  return m ? m[0] : "";
};
const baseOf = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export interface PackPlan {
  /** Files to store: name inside the archive and where it is now. */
  files: { name: string; path: string }[];
  /** The project as it goes into the archive, its paths relative to it. */
  project: Project;
  /** Exported voices left out because their files are gone (they cannot be matched again). */
  droppedVoices: number;
}

/** Statuses of the caches above, made again too. */
const STATUSES = ["keyStatus", "treatStatus", "motionStatus", "missing", "cursorMissing"] as const;

/** A media without the caches the app makes again. */
function withoutCaches(a: Asset): Asset {
  const out: Asset = { ...a };
  for (const key of DROPPED) delete out[key];
  for (const key of STATUSES) delete out[key];
  if (out.proxyStatus !== "none") out.proxyStatus = "none";
  return out;
}

/** Where an editor picture lives in the package folder: nowhere yet, so it is drawn again. */
const drawnName = (a: Asset): string =>
  `${PACKAGE_MEDIA}${packName(`${a.id}-desenho${extOf(baseOf(a.path)) || ".png"}`)}`;

/**
 * What goes into the package, and the project with the paths it will have inside. `exists`
 * says whether a file is there: an exported voice whose WAVs are gone stays out (the media
 * themselves must be there; main/package.ts asks to reconnect them). `cursorImages` lists the
 * cursor images beside a cursor data file (their paths).
 */
export function packPlan(
  p: Project,
  exists: (path: string) => boolean = () => true,
  cursorImages: (cursor: string) => string[] = () => [],
): PackPlan {
  const files: { name: string; path: string }[] = [];
  const taken = new Set<string>();
  const store = (label: string, path: string): string => {
    let name = `${PACKAGE_MEDIA}${packName(label)}`;
    for (let i = 2; taken.has(name.toLowerCase()); i++)
      name = `${PACKAGE_MEDIA}${packName(`${i}-${label}`)}`;
    taken.add(name.toLowerCase());
    files.push({ name, path });
    return name;
  };
  const place = (asset: Asset, field: Carried, path: string): string => {
    const own = baseOf(path);
    const label = SUFFIX[field] ? `${SUFFIX[field]}${extOf(own) || ".json"}` : own;
    return store(`${asset.id}-${label}`, path);
  };
  const images = new Set<string>();
  const assets = p.assets.map((a) => {
    const out = withoutCaches(a);
    // Pictures the editor draws are drawn again from what the project says.
    if (a.generated) return { ...out, path: drawnName(a) };
    for (const field of CARRIED) {
      const value = a[field];
      if (typeof value === "string" && value) out[field] = place(a, field, value);
    }
    // The pointer as the system drew it: one copy of each image, whichever take saved it.
    if (a.cursor)
      for (const path of cursorImages(a.cursor)) {
        const name = baseOf(path);
        if (!CURSOR_IMAGE.test(name) || images.has(name)) continue;
        images.add(name);
        files.push({ name: `${PACKAGE_CURSORS}${name}`, path });
      }
    return out;
  });
  // The voices exported for the presenter's video travel too, to place the MP4s that come back.
  const kept = (p.voiceMasters ?? []).filter((m) => m.pieces.every((x) => exists(x.file)));
  const voiceMasters = kept.map((m) => ({
    ...m,
    pieces: m.pieces.map((x, i) => ({
      ...x,
      file: store(`voz-${m.id}-${i + 1}${extOf(x.file) || ".wav"}`, x.file),
    })),
  }));
  // And the narration of each guided plan, heard by the recorder.
  const guided = p.guided && {
    ...p.guided,
    plans: p.guided.plans.map((plan) => {
      if (!plan.audio) return plan;
      if (!exists(plan.audio.path)) {
        const { audio: _gone, ...rest } = plan;
        return rest;
      }
      return {
        ...plan,
        audio: {
          ...plan.audio,
          path: store(`narracao-${plan.id}${extOf(plan.audio.path) || ".wav"}`, plan.audio.path),
        },
      };
    }),
  };
  const project: Project = { ...p, assets };
  if (p.voiceMasters) project.voiceMasters = voiceMasters;
  if (guided) project.guided = guided;
  return { files, project, droppedVoices: (p.voiceMasters?.length ?? 0) - kept.length };
}

/** A path anywhere in a project (a drive, a share, a root, an address of a file). */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|[\\/]{2}|\\|\/[^\s/]+\/|file:)/i;

/** Strings in `value` (deep) that look like paths and are not under `root`. */
export function strayPaths(value: unknown, root: string, out: string[] = []): string[] {
  if (out.length >= 5) return out;
  if (typeof value === "string") {
    const inside = value.toLowerCase().startsWith(`${root.toLowerCase()}\\`);
    if (ABSOLUTE.test(value) && !value.includes("\n") && !inside) out.push(value);
  } else if (Array.isArray(value)) for (const v of value) strayPaths(v, root, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) strayPaths(v, root, out);
  return out;
}

/**
 * The packed project with its paths inside `folder` again (absolute, Windows separators). A
 * package comes from someone else: the caches it may carry are deleted (they are made again
 * here), the editor's pictures get a place in the folder (drawn again), and a path that points
 * outside the media folder of the package refuses it.
 */
export function unpackPaths(p: Project, folder: string): Project {
  const root = folder.replace(/[\\/]+$/, "");
  const inside = (rel: string): string => {
    const parts = rel.split("/");
    if (
      !rel.startsWith(PACKAGE_MEDIA) ||
      parts.some((x) => x === ".." || x === "." || !x) ||
      parts.length !== 2 ||
      /[\\:]/.test(parts[1])
    )
      throw new Error(`Caminho fora do pacote: ${rel.slice(0, 200)}`);
    return `${root}\\${parts.join("\\")}`;
  };
  const project: Project = {
    ...p,
    assets: p.assets.map((a) => {
      const out = withoutCaches(a);
      if (a.generated) {
        const own = typeof a.path === "string" && a.path.startsWith(PACKAGE_MEDIA) ? a.path : "";
        out.path = inside(own || drawnName(a));
        return out;
      }
      for (const field of CARRIED) {
        const value = a[field];
        if (typeof value !== "string" || !value) continue;
        out[field] = inside(value);
      }
      return out;
    }),
  };
  if (p.voiceMasters)
    project.voiceMasters = p.voiceMasters.map((m) => ({
      ...m,
      pieces: m.pieces.map((x) => ({ ...x, file: inside(x.file) })),
    }));
  if (p.guided)
    project.guided = {
      ...p.guided,
      plans: p.guided.plans.map((plan) =>
        plan.audio ? { ...plan, audio: { ...plan.audio, path: inside(plan.audio.path) } } : plan,
      ),
    };
  const stray = strayPaths(project, `${root}\\media`);
  if (stray.length)
    throw new Error(`O pacote aponta para arquivos fora dele: ${stray[0].slice(0, 200)}`);
  return project;
}

import type { Asset, Project } from "./types.ts";

/**
 * The lesson packed in one ZIP (Arquivo › Empacotar a aula): the project with its media, the
 * cursor data, the transcripts and the guided runs, each under media/<id>-<name>; the paths in
 * the packed project point there. What the app makes again by itself (proxies, thumbnails,
 * waveforms, filmstrips, the avatar cut out, the treated voice, the pictures of annotations and
 * held frames) stays out. Opening the package extracts it into a folder of its own and puts
 * absolute paths back before the lesson opens (main/package.ts).
 */

export const PACKAGE_PROJECT = "aula.ediaula";
export const PACKAGE_MEDIA = "media/";

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
}

/** What goes into the package, and the project with the paths it will have inside. */
export function packPlan(p: Project): PackPlan {
  const files: { name: string; path: string }[] = [];
  const taken = new Set<string>();
  const place = (asset: Asset, field: Carried, path: string): string => {
    const own = baseOf(path);
    const label = SUFFIX[field] ? `${SUFFIX[field]}${extOf(own) || ".json"}` : own;
    let name = `${PACKAGE_MEDIA}${packName(`${asset.id}-${label}`)}`;
    for (let i = 2; taken.has(name.toLowerCase()); i++)
      name = `${PACKAGE_MEDIA}${packName(`${asset.id}-${i}-${label}`)}`;
    taken.add(name.toLowerCase());
    files.push({ name, path });
    return name;
  };
  const assets = p.assets.map((a) => {
    const out: Asset = { ...a };
    for (const key of DROPPED) delete out[key];
    if (out.proxyStatus !== "none") out.proxyStatus = "none";
    delete out.keyStatus;
    delete out.treatStatus;
    delete out.motionStatus;
    delete out.missing;
    // Pictures the editor draws are drawn again from what the project says.
    if (a.generated) return out;
    for (const field of CARRIED) {
      const value = a[field];
      if (typeof value === "string" && value) out[field] = place(a, field, value);
    }
    return out;
  });
  return { files, project: { ...p, assets } };
}

/**
 * The packed project with its paths inside `folder` again (absolute, Windows separators), or an
 * error when a path points outside the media folder of the package.
 */
export function unpackPaths(p: Project, folder: string): Project {
  const root = folder.replace(/[\\/]+$/, "");
  const inside = (rel: string): string => {
    const parts = rel.split("/");
    if (
      !rel.startsWith(PACKAGE_MEDIA) ||
      parts.some((x) => x === ".." || x === "." || !x) ||
      parts.length !== 2
    )
      throw new Error(`Caminho fora do pacote: ${rel}`);
    return `${root}\\${parts.join("\\")}`;
  };
  return {
    ...p,
    assets: p.assets.map((a) => {
      const out: Asset = { ...a };
      for (const field of CARRIED) {
        const value = a[field];
        if (typeof value !== "string" || !value) continue;
        // A picture of the editor keeps the path it had (it is drawn again when missing).
        if (a.generated && field === "path" && !value.startsWith(PACKAGE_MEDIA)) continue;
        out[field] = inside(value);
      }
      return out;
    }),
  };
}

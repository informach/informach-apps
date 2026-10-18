import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { exportProject, frameAt, frameRate } from "../../shared/export/frames.ts";
import { lessonFrames } from "../../shared/export/segments.ts";
import { buildVideoWindowPlan, type MediaFacts } from "../../shared/export/videoPlan.ts";
import type { FrameGeometry } from "../../shared/frameGrab.ts";
import { withRevealSprites } from "../../shared/reveal.ts";
import type { ExportSpec, Project } from "../../shared/types.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { collectingProvider, FxAssets } from "./fxAssets.ts";

/**
 * One frame of the lesson composed exactly as the export composes it: the export plan of a
 * window of one frame, with the effect pictures, the cursor sprites, the animated annotations
 * and the burned captions (and keys on screen) the spec carries. Two channels use it:
 *
 * - `export:frame` (main/index.ts), for get_frame with `composited`:
 *   `(jobId, projectJson: string, spec: ExportSpec, time: number, geometry: FrameGeometry)`,
 *   resolving with the PNG bytes cut to the region and scaled to the size the AI gets.
 * - `export:framePng` (Exportar o quadro atual): `(jobId, projectJson, time, spec)`, the PNG of
 *   the whole frame at the lesson's size written to spec.outPath.
 *
 * Both turn the composite (BT.709 in limited range) into RGB the way a player shows it.
 */

export interface FrameDeps {
  assertRead: (path: string) => Promise<string>;
  run: (args: string[]) => Promise<unknown>;
  filterScriptOption: FilterScriptOption;
  /** userData/cache: effect pictures, keyed avatars, cursor and annotation sprites live under it. */
  cacheDirectory: string;
  workDirectory: string;
  fontsDirectory: string;
  probe?: (path: string) => Promise<MediaFacts | undefined>;
  /** Folders of other files the app wrote itself. */
  internalRoots?: readonly string[];
}

const inside = (path: string, root: string): boolean => {
  const child = relative(resolve(root).toLowerCase(), resolve(path).toLowerCase());
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
};

/** The composite's colors (BT.709, limited range) as RGB, as a player shows them. */
export const TO_RGB = "scale=in_color_matrix=bt709:in_range=tv:out_range=pc";

/**
 * Writes the frame at `time` to `out` (a PNG), after the filters `finish` adds to the plan's
 * output (which end in [frame]).
 */
async function composeFrame(
  project: Project,
  spec: ExportSpec,
  time: number,
  deps: FrameDeps,
  finish: (output: string) => string,
  out: string,
): Promise<void> {
  await mkdir(deps.workDirectory, { recursive: true });
  const work = await mkdtemp(join(deps.workDirectory, "frame-"));
  try {
    const internal = [deps.cacheDirectory, work, ...(deps.internalRoots ?? [])];
    const checked = new Map<string, string>();
    const check = async (path: string): Promise<string> => {
      const known = checked.get(path);
      if (known) return known;
      const ok = internal.some((root) => inside(path, root)) ? path : await deps.assertRead(path);
      checked.set(path, ok);
      return ok;
    };
    const frameSpec: ExportSpec = { ...spec, vertical: undefined };
    // The burned captions and the keys on screen are an ASS file, written here for the plan.
    if (spec.burnAss) {
      frameSpec.assFile = join(work, "captions.ass");
      frameSpec.fontsDir = deps.fontsDirectory;
      await writeFile(frameSpec.assFile, spec.burnAss, "utf8");
    }
    const r = frameRate(spec.fps);
    const derived = exportProject(withRevealSprites(project, spec.reveals), r);
    const last = Math.max(0, lessonFrames(derived, r) - 1);
    const win = { from: Math.min(last, Math.max(0, frameAt(time, r))), frames: 1 };
    // What each picture source is (colour matrix, alpha), as the export asks it.
    const facts = new Map<string, MediaFacts>();
    const first = buildVideoWindowPlan(derived, frameSpec, r, win);
    if (deps.probe)
      for (const path of [...first.media, ...first.internal]) {
        const known = await deps.probe(await check(path));
        if (known) facts.set(path, known);
      }
    const media = (path: string): MediaFacts | undefined => facts.get(path);
    // The effect pictures the plan asks for are made first, then the plan uses them.
    const fx = new FxAssets(join(deps.cacheDirectory, "fx"), deps.run);
    const wanted = collectingProvider();
    buildVideoWindowPlan(derived, frameSpec, r, win, wanted.provider, media);
    await fx.ensure(wanted.wanted);
    const plan = buildVideoWindowPlan(derived, frameSpec, r, win, fx.provider, media);
    const inputs = [...plan.inputArgs];
    for (let i = 0; i < inputs.length; i++)
      if (inputs[i] === "-i") inputs[i + 1] = await check(inputs[i + 1]);
    const script = join(work, "frame.txt");
    await writeFile(script, `${plan.filter};${finish(plan.output)}`, "utf8");
    await deps.run([
      "-y",
      "-v",
      "error",
      "-nostdin",
      ...inputs,
      deps.filterScriptOption,
      script,
      "-map",
      "[frame]",
      "-frames:v",
      "1",
      "-update",
      "1",
      "-c:v",
      "png",
      out,
    ]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** export:frame: the frame cut to the region and scaled, as PNG bytes. */
export async function renderFrame(
  project: Project,
  spec: ExportSpec,
  time: number,
  geometry: FrameGeometry,
  deps: FrameDeps,
): Promise<Uint8Array> {
  await mkdir(deps.workDirectory, { recursive: true });
  const work = await mkdtemp(join(deps.workDirectory, "frame-bytes-"));
  try {
    const out = join(work, "frame.png");
    const { crop } = geometry;
    await composeFrame(
      project,
      spec,
      time,
      deps,
      (output) =>
        `[${output}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},${TO_RGB}:w=${geometry.width}:h=${geometry.height}:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24[frame]`,
      out,
    );
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * export:framePng: the whole frame at the lesson's size written to `out`, which the caller
 * checked; through a .part.png beside it, so the PNG there is never half written.
 */
export async function renderFramePng(
  project: Project,
  spec: ExportSpec,
  time: number,
  out: string,
  deps: FrameDeps,
): Promise<string> {
  if (!/\.png$/i.test(out)) throw new Error("Escolha um destino PNG para o quadro.");
  const part = `${out.slice(0, -4)}.part.png`;
  try {
    await composeFrame(
      project,
      spec,
      time,
      deps,
      (output) => `[${output}]${TO_RGB}:flags=accurate_rnd+full_chroma_int,format=rgb24[frame]`,
      part,
    );
    await rename(part, out);
    return out;
  } finally {
    await rm(part, { force: true });
  }
}

/** One frame of a media file, cut and scaled (get_frame without composing), as a PNG. */
export function mediaFrameArgs(
  path: string,
  seconds: number,
  geometry: FrameGeometry,
  out: string,
): string[] {
  const { crop } = geometry;
  return [
    "-y",
    "-v",
    "error",
    "-nostdin",
    "-ss",
    String(Math.max(0, seconds)),
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${geometry.width}:${geometry.height}:flags=lanczos,format=rgb24`,
    "-c:v",
    "png",
    out,
  ];
}

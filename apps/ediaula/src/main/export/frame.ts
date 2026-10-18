import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { exportProject, frameAt, frameRate } from "../../shared/export/frames.ts";
import { lessonFrames } from "../../shared/export/segments.ts";
import { buildVideoWindowPlan, type MediaFacts } from "../../shared/export/videoPlan.ts";
import type { FrameGeometry } from "../../shared/frameGrab.ts";
import type { ExportSpec, Project } from "../../shared/types.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { collectingProvider, FxAssets } from "./fxAssets.ts";

/**
 * Channel `export:frame` (main/index.ts), for get_frame with `composited`:
 * `(jobId, projectJson: string, spec: ExportSpec, time: number, geometry: FrameGeometry)` and
 * it resolves with the PNG bytes (Uint8Array). It is not `export:framePng`, the PNG of a frame
 * the editor itself asks for (another lot): the two take different arguments.
 *
 * One frame of the lesson composed exactly as the export composes it (get_frame with
 * `composited`): the export plan of a window of one frame, with the effect pictures, the cursor
 * sprites and the burned captions the spec carries, cut to the region and scaled to the size the
 * AI gets, as a PNG.
 */

export interface FrameDeps {
  assertRead: (path: string) => Promise<string>;
  run: (args: string[]) => Promise<unknown>;
  filterScriptOption: FilterScriptOption;
  /** userData/cache: effect pictures, keyed avatars and cursor sprites live under it. */
  cacheDirectory: string;
  workDirectory: string;
  fontsDirectory: string;
  probe?: (path: string) => Promise<MediaFacts | undefined>;
}

const inside = (path: string, root: string): boolean => {
  const child = relative(resolve(root).toLowerCase(), resolve(path).toLowerCase());
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
};

export async function renderFrame(
  project: Project,
  spec: ExportSpec,
  time: number,
  geometry: FrameGeometry,
  deps: FrameDeps,
): Promise<Uint8Array> {
  await mkdir(deps.workDirectory, { recursive: true });
  const work = await mkdtemp(join(deps.workDirectory, "frame-"));
  try {
    const assets = new Map(project.assets.map((a) => [a.id, a]));
    const checked = new Map<string, string>();
    const check = async (path: string): Promise<string> => {
      const known = checked.get(path);
      if (known) return known;
      const ok =
        inside(path, deps.cacheDirectory) || inside(path, work)
          ? path
          : await deps.assertRead(path);
      checked.set(path, ok);
      return ok;
    };
    const facts = new Map<string, MediaFacts>();
    for (const c of project.clips) {
      const a = assets.get(c.assetId);
      if (!a || a.kind === "audio" || c.zoomLayer) continue;
      const path = await check(a.path);
      if (deps.probe && !facts.has(a.path)) {
        const known = await deps.probe(path);
        if (known) facts.set(a.path, known);
      }
    }
    const frameSpec: ExportSpec = { ...spec, vertical: undefined };
    if (spec.burnAss) {
      frameSpec.assFile = join(work, "captions.ass");
      frameSpec.fontsDir = deps.fontsDirectory;
      await writeFile(frameSpec.assFile, spec.burnAss, "utf8");
    }
    const r = frameRate(spec.fps);
    const derived = exportProject(project, r);
    const last = Math.max(0, lessonFrames(derived, r) - 1);
    const win = { from: Math.min(last, Math.max(0, frameAt(time, r))), frames: 1 };
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
    const { crop } = geometry;
    const script = join(work, "frame.txt");
    await writeFile(
      script,
      `${plan.filter};[${plan.output}]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${geometry.width}:${geometry.height}:flags=lanczos,format=rgb24[frame]`,
      "utf8",
    );
    const out = join(work, "frame.png");
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
      "-c:v",
      "png",
      out,
    ]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(work, { recursive: true, force: true });
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

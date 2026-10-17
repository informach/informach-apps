import { unlink, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { buildExportPlan } from "../shared/exportPlan.ts";
import { exportSpecSchema, projectSchema } from "../shared/project-schema.ts";
import type { ExportSpec } from "../shared/types.ts";
import type { FilterScriptOption } from "./ffmpeg-arguments.ts";

/** WebVTT is SRT with a header and dots in timestamps. */
function srtToVtt(srt: string): string {
  return `WEBVTT\n\n${srt.replace(/^\d+\n/gm, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

export async function exportLesson(
  rawProject: unknown,
  rawSpec: unknown,
  deps: {
    assertRead: (path: string) => Promise<string>;
    assertWrite: (path: string) => Promise<string>;
    assertRelatedExport: (primary: string, path: string) => Promise<string>;
    run: (args: string[], duration?: number) => Promise<unknown>;
    writeFilterScript: (text: string, kind?: string) => Promise<string>;
    fontsDirectory: string;
    filterScriptOption: FilterScriptOption;
    check: () => void;
  },
) {
  const project = projectSchema.parse(rawProject);
  const parsed = exportSpecSchema.parse(rawSpec);
  const primary = await deps.assertWrite(parsed.outPath);
  if (extname(primary).toLowerCase() !== (parsed.audioOnly ? ".mp3" : ".mp4"))
    throw new Error("Escolha um destino MP4 para vídeo ou MP3 para áudio.");
  const base = primary.slice(0, -extname(primary).length);
  const captions = parsed.captions
    ? await deps.assertRelatedExport(primary, `${base}.srt`)
    : undefined;
  const subtitles = parsed.captions
    ? await deps.assertRelatedExport(primary, `${base}.vtt`)
    : undefined;
  const thumbnail =
    parsed.thumbnail && !parsed.audioOnly
      ? await deps.assertRelatedExport(primary, `${base}.jpg`)
      : undefined;
  const destinations = [primary, captions, subtitles, thumbnail].filter(
    (path) => path !== undefined,
  );
  const scripts: string[] = [];
  let failure: unknown;
  let failed = false;
  try {
    await withStagedFiles(
      destinations,
      async (staged) => {
        const output = (path: string) => {
          const result = staged.get(path);
          if (!result) throw new Error("Missing staged export output");
          return result;
        };
        const spec: ExportSpec = { ...parsed, outPath: output(primary) };
        if (spec.burnAss) {
          spec.assFile = await deps.writeFilterScript(spec.burnAss, "ass");
          scripts.push(spec.assFile);
          spec.fontsDir = deps.fontsDirectory;
        }
        const plan = buildExportPlan(project, spec);
        // All -i values in this trusted plan are file inputs, including keyed video
        // and cursor sprites. Canonicalize them through the selected-file authority.
        for (let i = 0; i < plan.inputArgs.length; i++) {
          if (plan.inputArgs[i] !== "-i") continue;
          const input = plan.inputArgs[i + 1];
          if (!input) throw new Error("Missing export input");
          plan.inputArgs[++i] = await deps.assertRead(input);
        }
        const filter = await deps.writeFilterScript(plan.filter);
        scripts.push(filter);
        deps.check();
        await deps.run(
          [
            "-y",
            "-v",
            "error",
            ...plan.inputArgs,
            deps.filterScriptOption,
            filter,
            ...plan.outputArgs,
          ],
          plan.duration,
        );
        deps.check();
        if (captions && subtitles && spec.captions) {
          await writeFile(output(captions), spec.captions, "utf8");
          await writeFile(output(subtitles), srtToVtt(spec.captions), "utf8");
        }
        if (thumbnail) {
          await deps.run([
            "-y",
            "-v",
            "error",
            "-ss",
            String(Math.max(0, plan.duration * 0.3)),
            "-i",
            output(primary),
            "-frames:v",
            "1",
            "-vf",
            "scale=1280:-2",
            "-q:v",
            "3",
            output(thumbnail),
          ]);
        }
      },
      async () => {
        deps.check();
        await deps.assertWrite(primary);
        for (const related of [captions, subtitles, thumbnail])
          if (related) await deps.assertRelatedExport(primary, related);
      },
    );
  } catch (error) {
    failure = error;
    failed = true;
  }
  const cleanupFailures: unknown[] = [];
  for (const script of scripts) {
    try {
      await unlink(script);
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (cleanupFailures.length)
    throw new AggregateError(
      failed ? [failure, ...cleanupFailures] : cleanupFailures,
      "Export filter cleanup failed",
    );
  if (failed) throw failure;
}

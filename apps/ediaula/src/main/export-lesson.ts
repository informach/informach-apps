import { dirname, extname } from "node:path";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { exportSpecSchema, projectSchema } from "../shared/project-schema.ts";
import { subRip } from "../shared/webvtt.ts";
import { type ExportDeps, renderLesson } from "./export/pipeline.ts";

export type { ExportDeps } from "./export/pipeline.ts";

/**
 * Exports a lesson to the selected file, with the captions and thumbnail beside it. Everything is
 * written to staged copies first: an export that fails or is cancelled leaves the previous files
 * as they were (shared withStagedFiles).
 */
export async function exportLesson(rawProject: unknown, rawSpec: unknown, deps: ExportDeps) {
  const project = projectSchema.parse(rawProject);
  const spec = exportSpecSchema.parse(rawSpec);
  const primary = await deps.assertWrite(spec.outPath);
  if (extname(primary).toLowerCase() !== (spec.audioOnly ? ".mp3" : ".mp4"))
    throw new Error("Escolha um destino MP4 para vídeo ou MP3 para áudio.");
  // The staging folder goes beside the destination: the app looks there for leftovers of a crash.
  await deps.rememberFolder?.(dirname(primary));
  const base = primary.slice(0, -extname(primary).length);
  // Caption files only when there is text to put in them.
  const cues = !!spec.captionCues && subRip(spec.captionCues) !== null;
  const captions = cues ? await deps.assertRelatedExport(primary, `${base}.srt`) : undefined;
  const subtitles = cues ? await deps.assertRelatedExport(primary, `${base}.vtt`) : undefined;
  const thumbnail =
    spec.thumbnail && !spec.audioOnly
      ? await deps.assertRelatedExport(primary, `${base}.jpg`)
      : undefined;
  const destinations = [primary, captions, subtitles, thumbnail].filter(
    (path) => path !== undefined,
  );
  await withStagedFiles(
    destinations,
    async (staged) => {
      const output = (path: string): string => {
        const result = staged.get(path);
        if (!result) throw new Error("Missing staged export output");
        return result;
      };
      await renderLesson(
        project,
        spec,
        {
          primary: output(primary),
          captions: captions && output(captions),
          subtitles: subtitles && output(subtitles),
          thumbnail: thumbnail && output(thumbnail),
        },
        deps,
      );
    },
    async () => {
      deps.check();
      await deps.assertWrite(primary);
      for (const related of [captions, subtitles, thumbnail])
        if (related) await deps.assertRelatedExport(primary, related);
    },
  );
}

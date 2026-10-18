import { existsSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { PACKAGE_SUFFIX } from "../shared/platformPackage.ts";
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
  // "aula.en.mp4" beside "aula.mp4" would write its captions over the English translation of
  // that video (aula.en.srt): the name is refused.
  const lang = /\.([a-z]{2,3}(?:-[a-z]{2,4})?)$/i.exec(base);
  if (lang && !spec.audioOnly && existsSync(`${base.slice(0, -lang[0].length)}.mp4`))
    throw new Error(
      `O nome ${basename(primary)} se confunde com as legendas traduzidas (${lang[1]}) de ${basename(base.slice(0, -lang[0].length))}.mp4 nesta pasta. Escolha outro nome.`,
    );
  // Caption files only when there is text to put in them.
  const cues = !!spec.captionCues && subRip(spec.captionCues) !== null;
  const captions = cues ? await deps.assertRelatedExport(primary, `${base}.srt`) : undefined;
  const subtitles = cues ? await deps.assertRelatedExport(primary, `${base}.vtt`) : undefined;
  const thumbnail =
    spec.thumbnail && !spec.audioOnly
      ? await deps.assertRelatedExport(primary, `${base}.jpg`)
      : undefined;
  // Translated captions beside the video: <aula>.<lang>.srt and .vtt (shared/captionTranslate.ts).
  const translations: { lang: string; srt: string; vtt: string }[] = [];
  for (const t of spec.translations ?? []) {
    if (subRip(t.cues) === null) continue;
    translations.push({
      lang: t.lang,
      srt: await deps.assertRelatedExport(primary, `${base}.${t.lang}.srt`),
      vtt: await deps.assertRelatedExport(primary, `${base}.${t.lang}.vtt`),
    });
  }
  // The package for the platform (shared/platformPackage.ts), only for a video.
  const platform =
    spec.platform && !spec.audioOnly
      ? await deps.assertRelatedExport(primary, `${base}${PACKAGE_SUFFIX}`)
      : undefined;
  const destinations = [
    primary,
    captions,
    subtitles,
    thumbnail,
    ...translations.flatMap((t) => [t.srt, t.vtt]),
    platform,
  ].filter((path) => path !== undefined);
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
          translations: translations.map((t) => ({
            lang: t.lang,
            srt: output(t.srt),
            vtt: output(t.vtt),
          })),
          platform: platform && output(platform),
          // The package names the files as they end up, not their staged copies.
          names: {
            video: basename(primary),
            ...(thumbnail ? { thumbnail: basename(thumbnail) } : {}),
            captions: [
              ...(captions || subtitles
                ? [
                    {
                      lang: "pt-BR",
                      ...(captions ? { srt: basename(captions) } : {}),
                      ...(subtitles ? { vtt: basename(subtitles) } : {}),
                    },
                  ]
                : []),
              ...translations.map((t) => ({
                lang: t.lang,
                srt: basename(t.srt),
                vtt: basename(t.vtt),
              })),
            ],
          },
        },
        deps,
      );
    },
    async () => {
      deps.check();
      await deps.assertWrite(primary);
      for (const related of [
        captions,
        subtitles,
        thumbnail,
        ...translations.flatMap((t) => [t.srt, t.vtt]),
        platform,
      ])
        if (related) await deps.assertRelatedExport(primary, related);
    },
  );
}

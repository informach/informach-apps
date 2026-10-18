import { unlink } from "node:fs/promises";
import { buildExportPlan } from "../shared/exportPlan.ts";
import { type Loudness, parseLoudness } from "../shared/preflight.ts";
import { projectSchema } from "../shared/project-schema.ts";
import type { FilterScriptOption } from "./ffmpeg-arguments.ts";

/**
 * The lesson's sound measured as the export mixes it (the same filter graph, audio only), with
 * FFmpeg's EBU R128 meter: integrated loudness and true peak, for the check before exporting.
 * Nothing is written but the filter script, which is removed afterwards.
 */
export async function measureLoudness(
  rawProject: unknown,
  deps: {
    assertRead: (path: string) => Promise<string>;
    /** Runs FFmpeg; `onStderr` gets everything it prints (the meter's summary comes last). */
    run: (args: string[], duration: number, onStderr: (text: string) => void) => Promise<unknown>;
    writeFilterScript: (text: string) => Promise<string>;
    filterScriptOption: FilterScriptOption;
  },
): Promise<Loudness | null> {
  const project = projectSchema.parse(rawProject);
  const plan = buildExportPlan(project, {
    outPath: "-",
    width: project.settings.width,
    height: project.settings.height,
    fps: project.settings.fps,
    videoBitrate: 1,
    normalizeLoudness: false,
    encoder: "x264",
    audioOnly: true,
  });
  for (let i = 0; i < plan.inputArgs.length; i++) {
    if (plan.inputArgs[i] !== "-i") continue;
    const input = plan.inputArgs[i + 1];
    if (!input) throw new Error("Missing measurement input");
    plan.inputArgs[++i] = await deps.assertRead(input);
  }
  const filter = await deps.writeFilterScript(
    `${plan.filter};\n[aout]ebur128=peak=true:framelog=quiet[measured]`,
  );
  let stderr = "";
  try {
    await deps.run(
      [
        "-hide_banner",
        "-nostdin",
        ...plan.inputArgs,
        deps.filterScriptOption,
        filter,
        "-map",
        "[measured]",
        "-t",
        String(plan.duration),
        "-f",
        "null",
        "-",
      ],
      plan.duration,
      (text) => {
        // Only the end matters: the summary is a few hundred characters.
        stderr = (stderr + text).slice(-20000);
      },
    );
  } finally {
    // A script left in the temp folder is harmless; the measurement still counts.
    await unlink(filter).catch((error: unknown) =>
      console.warn("[ediaula] loudness filter script not removed", error),
    );
  }
  return parseLoudness(stderr);
}

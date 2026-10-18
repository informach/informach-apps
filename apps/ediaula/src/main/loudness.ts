import { unlink } from "node:fs/promises";
import { buildAudioPlan } from "../shared/export/audioPlan.ts";
import { type Loudness, parseLoudness } from "../shared/preflight.ts";
import { projectSchema } from "../shared/project-schema.ts";
import type { FilterScriptOption } from "./ffmpeg-arguments.ts";

/**
 * The lesson's sound measured as the export mixes it, with FFmpeg's EBU R128 meter: integrated
 * loudness and true peak, for the check before exporting. The mix is the export's own audio plan
 * (shared/export/audioPlan.ts): the treated voice in place of the recorded one, every clip at its
 * volume and fades, and the music stepping aside on `speech` (the moments someone speaks, which
 * the renderer works out from the transcripts as the export does). It is the lesson before the
 * export's loudness pass, so the measure shows the lesson as it is. Nothing is written but the
 * filter script, which is removed afterwards.
 */
export async function measureLoudness(
  rawProject: unknown,
  speech: [number, number][] | undefined,
  deps: {
    assertRead: (path: string) => Promise<string>;
    /** Runs FFmpeg; `onStderr` gets everything it prints (the meter's summary comes last). */
    run: (args: string[], duration: number, onStderr: (text: string) => void) => Promise<unknown>;
    writeFilterScript: (text: string) => Promise<string>;
    filterScriptOption: FilterScriptOption;
  },
): Promise<Loudness | null> {
  const project = projectSchema.parse(rawProject);
  const plan = buildAudioPlan(project, speech ? { speech } : {});
  const inputs = [...plan.inputArgs];
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i] !== "-i") continue;
    const input = inputs[i + 1];
    if (!input) throw new Error("Missing measurement input");
    inputs[++i] = await deps.assertRead(input);
  }
  const filter = await deps.writeFilterScript(
    `${plan.filter};\n[${plan.output}]ebur128=peak=true:framelog=quiet[measured]`,
  );
  let stderr = "";
  try {
    await deps.run(
      [
        "-hide_banner",
        "-nostdin",
        ...inputs,
        deps.filterScriptOption,
        filter,
        "-map",
        "[measured]",
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

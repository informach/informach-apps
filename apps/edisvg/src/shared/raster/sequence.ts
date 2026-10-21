import { strToU8, zipSync } from "fflate";
import type { RasterFramePlan } from "./profile";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sequenceFileName(index: number) {
  return `quadro-${String(index).padStart(5, "0")}.png`;
}

/** PNG frames are already deflated, so the archive stores them as-is with a fixed date: the
 * same frames always produce the same bytes. `sequence.json` carries the timing contract. */
export function packPngSequence(
  frames: readonly Uint8Array[],
  plan: RasterFramePlan,
  settings: {
    name: string;
    width: number;
    height: number;
    fps: number;
    background: string;
    limit: number;
  },
) {
  if (frames.length !== plan.times.length) throw new Error("Quantidade de quadros incompatível.");
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [index, frame] of frames.entries()) {
    if (!PNG_SIGNATURE.every((byte, offset) => frame[offset] === byte))
      throw new Error("Quadro PNG inválido.");
    total += frame.length;
    if (total > settings.limit) throw new Error("Sequência PNG excede o limite de tamanho.");
    files[sequenceFileName(index)] = frame;
  }
  files["sequence.json"] = strToU8(
    `${JSON.stringify(
      {
        format: "edisvg-png-sequence",
        version: 1,
        name: settings.name,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        frames: frames.length,
        loop: plan.loop,
        durationSeconds: plan.durationSeconds,
        background: settings.background,
        files: frames.map((_, index) => ({
          file: sequenceFileName(index),
          time: plan.times[index],
          timestampMicroseconds: plan.timestamps[index],
          durationMicroseconds: plan.durations[index],
        })),
      },
      null,
      2,
    )}\n`,
  );
  const archive = zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
  if (archive.length > settings.limit) throw new Error("Sequência PNG excede o limite de tamanho.");
  return archive;
}

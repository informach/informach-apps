import { join } from "node:path";
import { createWhisper } from "@informach/edi-speech/node/whisper";
import { app } from "electron";
import { cacheDir, detectEncoder, FFMPEG, run } from "./ffmpeg.ts";
import { scheduler } from "./scheduler.ts";

/**
 * EdiAula's transcription engine: @informach/edi-speech (shared with EdiSVG) with this app's
 * folder (userData/whisper), its FFmpeg runner and its scheduler. Same functions as before.
 */
const whisper = createWhisper({
  root: () => join(app.getPath("userData"), "whisper"),
  ffmpeg: () => FFMPEG,
  run,
  cacheDir,
  gpu: async () => (await detectEncoder()) === "nvenc",
  track: (child) => scheduler.track(child),
});

export const {
  engineStatus,
  removeStaleDownloads,
  cancelDownload,
  installEngine,
  installModel,
  selectModel,
  setExternalModels,
  checkedEngine,
  cancelWhisper,
  transcribe,
} = whisper;
export { isEngineVariant, isModelName, WHISPER_ASSETS } from "@informach/edi-speech/node/whisper";

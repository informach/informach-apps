import { type AudioAsset, decodeAssetData, parseAsset } from "../assets/model";
import { inspectWav } from "../assets/wav";
/** Exact signed PCM16 -> planar float conversion, no codec guessing/resampling. */
export function decodePcmAsset(input: AudioAsset) {
  const asset = parseAsset(input);
  if (asset.kind !== "audio") throw new Error("Recurso PCM esperado.");
  const bytes = decodeAssetData(asset.data),
    info = inspectWav(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    channels = Array.from({ length: asset.channels }, () => new Float32Array(asset.frames));
  for (let channel = 0; channel < asset.channels; channel++) {
    const output = channels[channel];
    if (!output) throw new Error("Canal PCM ausente.");
    for (let frame = 0; frame < asset.frames; frame++)
      output[frame] =
        view.getInt16(info.dataOffset + (frame * asset.channels + channel) * 2, true) / 32768;
  }
  return { channels, sampleRate: asset.sampleRate, frames: asset.frames };
}

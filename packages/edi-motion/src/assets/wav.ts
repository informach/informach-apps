import { AUDIO_SECONDS, assertAssetBytes } from "./limits";

/** Bounded PCM16 RIFF/WAVE profile. Other codecs are normalized by import,
 * not mislabeled as ready PCM, and sample count remains integer exact. */
export function inspectWav(bytes: Uint8Array) {
  assertAssetBytes(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    bytes.length < 44 ||
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    view.getUint32(4, true) !== bytes.length - 8
  )
    throw new Error("RIFF/WAVE inválido ou truncado.");
  let offset = 12,
    count = 0,
    channels = 0,
    sampleRate = 0,
    dataOffset = -1,
    dataLength = 0,
    seenFormat = false;
  while (offset < bytes.length) {
    if (++count > 1024 || offset + 8 > bytes.length)
      throw new Error("WAVE excede chunks ou está truncado.");
    const kind = tag(offset),
      length = view.getUint32(offset + 4, true),
      end = offset + 8 + length,
      padded = end + (length % 2);
    if (end > bytes.length || padded > bytes.length) throw new Error("Chunk WAVE truncado.");
    if (kind === "fmt ") {
      if (seenFormat || length !== 16 || view.getUint16(offset + 8, true) !== 1)
        throw new Error("Recurso WAVE requer PCM16 normalizado.");
      seenFormat = true;
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      const byteRate = view.getUint32(offset + 16, true),
        alignment = view.getUint16(offset + 20, true),
        bits = view.getUint16(offset + 22, true);
      if (
        ![1, 2].includes(channels) ||
        sampleRate < 8000 ||
        sampleRate > 48000 ||
        bits !== 16 ||
        alignment !== channels * 2 ||
        byteRate !== sampleRate * alignment
      )
        throw new Error("Formato PCM WAVE inválido ou excessivo.");
    } else if (kind === "data") {
      if (dataOffset !== -1 || !length) throw new Error("Chunk de áudio duplicado/vazio.");
      dataOffset = offset + 8;
      dataLength = length;
    } else
      throw new Error("WAVE precisa de normalização para remover metadados/chunks não suportados.");
    offset = padded;
  }
  const frames = dataLength / (channels * 2);
  if (
    !seenFormat ||
    dataOffset < 0 ||
    !Number.isInteger(frames) ||
    frames < 1 ||
    frames > sampleRate * AUDIO_SECONDS
  )
    throw new Error("Áudio excede duração ou contém amostras incompletas.");
  return { channels, sampleRate, frames, dataOffset, dataLength };
}

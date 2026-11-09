/**
 * Arquivos pequenos que ficam no banco: a voz dos pais por tarefa e a foto da
 * meta. O tipo vem dos bytes, nunca do nome nem do que o navegador diz.
 */
export const VOZ_MAX_BYTES = 300_000;
export const VOZ_MAX_MS = 15_500;
export const FOTO_MAX_BYTES = 250_000;

const comeca = (b: Uint8Array, assinatura: number[], deslocamento = 0) =>
  assinatura.every((byte, i) => b[deslocamento + i] === byte);
const ascii = (texto: string) => [...texto].map((c) => c.charCodeAt(0));

/** WebM/Matroska (Chrome, Android), Ogg (Firefox) ou MP4/M4A (Safari, iPhone). */
export function tipoDoAudio(bytes: Uint8Array): string | null {
  if (comeca(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (comeca(bytes, ascii("OggS"))) return "audio/ogg";
  if (comeca(bytes, ascii("ftyp"), 4)) return "audio/mp4";
  return null;
}

export function tipoDaImagem(bytes: Uint8Array): string | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca(bytes, ascii("RIFF")) && comeca(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

/** Data URL vinda do aparelho (`data:<tipo>;base64,<dados>`) para bytes, com teto. */
export function bytesDeDataUrl(valor: string, maxBytes: number): Uint8Array | null {
  const m = /^data:[\w/+.-]+(?:;[\w=.-]+)*;base64,([A-Za-z0-9+/=]+)$/.exec(valor);
  if (!m?.[1] || (m[1].length * 3) / 4 > maxBytes + 4) return null;
  const bytes = Uint8Array.from(Buffer.from(m[1], "base64"));
  return bytes.length > 0 && bytes.length <= maxBytes ? bytes : null;
}

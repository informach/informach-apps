import "server-only";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const SIDE = 1280;
export class InvalidVisionImageError extends Error {
  constructor() {
    super("INVALID_IMAGE");
    this.name = "InvalidVisionImageError";
  }
}
/** Decode untrusted bytes and emit one metadata-free, bounded JPEG before paid vision.
 * A square canvas bounds model tiling even for extremely wide/narrow inputs.
 * Source formats and declared MIME must agree. No URL/file-path loading is accepted.
 */
export async function prepareVisionImage(dataUrl: string): Promise<string> {
  if (dataUrl.length > 8_000_000) throw new InvalidVisionImageError();
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new InvalidVisionImageError();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString("base64") !== match[2])
    throw new InvalidVisionImageError();
  const { default: sharp } = await import("sharp");
  const decoder = sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
    limitInputChannels: 4,
    failOn: "warning",
    autoOrient: true,
  });
  try {
    const info = await decoder.metadata();
    if (
      info.format !== match[1] ||
      (info.pages ?? 1) !== 1 ||
      !info.width ||
      !info.height ||
      info.width * info.height > MAX_PIXELS
    )
      throw new InvalidVisionImageError();
    const output = await decoder
      .resize(SIDE, SIDE, { fit: "contain", background: "white" })
      .flatten({ background: "white" })
      .jpeg({ quality: 88 })
      .timeout({ seconds: 5 })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch {
    throw new InvalidVisionImageError();
  } finally {
    decoder.destroy();
  }
}

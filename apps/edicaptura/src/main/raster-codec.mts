import { Buffer } from "node:buffer";
import type { BrowserWindow, NativeImage } from "electron";

type ElectronCodec = Pick<typeof import("electron"), "BrowserWindow" | "nativeImage">;
export function webpDimensions(bytes: Buffer) {
  if (
    bytes.length < 20 ||
    bytes.subarray(0, 4).toString() !== "RIFF" ||
    bytes.subarray(8, 12).toString() !== "WEBP" ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  )
    throw new Error("Cabeçalho WebP inválido.");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.subarray(offset, offset + 4).toString(),
      size = bytes.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + size + (size % 2) > bytes.length) throw new Error("WebP truncado.");
    let width = 0,
      height = 0;
    if (kind === "VP8X" && size >= 10) {
      width = 1 + bytes.readUIntLE(start + 4, 3);
      height = 1 + bytes.readUIntLE(start + 7, 3);
    } else if (kind === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (
      kind === "VP8 " &&
      size >= 10 &&
      bytes.subarray(start + 3, start + 6).toString("hex") === "9d012a"
    ) {
      width = bytes.readUInt16LE(start + 6) & 0x3fff;
      height = bytes.readUInt16LE(start + 8) & 0x3fff;
    }
    if (width || height) {
      if (!width || !height || width * height > 100_000_000)
        throw new Error("WebP inválido ou maior que 100 megapixels.");
      return { width, height };
    }
    offset = start + size + (size % 2);
  }
  throw new Error("Dimensões WebP não encontradas.");
}
/** NativeImage supports PNG/JPEG; Chromium supplies the WebP decoder, under main ownership. */
export async function decodeRaster(
  bytes: Uint8Array,
  electron: ElectronCodec,
  maxBytes = 50_000_000,
): Promise<NativeImage> {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maxBytes)
    throw new Error("Imagem inválida ou maior que o limite de bytes.");
  const input = Buffer.from(bytes);
  const native = electron.nativeImage.createFromBuffer(input);
  if (!native.isEmpty()) {
    const size = native.getSize();
    if (size.width * size.height > 100_000_000) throw new Error("Imagem maior que 100 megapixels.");
    return native;
  }
  if (input.subarray(0, 4).toString() !== "RIFF" || input.subarray(8, 12).toString() !== "WEBP")
    throw new Error("Imagem inválida. Importe PNG, JPEG ou WebP.");
  webpDimensions(input); // Bound the canvas before asking Chromium to decode compressed pixels.
  let decoder: BrowserWindow | null = null;
  try {
    decoder = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
        offscreen: true,
      },
    });
    decoder.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    decoder.webContents.on("will-navigate", (event) => event.preventDefault());
    await decoder.loadURL(
      "data:text/html,<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data:; script-src 'none'\"><title>Decodificar imagem local</title>",
    );
    const url = `data:image/webp;base64,${input.toString("base64")}`;
    const png: unknown = await decoder.webContents.executeJavaScript(`(async () => {
      const image = new Image(); image.src = ${JSON.stringify(url)}; await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100000000) throw new Error('Imagem inválida ou maior que 100 megapixels.');
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png');
    })()`);
    if (
      typeof png !== "string" ||
      !png.startsWith("data:image/png;base64,") ||
      png.length > 150_000_000
    )
      throw new Error("Imagem decodificada excede o limite.");
    const image = electron.nativeImage.createFromDataURL(png);
    if (image.isEmpty()) throw new Error("Falha na decodificação WebP.");
    return image;
  } finally {
    decoder?.destroy();
  }
}

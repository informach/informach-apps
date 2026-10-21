import {
  ASSET_BYTES,
  type Asset,
  assetId,
  encodeAssetData,
  extractFontFace,
  type FontAsset,
  fontContainer,
  inspectFont,
  inspectPng,
  inspectWav,
  parseAsset,
  validatePngData,
} from "@informach/edi-motion/assets";
import { decodeFontAsset, decodeImageAsset } from "@informach/edi-motion/assets/browser";

export type AssetImport =
  | { kind: "ready"; asset: Asset; conversion: string | null }
  | {
      kind: "font";
      asset: Omit<FontAsset, "rightsConfirmed" | "licenseNotice">;
      conversion: string;
      /** A collection keeps its source so another face can be chosen before commit. */
      collection?: {
        source: Uint8Array;
        name: string;
        face: number;
        faces: { index: number; family: string; weight: number; italic: boolean }[];
      };
    };
/** Bytes enter through bounded File/native-dialog paths. Actual browser decoding
 * precedes commit; structural headers alone never certify a ready image. */
export async function prepareAssetImport(
  bytes: Uint8Array,
  name: string,
  signal: AbortSignal,
  face = 0,
): Promise<AssetImport> {
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > ASSET_BYTES)
    throw new Error("Recurso vazio ou maior que 4 MB.");
  const filename = name.trim().slice(0, 120) || "Recurso";
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
    ["OTTO", "wOFF", "wOF2", "ttcf"].includes(signature)
  ) {
    // WOFF and collections become one uncompressed face; table bytes are kept.
    const { container, faces } = fontContainer(bytes),
      sfnt = extractFontFace(bytes, face),
      font = inspectFont(sfnt);
    return {
      kind: "font",
      asset: {
        kind: "font",
        mime: font.format === "truetype" ? "font/ttf" : "font/otf",
        name: filename,
        id: assetId(sfnt),
        byteLength: sfnt.length,
        data: encodeAssetData(sfnt),
        ...font,
      },
      conversion: `${
        container === "woff"
          ? "O WOFF será descompactado para TTF/OTF, sem alterar as tabelas da fonte. "
          : container === "collection"
            ? `A face escolhida da coleção (${faces} faces) vira uma fonte avulsa, sem alterar suas tabelas. `
            : ""
      }A fonte será incorporada integralmente ao projeto e aos arquivos exportados. Confirme que sua licença permite editar e redistribuir dessa forma; os flags do arquivo não substituem a licença.`,
      ...(container === "collection"
        ? {
            collection: {
              source: bytes,
              name,
              face,
              faces: Array.from({ length: faces }, (_, index) => {
                const info = inspectFont(extractFontFace(bytes, index));
                return { index, family: info.family, weight: info.weight, italic: info.italic };
              }),
            },
          }
        : {}),
    };
  }
  if (bytes[0] === 137 && bytes[1] === 80) {
    const dimensions = inspectPng(bytes);
    validatePngData(bytes, dimensions);
    let canonical = true;
    try {
      inspectPng(bytes, true);
    } catch {
      canonical = false;
    }
    // Unsupported compressed ICC/text/EXIF chunks never reach platform parsers.
    // The resulting color/profile loss needs explicit consent before commit.
    const safeChunks = dimensions.chunks.filter((chunk) =>
      ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(chunk.type),
    );
    const decodeBytes = canonical
      ? bytes
      : new Uint8Array(8 + safeChunks.reduce((sum, chunk) => sum + chunk.length + 12, 0));
    if (!canonical) {
      decodeBytes.set(bytes.subarray(0, 8));
      let offset = 8;
      for (const chunk of safeChunks) {
        decodeBytes.set(bytes.subarray(chunk.offset, chunk.offset + chunk.length + 12), offset);
        offset += chunk.length + 12;
      }
    }
    const image = await createImageBitmap(
      new Blob([new Uint8Array(decodeBytes).buffer], { type: "image/png" }),
    );
    try {
      signal.throwIfAborted();
      if (image.width !== dimensions.width || image.height !== dimensions.height)
        throw new Error("Dimensões decodificadas incompatíveis.");
      let data = bytes;
      if (!canonical) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        try {
          const context = canvas.getContext("2d", { colorSpace: "srgb" });
          if (!context) throw new Error("Decodificação gráfica indisponível.");
          context.drawImage(image, 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value ? resolve(value) : reject(new Error("Conversão PNG indisponível.")),
              "image/png",
            ),
          );
          signal.throwIfAborted();
          if (blob.size > ASSET_BYTES) throw new Error("Imagem normalizada excede 4 MB.");
          data = new Uint8Array(await blob.arrayBuffer());
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      const asset = parseAsset({
        kind: "image",
        mime: "image/png",
        name: filename,
        id: assetId(data),
        byteLength: data.length,
        data: encodeAssetData(data),
        width: dimensions.width,
        height: dimensions.height,
      });
      if (asset.kind !== "image") throw new Error("Tipo de recurso inesperado.");
      const verified = await decodeImageAsset(asset, signal);
      verified.close();
      return {
        kind: "ready",
        asset,
        conversion: canonical
          ? null
          : "Normalizar para PNG sRGB de 8 bits. Perfis de cor e metadados não suportados são removidos antes da decodificação: as cores podem mudar. O arquivo original não será alterado.",
      };
    } finally {
      image.close();
    }
  }
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF")
    throw new Error(
      "Formato não aceito: use PNG estático, WAV PCM16 ou TTF/OTF descomprimido de face única. WOFF2, coleções e outros codecs requerem conversão explícita.",
    );
  const audio = inspectWav(bytes);
  signal.throwIfAborted();
  return {
    kind: "ready",
    asset: parseAsset({
      kind: "audio",
      mime: "audio/wav",
      name: filename,
      id: assetId(bytes),
      byteLength: bytes.length,
      data: encodeAssetData(bytes),
      channels: audio.channels,
      sampleRate: audio.sampleRate,
      frames: audio.frames,
    }),
    conversion: null,
  };
}
export async function completeAssetImport(
  prepared: AssetImport,
  signal: AbortSignal,
  permission?: { rightsConfirmed: true; licenseNotice: string },
): Promise<Asset> {
  signal.throwIfAborted();
  if (prepared.kind === "ready") return prepared.asset;
  if (permission?.rightsConfirmed !== true)
    throw new Error("Confirme os direitos de incorporação antes de importar a fonte.");
  const asset = parseAsset({ ...prepared.asset, ...permission });
  if (asset.kind !== "font") throw new Error("Fonte esperada.");
  await decodeFontAsset(asset, signal);
  signal.throwIfAborted();
  return asset;
}

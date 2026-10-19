import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  type Asset,
  assetDataUri,
  assetId,
  decodeAssetData,
  encodeAssetData,
  parseAsset,
  parseAssetCatalog,
} from "./model";
import { png, wav } from "./testFixtures";

function image(): Asset {
  const bytes = png();
  return {
    kind: "image",
    mime: "image/png",
    id: assetId(bytes),
    name: "Pixel",
    data: encodeAssetData(bytes),
    byteLength: bytes.length,
    width: 1,
    height: 1,
  };
}
test("aggregate pixel/sample declarations fail before reading or decoding asset bodies", () => {
  const hugeImages = [0, 1].map(() => ({
    kind: "image",
    width: 4000,
    height: 4000,
    get data() {
      throw new Error("Body read before the pixel budget");
    },
  }));
  expect(() => parseAssetCatalog(hugeImages)).toThrow(/pixels\/amostras antes/);
  const hugeAudio = [0, 1].map(() => ({
    kind: "audio",
    frames: 1000000,
    channels: 2,
    get data() {
      throw new Error("Body read before the sample budget");
    },
  }));
  expect(() => parseAssetCatalog(hugeAudio)).toThrow(/pixels\/amostras antes/);
});
test("catalog identity covers real bytes, rejects tampering and metadata lies, and never accepts arbitrary URLs as data", () => {
  const asset = image(),
    data = png();
  expect(asset.id).toBe(`asset-${createHash("sha256").update(data).digest("hex")}`);
  expect(parseAsset(asset)).toEqual(asset);
  expect(assetDataUri(asset)).toBe(`data:image/png;base64,${asset.data}`);
  expect(() => parseAsset({ ...asset, width: 2 })).toThrow(/Dimensões/);
  expect(() => parseAsset({ ...asset, id: `asset-${"0".repeat(64)}` })).toThrow(/Integridade/);
  expect(() => parseAsset({ ...asset, data: "https://example.com/image.png" })).toThrow(/Base64/);
  expect(() => parseAssetCatalog([asset, asset])).toThrow(/duplicado/);
  expect(parseAssetCatalog([asset])).toEqual([asset]);
  const checked = parseAsset(asset);
  expect(parseAsset(checked)).toEqual(asset);
  checked.name = "Renomeado";
  expect(parseAsset(checked).name).toBe("Renomeado");
  if (checked.kind !== "image") throw new Error("Missing image");
  checked.width = 2;
  expect(() => parseAsset(checked)).toThrow(/Dimensões/);
  checked.width = 1;
  checked.data = encodeAssetData(wav());
  expect(() => parseAsset(checked)).toThrow(/Integridade/);
});
test("base64 validation is canonical and stack-bounded on near-limit binary content", () => {
  const bytes = new Uint8Array(3_900_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const encoded = encodeAssetData(bytes),
    decoded = decodeAssetData(encoded);
  expect(decoded.length).toBe(bytes.length);
  expect(decoded[3500000]).toBe(bytes[3500000]);
  expect(() => decodeAssetData("Zh==")).toThrow(/canônico/);
  expect(() => decodeAssetData("Zg==\n")).toThrow(/inválido/);
  expect(() => parseAssetCatalog([{ data: encoded }, { data: encoded }])).toThrow(/orçamento/);
});
test("audio metadata is derived from the actual bounded PCM stream and retained without time rounding", () => {
  const bytes = wav(),
    asset: Asset = {
      kind: "audio",
      mime: "audio/wav",
      id: assetId(bytes),
      name: "Tom",
      data: encodeAssetData(bytes),
      byteLength: bytes.length,
      channels: 1,
      sampleRate: 8000,
      frames: 128,
    };
  expect(parseAssetCatalog([asset])).toEqual([asset]);
  expect(() => parseAsset({ ...asset, frames: 127 })).toThrow(/Metadados/);
  expect(() =>
    parseAsset({
      ...asset,
      kind: "image",
      mime: "image/png",
      width: 1,
      height: 1,
      channels: undefined,
      sampleRate: undefined,
      frames: undefined,
    }),
  ).toThrow();
});

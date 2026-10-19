import { expect, test } from "vitest";
import { type AudioAsset, assetId, encodeAssetData } from "../assets/model";
import { wav } from "../assets/testFixtures";
import { parseAudioDocument } from "./model";
import { decodePcmAsset } from "./pcm";

test("PCM16 conversion preserves signed amplitudes and validates event/resource/caption references", () => {
  const bytes = wav(4);
  bytes.writeInt16LE(-32768, 44);
  bytes.writeInt16LE(-1, 46);
  bytes.writeInt16LE(0, 48);
  bytes.writeInt16LE(32767, 50);
  const asset: AudioAsset = {
      kind: "audio",
      mime: "audio/wav",
      id: assetId(bytes),
      name: "Amostra",
      byteLength: bytes.length,
      data: encodeAssetData(bytes),
      sampleRate: 8000,
      channels: 1,
      frames: 4,
    },
    pcm = decodePcmAsset(asset);
  expect([...(pcm.channels[0] ?? [])]).toEqual([-1, -1 / 32768, 0, 32767 / 32768]);
  const binding = {
      id: "audio-click",
      eventId: "event-click",
      assetId: asset.id,
      volume: 0.5,
      caption: "Som de confirmação",
    },
    assets = new Map([[asset.id, asset]]),
    events = new Set(["event-click"]),
    document = { version: 1, bindings: [binding] };
  expect(parseAudioDocument(document, assets, events).bindings[0]).toEqual(binding);
  expect(() =>
    parseAudioDocument({ ...document, bindings: [binding, binding] }, assets, events),
  ).toThrow(/duplicados/);
  expect(() => parseAudioDocument(document, new Map(), events)).toThrow(/recurso/);
  expect(() => parseAudioDocument(document, assets, new Set())).toThrow(/evento/);
  expect(() =>
    parseAudioDocument({ ...document, bindings: [{ ...binding, caption: "" }] }, assets, events),
  ).toThrow();
});

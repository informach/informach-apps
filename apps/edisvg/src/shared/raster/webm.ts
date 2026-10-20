import { ByteWriter } from "./bytes";
import type { VideoSample } from "./mp4";

export interface WebmSettings {
  width: number;
  height: number;
  /** Microsecond presentation timestamps, one per sample, from the frame plan. */
  timestamps: readonly number[];
  durationMicroseconds: number;
  limit: number;
}

type Element = { id: number; body: Uint8Array };
function idBytes(id: number) {
  const bytes: number[] = [];
  for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return bytes;
}
function sizeBytes(size: number) {
  if (size < 0x7f) return [0x80 | size];
  if (size < 0x3fff) return [0x40 | (size >> 8), size & 0xff];
  if (size < 0x1fffff) return [0x20 | (size >> 16), (size >> 8) & 0xff, size & 0xff];
  if (size < 0x0fffffff)
    return [0x10 | (size >>> 24), (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff];
  // Eight-byte size: large segments stay explicit instead of "unknown size".
  const bytes = [0x01];
  for (let shift = 48; shift >= 0; shift -= 8) bytes.push(Math.floor(size / 2 ** shift) & 0xff);
  return bytes;
}
function concat(parts: readonly ArrayLike<number>[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0),
    out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function element(id: number, body: ArrayLike<number>): Element {
  return { id, body: body instanceof Uint8Array ? body : Uint8Array.from(body) };
}
function encode({ id, body }: Element) {
  return concat([idBytes(id), sizeBytes(body.length), body]);
}
function master(id: number, children: readonly Element[]) {
  return element(id, concat(children.map(encode)));
}
function uint(id: number, value: number) {
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest & 0xff);
  return element(id, bytes.length ? bytes : [0]);
}
function text(id: number, value: string) {
  return element(
    id,
    Array.from(value, (char) => {
      const code = char.charCodeAt(0);
      if (code > 0x7f) throw new Error("Texto WebM deve ser ASCII.");
      return code;
    }),
  );
}
function float64(id: number, value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return element(id, bytes);
}
const ID = {
  ebml: 0x1a45dfa3,
  ebmlVersion: 0x4286,
  ebmlReadVersion: 0x42f7,
  maxIdLength: 0x42f2,
  maxSizeLength: 0x42f3,
  docType: 0x4282,
  docTypeVersion: 0x4287,
  docTypeReadVersion: 0x4285,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  seek: 0x4dbb,
  seekId: 0x53ab,
  seekPosition: 0x53ac,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  duration: 0x4489,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackUid: 0x73c5,
  trackType: 0x83,
  flagLacing: 0x9c,
  codecId: 0x86,
  defaultDuration: 0x23e383,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  cluster: 0x1f43b675,
  timestamp: 0xe7,
  simpleBlock: 0xa3,
  cues: 0x1c53bb6b,
  cuePoint: 0xbb,
  cueTime: 0xb3,
  cueTrackPositions: 0xb7,
  cueTrack: 0xf7,
  cueClusterPosition: 0xf1,
} as const;
/** Clusters stay under the signed 16-bit block offset with a margin (milliseconds). */
const CLUSTER_SPAN = 5000;

/** VP9 WebM with millisecond timestamps, clusters opened on key frames and cues for seeking.
 * The whole file is in memory, so every size is explicit and the seek head is exact. */
export function muxWebm(settings: WebmSettings, samples: readonly VideoSample[]): Uint8Array {
  const { timestamps } = settings;
  if (!samples.length) throw new Error("Vídeo sem quadros.");
  if (timestamps.length !== samples.length) throw new Error("Tempos de quadros incompatíveis.");
  if (!samples[0]?.key) throw new Error("O primeiro quadro do vídeo precisa ser chave.");
  const header = master(ID.ebml, [
    uint(ID.ebmlVersion, 1),
    uint(ID.ebmlReadVersion, 1),
    uint(ID.maxIdLength, 4),
    uint(ID.maxSizeLength, 8),
    text(ID.docType, "webm"),
    uint(ID.docTypeVersion, 4),
    uint(ID.docTypeReadVersion, 2),
  ]);
  const info = master(ID.info, [
    uint(ID.timestampScale, 1_000_000),
    float64(ID.duration, settings.durationMicroseconds / 1000),
    text(ID.muxingApp, "EdiSVG"),
    text(ID.writingApp, "EdiSVG"),
  ]);
  const frameDuration =
    samples.length > 1
      ? Math.round(((timestamps[1] ?? 0) - (timestamps[0] ?? 0)) * 1000)
      : Math.round(settings.durationMicroseconds * 1000);
  const tracks = master(ID.tracks, [
    master(ID.trackEntry, [
      uint(ID.trackNumber, 1),
      uint(ID.trackUid, 1),
      uint(ID.trackType, 1),
      uint(ID.flagLacing, 0),
      text(ID.codecId, "V_VP9"),
      uint(ID.defaultDuration, frameDuration),
      master(ID.video, [
        uint(ID.pixelWidth, settings.width),
        uint(ID.pixelHeight, settings.height),
      ]),
    ]),
  ]);
  const clusters: { time: number; bytes: Uint8Array }[] = [];
  let current: { time: number; blocks: Element[] } | null = null;
  const close = () => {
    if (!current) return;
    clusters.push({
      time: current.time,
      bytes: encode(master(ID.cluster, [uint(ID.timestamp, current.time), ...current.blocks])),
    });
    current = null;
  };
  let lastTime = -1;
  for (const [index, sample] of samples.entries()) {
    const time = Math.round((timestamps[index] ?? 0) / 1000);
    if (time < lastTime) throw new Error("Tempos de vídeo fora de ordem.");
    lastTime = time;
    if (!current || sample.key) {
      close();
      current = { time, blocks: [] };
    }
    const cluster: { time: number; blocks: Element[] } = current,
      relative = time - cluster.time;
    if (relative > CLUSTER_SPAN)
      throw new Error("Intervalo entre quadros-chave excede o limite do cluster WebM.");
    cluster.blocks.push(
      element(
        ID.simpleBlock,
        concat([
          [0x81, (relative >> 8) & 0xff, relative & 0xff, sample.key ? 0x80 : 0],
          sample.data,
        ]),
      ),
    );
  }
  close();
  // Layout: SeekHead, Info, Tracks, Clusters, Cues. Positions are relative to the segment
  // data start; the seek head has a fixed size because its positions use 8-byte integers.
  const position = (id: number, offset: number) =>
    master(ID.seek, [
      element(ID.seekId, idBytes(id)),
      element(
        ID.seekPosition,
        (() => {
          const bytes = new Uint8Array(8);
          new DataView(bytes.buffer).setBigUint64(0, BigInt(offset));
          return bytes;
        })(),
      ),
    ]);
  const seekHeadFor = (infoAt: number, tracksAt: number, cuesAt: number) =>
    encode(
      master(ID.seekHead, [
        position(ID.info, infoAt),
        position(ID.tracks, tracksAt),
        position(ID.cues, cuesAt),
      ]),
    );
  const seekSize = seekHeadFor(0, 0, 0).length,
    infoBytes = encode(info),
    tracksBytes = encode(tracks),
    infoAt = seekSize,
    tracksAt = infoAt + infoBytes.length,
    clustersAt = tracksAt + tracksBytes.length;
  let offset = clustersAt;
  const cuePoints: Element[] = [];
  for (const cluster of clusters) {
    cuePoints.push(
      master(ID.cuePoint, [
        uint(ID.cueTime, cluster.time),
        master(ID.cueTrackPositions, [uint(ID.cueTrack, 1), uint(ID.cueClusterPosition, offset)]),
      ]),
    );
    offset += cluster.bytes.length;
  }
  const cuesBytes = encode(master(ID.cues, cuePoints)),
    seekHead = seekHeadFor(infoAt, tracksAt, offset);
  if (seekHead.length !== seekSize) throw new Error("Índice WebM inconsistente.");
  const segmentSize =
    seekHead.length +
    infoBytes.length +
    tracksBytes.length +
    clusters.reduce((sum, cluster) => sum + cluster.bytes.length, 0) +
    cuesBytes.length;
  const out = new ByteWriter(settings.limit, segmentSize + 64);
  out.bytes(encode(header));
  out.bytes(idBytes(ID.segment));
  out.bytes(sizeBytes(segmentSize));
  out.bytes(seekHead);
  out.bytes(infoBytes);
  out.bytes(tracksBytes);
  for (const cluster of clusters) out.bytes(cluster.bytes);
  out.bytes(cuesBytes);
  return out.finish();
}

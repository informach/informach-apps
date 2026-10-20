import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { strFromU8, unzipSync } from "fflate";
import {
  decodeGif,
  ebmlUint,
  findMp4Box,
  readEbml,
  readMp4Boxes,
} from "../../../tests/rasterDecoders";
import { executeDocumentTransaction } from "../documentCommands";
import { newProject } from "../project";
import { createGifEncoder } from "./gif";
import { muxMp4 } from "./mp4";
import {
  inspectRasterExport,
  planRasterFrames,
  RASTER_LIMITS,
  rasterHeightFor,
  timelineProject,
} from "./profile";
import { packPngSequence, sequenceFileName } from "./sequence";
import { muxWebm } from "./webm";

function clipProject(mode: "loop" | "once" | "ping-pong" = "loop", frames = 30) {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID();
  const result = executeDocumentTransaction(
    { project, revision, sessionId },
    {
      projectId: project.id,
      sessionId,
      revision,
      commands: [
        { type: "scene", operation: "add", targetId: null, value: "rect" },
        {
          type: "motion",
          command: {
            type: "create-animation",
            animation: {
              id: "animation-raster",
              name: "Raster",
              frames,
              fps: 30,
              mode,
              tracks: [],
            },
          },
        },
      ],
    },
  );
  project = result.project;
  revision = result.revision;
  const board = project.artboards[0];
  assert.ok(board);
  return { project, boardId: board.id };
}
const consented = {
  confirmRaster: true,
  confirmAnimationOnly: true,
  confirmPalette: true,
};

test("frame plans follow the clip clock: loops omit the end, once keeps it, ping-pong covers both ways", () => {
  const loop = planRasterFrames({ fps: 30, frames: 30, mode: "loop" }, 30);
  assert.equal(loop.times.length, 30);
  assert.equal(loop.times[29], 29 / 30);
  assert.equal(loop.loop, true);
  const once = planRasterFrames({ fps: 30, frames: 30, mode: "once" }, 30);
  assert.equal(once.times.length, 31);
  assert.equal(once.times.at(-1), 1);
  assert.equal(once.loop, false);
  const pingPong = planRasterFrames({ fps: 30, frames: 30, mode: "ping-pong" }, 30);
  assert.equal(pingPong.times.length, 60);
  const resampled = planRasterFrames({ fps: 24, frames: 48, mode: "loop" }, 60);
  assert.equal(resampled.times.length, 120);
  for (const plan of [loop, once, pingPong, resampled]) {
    for (let index = 1; index < plan.timestamps.length; index++)
      assert.equal(
        plan.timestamps[index],
        (plan.timestamps[index - 1] ?? 0) + (plan.durations[index - 1] ?? 0),
      );
    const fps = plan === resampled ? 60 : 30;
    assert.equal(
      plan.delays.reduce((sum, delay) => sum + delay, 0),
      Math.round((100 * plan.times.length) / fps),
    );
  }
  // 30 FPS cannot be exact in centiseconds; the cumulative rounding alternates 3/3/4.
  assert.deepEqual(loop.delays.slice(0, 3), [3, 4, 3]);
  assert.throws(
    () => planRasterFrames({ fps: 60, frames: 360000, mode: "loop" }, 60),
    /limite é 3600/,
  );
  assert.throws(() => planRasterFrames({ fps: 30, frames: 30, mode: "loop" }, 0), /FPS/);
});

test("proportional sizes and the report gate every format with explicit consents", () => {
  assert.equal(rasterHeightFor([0, 0, 1080, 1080], 640, true), 640);
  assert.equal(rasterHeightFor([0, 0, 1000, 333], 101, true), 34);
  assert.equal(rasterHeightFor([0, 0, 1000, 333], 101, false), 34);
  assert.equal(rasterHeightFor([0, 0, 300, 101], 300, true), 102);
  const { project, boardId } = clipProject();
  const base = {
    artboardId: boardId,
    animationId: "animation-raster",
    width: 320,
    height: 320,
    fps: 30,
    background: "#ffffff",
  };
  const blocked = inspectRasterExport(project, { ...base, format: "png-sequence" });
  assert.equal(blocked.supported, false);
  assert.deepEqual(
    blocked.issues.map((issue) => issue.code),
    ["consent-raster"],
  );
  assert.equal(
    inspectRasterExport(project, { ...base, format: "png-sequence", confirmRaster: true })
      .supported,
    true,
  );
  const gif = inspectRasterExport(project, { ...base, format: "gif", confirmRaster: true });
  assert.deepEqual(
    gif.issues.map((issue) => issue.code),
    ["consent-palette"],
  );
  const codes = (input: Partial<typeof base> & { format: "gif" | "mp4" | "webm" }) =>
    inspectRasterExport(project, { ...base, ...consented, ...input }).issues.map(
      (issue) => issue.code,
    );
  assert.deepEqual(codes({ format: "mp4", background: "transparent" }), [
    "opaque-video",
    "video-loop",
  ]);
  assert.deepEqual(codes({ format: "webm", width: 321 }), ["even-size", "video-loop"]);
  assert.deepEqual(codes({ format: "gif", fps: 60 }), ["gif-fps", "resample"]);
  assert.deepEqual(codes({ format: "gif", width: 1922 }), ["gif-size"]);
  assert.deepEqual(codes({ format: "mp4", fps: 24 }), ["resample", "video-loop"]);
  const long = clipProject("loop", 300);
  assert.deepEqual(
    inspectRasterExport(long.project, {
      ...base,
      ...consented,
      artboardId: long.boardId,
      format: "gif",
      width: 1920,
      height: 1920,
      fps: 30,
    }).issues.map((issue) => issue.code),
    ["budget"],
  );
  assert.equal(
    inspectRasterExport(project, { ...base, ...consented, format: "mp4", animationId: "nope" })
      .issues[0]?.code,
    "animation",
  );
  assert.throws(() =>
    inspectRasterExport(project, { ...base, format: "mp4", width: RASTER_LIMITS.maxSide + 1 }),
  );
  assert.throws(
    () => inspectRasterExport(project, { ...base, format: "mp4", background: "red" }),
    /#rrggbb/,
  );
});

test("an interactive artboard needs the timeline-only consent and exports without its machines", () => {
  const { project, boardId } = clipProject();
  const board = project.artboards[0];
  assert.ok(board);
  board.behavior = {
    ...emptyBehavior(),
    machines: [{ id: "machine-a", name: "Principal", layers: [] }],
    defaultMachineId: "machine-a",
  };
  const options = {
    format: "png-sequence" as const,
    artboardId: boardId,
    animationId: "animation-raster",
    width: 64,
    height: 64,
    fps: 30,
    background: "transparent",
    confirmRaster: true,
  };
  const report = inspectRasterExport(project, options);
  assert.equal(report.requiresAnimationOnlyConsent, true);
  assert.deepEqual(
    report.issues.map((issue) => issue.code),
    ["consent-animation"],
  );
  assert.equal(
    inspectRasterExport(project, { ...options, confirmAnimationOnly: true }).supported,
    true,
  );
  const copy = timelineProject(project, boardId);
  assert.deepEqual(copy.artboards[0]?.behavior?.machines, []);
  assert.equal(copy.artboards[0]?.behavior?.defaultMachineId, null);
  assert.equal(project.artboards[0]?.behavior?.machines.length, 1);
});

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return data;
}
test("GIF frames decode to the exact pixels, delays, disposal and loop flag", () => {
  const width = 7,
    height = 5,
    first = solid(width, height, [255, 0, 0, 255]),
    second = first.slice();
  second.set([0, 0, 255, 255], (2 * width + 3) * 4);
  const third = solid(width, height, [0, 0, 0, 0]);
  third.set([0, 255, 0, 200], (1 * width + 1) * 4);
  third.set([0, 255, 0, 100], (1 * width + 2) * 4);
  const encoder = createGifEncoder({ width, height, loop: true, limit: 1e6 });
  encoder.addFrame(first, 3);
  encoder.addFrame(second, 4);
  encoder.addFrame(third, 3);
  encoder.addFrame(first, 3);
  const decoded = decodeGif(encoder.finish());
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.equal(decoded.loop, true);
  assert.deepEqual(
    decoded.frames.map((frame) => frame.delay),
    [3, 4, 3, 3],
  );
  // The frame before a transparent one restores to background, so nothing leaks through.
  assert.deepEqual(
    decoded.frames.map((frame) => frame.disposal),
    [1, 2, 2, 1],
  );
  assert.deepEqual(decoded.frames[0]?.rgba, first);
  assert.deepEqual(decoded.frames[1]?.rgba, second);
  const expectedThird = new Uint8ClampedArray(width * height * 4);
  expectedThird.set([0, 255, 0, 255], (1 * width + 1) * 4);
  assert.deepEqual(decoded.frames[2]?.rgba, expectedThird);
  assert.deepEqual(decoded.frames[3]?.rgba, first);
  const once = createGifEncoder({ width: 2, height: 2, loop: false, limit: 1e6 });
  once.addFrame(solid(2, 2, [0, 0, 0, 255]), 10);
  assert.equal(decodeGif(once.finish()).loop, false);
});

test("GIF keeps up to 256 exact colours and stays close beyond that, through LZW table resets", () => {
  const width = 128,
    height = 128,
    palette = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++)
    palette.set([(index % 16) * 17, (Math.floor(index / 16) % 16) * 17, 128, 255], index * 4);
  const exact = createGifEncoder({ width, height, loop: false, limit: 4e6 });
  exact.addFrame(palette, 2);
  assert.deepEqual(decodeGif(exact.finish()).frames[0]?.rgba, palette);
  let seed = 7;
  const noise = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < noise.length; offset += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    noise.set([seed & 0xff, (seed >>> 8) & 0xff, (seed >>> 16) & 0xff, 255], offset);
  }
  const lossy = createGifEncoder({ width, height, loop: false, limit: 4e6 });
  lossy.addFrame(noise, 2);
  const decoded = decodeGif(lossy.finish()).frames[0]?.rgba;
  assert.ok(decoded);
  let error = 0;
  for (let offset = 0; offset < noise.length; offset++)
    error += Math.abs((decoded[offset] ?? 0) - (noise[offset] ?? 0));
  // Uniform noise is the worst case for 256 colours; the mean channel error stays bounded.
  assert.ok(error / noise.length < 40, `mean error ${error / noise.length}`);
  const small = createGifEncoder({ width: 4, height: 4, loop: false, limit: 64 });
  small.addFrame(noise.subarray(0, 64), 2);
  assert.throws(() => small.finish(), /limite/);
  assert.throws(
    () => createGifEncoder({ width: 4, height: 4, loop: false, limit: 1e6 }).finish(),
    /sem quadros/,
  );
});

const AVCC = Uint8Array.from([
  1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xee,
]);
test("MP4 has the movie box first, exact constant timing and offsets that reach every sample", () => {
  const samples = [
    { data: Uint8Array.from([0, 0, 0, 2, 0x65, 1]), key: true },
    { data: Uint8Array.from([0, 0, 0, 1, 0x41]), key: false },
    { data: Uint8Array.from([0, 0, 0, 3, 0x41, 2, 3]), key: false },
  ];
  const bytes = muxMp4(
      { width: 64, height: 48, fps: 30, avcConfiguration: AVCC, limit: 1e6 },
      samples,
    ),
    boxes = readMp4Boxes(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.deepEqual(
    boxes.map((box) => box.type),
    ["ftyp", "moov", "mdat"],
  );
  const mvhd = findMp4Box(boxes, ["moov", "mvhd"]);
  assert.equal(view.getUint32(mvhd.start + 20), 30000);
  assert.equal(view.getUint32(mvhd.start + 24), 3000);
  const stbl = ["moov", "trak", "mdia", "minf", "stbl"],
    stts = findMp4Box(boxes, [...stbl, "stts"]),
    stss = findMp4Box(boxes, [...stbl, "stss"]),
    stsz = findMp4Box(boxes, [...stbl, "stsz"]),
    stco = findMp4Box(boxes, [...stbl, "stco"]),
    stsd = findMp4Box(boxes, [...stbl, "stsd"]);
  assert.deepEqual([view.getUint32(stts.start + 16), view.getUint32(stts.start + 20)], [3, 1000]);
  assert.deepEqual([view.getUint32(stss.start + 12), view.getUint32(stss.start + 16)], [1, 1]);
  assert.equal(view.getUint32(stsz.start + 16), 3);
  const tkhd = findMp4Box(boxes, ["moov", "trak", "tkhd"]);
  assert.equal(view.getUint32(tkhd.start + 84), 64 * 0x10000);
  assert.equal(view.getUint32(tkhd.start + 88), 48 * 0x10000);
  let offset = view.getUint32(stco.start + 16);
  const mdat = boxes[2];
  assert.ok(mdat);
  assert.equal(offset, mdat.start + 8);
  for (const [index, sample] of samples.entries()) {
    assert.equal(view.getUint32(stsz.start + 20 + index * 4), sample.data.length);
    assert.deepEqual(bytes.subarray(offset, offset + sample.data.length), sample.data);
    offset += sample.data.length;
  }
  assert.equal(offset, bytes.length);
  const avcC = bytes.indexOf(0x61, stsd.start + 100);
  assert.ok(avcC > 0);
  assert.equal(
    String.fromCharCode(...bytes.subarray(stsd.start + 16 + 4, stsd.start + 16 + 8)),
    "avc1",
  );
  assert.throws(
    () => muxMp4({ width: 64, height: 48, fps: 30, avcConfiguration: AVCC, limit: 1e6 }, []),
    /sem quadros/,
  );
  assert.throws(
    () =>
      muxMp4({ width: 64, height: 48, fps: 30, avcConfiguration: AVCC, limit: 1e6 }, [
        { data: samples[1]?.data ?? new Uint8Array(), key: false },
      ]),
    /chave/,
  );
  assert.throws(
    () =>
      muxMp4(
        { width: 64, height: 48, fps: 30, avcConfiguration: new Uint8Array(3), limit: 1e6 },
        samples,
      ),
    /avcC/,
  );
});

test("WebM sizes, clusters on key frames and cues that point at their clusters", () => {
  const plan = planRasterFrames({ fps: 10, frames: 70, mode: "loop" }, 10),
    samples = plan.times.map((_, index) => ({
      data: Uint8Array.from([index, index ^ 0xff, 7]),
      key: index % 20 === 0,
    }));
  const bytes = muxWebm(
      {
        width: 64,
        height: 32,
        timestamps: plan.timestamps,
        durationMicroseconds: (plan.timestamps.at(-1) ?? 0) + (plan.durations.at(-1) ?? 0),
        limit: 1e6,
      },
      samples,
    ),
    [ebml, segment, ...rest] = readEbml(bytes);
  assert.equal(rest.length, 0);
  assert.ok(ebml && segment);
  assert.equal(segment.dataStart + segment.size, bytes.length);
  const docType = ebml.children.find((node) => node.id === 0x4282);
  assert.ok(docType);
  assert.equal(
    String.fromCharCode(...bytes.subarray(docType.dataStart, docType.dataStart + docType.size)),
    "webm",
  );
  const clusters = segment.children.filter((node) => node.id === 0x1f43b675);
  assert.equal(clusters.length, 4);
  assert.equal(
    clusters.reduce(
      (sum, cluster) => sum + cluster.children.filter((node) => node.id === 0xa3).length,
      0,
    ),
    70,
  );
  const cues = segment.children.find((node) => node.id === 0x1c53bb6b);
  assert.ok(cues);
  for (const [index, point] of cues.children.entries()) {
    const time = point.children.find((node) => node.id === 0xb3),
      position = point.children
        .find((node) => node.id === 0xb7)
        ?.children.find((node) => node.id === 0xf1);
    assert.ok(time && position);
    assert.equal(ebmlUint(bytes, time), index * 2000);
    assert.equal(segment.dataStart + ebmlUint(bytes, position), clusters[index]?.start);
  }
  const seekHead = segment.children[0];
  assert.equal(seekHead?.id, 0x114d9b74);
  for (const seek of seekHead?.children ?? []) {
    const id = seek.children.find((node) => node.id === 0x53ab),
      at = seek.children.find((node) => node.id === 0x53ac);
    assert.ok(id && at);
    const target: number = segment.dataStart + ebmlUint(bytes, at);
    assert.deepEqual(
      bytes.subarray(target, target + id.size),
      bytes.subarray(id.dataStart, id.dataStart + id.size),
    );
  }
  const block = clusters[1]?.children.find((node) => node.id === 0xa3);
  assert.ok(block);
  assert.deepEqual(
    Array.from(bytes.subarray(block.dataStart, block.dataStart + 4)),
    [0x81, 0, 0, 0x80],
  );
  assert.throws(
    () =>
      muxWebm(
        { width: 64, height: 32, timestamps: [0, 6e6], durationMicroseconds: 7e6, limit: 1e6 },
        [
          { data: new Uint8Array([0]), key: true },
          { data: new Uint8Array([1]), key: false },
        ],
      ),
    /cluster/,
  );
});

test("PNG sequences store the frames byte for byte with their timing manifest", () => {
  const plan = planRasterFrames({ fps: 10, frames: 2, mode: "once" }, 10),
    png = (value: number) =>
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, value]),
    frames = plan.times.map((_, index) => png(index));
  const settings = {
      name: "Teste",
      width: 4,
      height: 4,
      fps: 10,
      background: "transparent",
      limit: 1e6,
    },
    archive = packPngSequence(frames, plan, settings),
    files = unzipSync(archive);
  assert.deepEqual(
    Object.keys(files).sort(),
    [sequenceFileName(0), sequenceFileName(1), sequenceFileName(2), "sequence.json"].sort(),
  );
  for (const [index, frame] of frames.entries())
    assert.deepEqual(files[sequenceFileName(index)], frame);
  const manifest = JSON.parse(strFromU8(files["sequence.json"] ?? new Uint8Array()));
  assert.equal(manifest.frames, 3);
  assert.equal(manifest.loop, false);
  assert.equal(manifest.files[2].time, 0.2);
  assert.deepEqual(packPngSequence(frames, plan, settings), archive);
  assert.throws(
    () => packPngSequence([new Uint8Array(9), ...frames.slice(1)], plan, settings),
    /PNG inválido/,
  );
  assert.throws(() => packPngSequence(frames.slice(1), plan, settings), /incompatível/);
});

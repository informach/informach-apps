import assert from "node:assert/strict";
import { test } from "node:test";
import { rasterOptionsSchema } from "../../../shared/raster/profile";
import { avcCodecFor, videoConfig } from "./rasterExport";

test("H.264 uses the lowest High-profile level that fits the frame size and macroblock rate", () => {
  assert.equal(avcCodecFor(320, 240, 30), "avc1.64001e");
  assert.equal(avcCodecFor(1280, 720, 30), "avc1.64001f");
  assert.equal(avcCodecFor(1280, 720, 60), "avc1.640020");
  assert.equal(avcCodecFor(1920, 1080, 30), "avc1.640028");
  assert.equal(avcCodecFor(1920, 1080, 60), "avc1.64002a");
  assert.equal(avcCodecFor(3840, 2160, 30), "avc1.640033");
  assert.equal(avcCodecFor(3840, 2160, 60), "avc1.640034");
  assert.throws(() => avcCodecFor(3840, 3840, 60), /níveis H.264/);
});

test("video encoder settings are software, presentation-ordered and bounded in bitrate", () => {
  const options = (input: Record<string, unknown>) =>
    rasterOptionsSchema.parse({
      format: "mp4",
      artboardId: "board",
      animationId: "clip",
      width: 1920,
      height: 1080,
      fps: 30,
      background: "#ffffff",
      ...input,
    });
  const standard = videoConfig(options({})),
    high = videoConfig(options({ quality: "high" }));
  assert.equal(standard.hardwareAcceleration, "prefer-software");
  assert.deepEqual(standard.avc, { format: "avc" });
  assert.equal(high.bitrate, (standard.bitrate ?? 0) * 2);
  assert.equal(videoConfig(options({ width: 16, height: 16, fps: 1 })).bitrate, 4e5);
  assert.equal(
    videoConfig(options({ width: 3840, height: 3840, fps: 60, quality: "high", format: "webm" }))
      .bitrate,
    80e6,
  );
  assert.equal(videoConfig(options({ format: "webm" })).codec, "vp09.00.40.08");
  assert.equal(
    videoConfig(options({ format: "webm", width: 3840, height: 2160 })).codec,
    "vp09.00.50.08",
  );
  assert.equal(videoConfig(options({ format: "webm" })).avc, undefined);
});

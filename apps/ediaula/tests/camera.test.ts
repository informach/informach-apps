import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  cameraInputArgs,
  cameraModeLabel,
  chooseCameraMode,
  parseDshowOptions,
} from "../src/shared/camera.ts";

// FFmpeg 9's listing of a Logitech C920 (`-list_options true -f dshow -i video=…`).
const listing = await readFile(new URL("./fixtures/dshow-options.txt", import.meta.url), "utf8");
const modes = parseDshowOptions(listing);

test("the dshow listing becomes each mode once (newer FFmpeg prints each twice)", () => {
  assert.equal(modes.length, 53);
  assert.deepEqual(
    modes.find((m) => m.codec === "mjpeg" && m.width === 1920),
    { codec: "mjpeg", width: 1920, height: 1080, minFps: 5, maxFps: 30 },
  );
  assert.deepEqual(
    modes.find((m) => m.pixelFormat === "yuyv422" && m.width === 1280),
    { pixelFormat: "yuyv422", width: 1280, height: 720, minFps: 5, maxFps: 10 },
  );
  assert.ok(modes.some((m) => m.pixelFormat === "yuyv422" && m.maxFps === 7.5));
  assert.deepEqual(parseDshowOptions("Error opening input file video=Nada."), []);
});

test("MJPEG up to 1080p at the rate asked for comes first", () => {
  assert.deepEqual(chooseCameraMode(modes, 30), {
    codec: "mjpeg",
    width: 1920,
    height: 1080,
    fps: 30,
  });
  assert.equal(
    cameraModeLabel({ codec: "mjpeg", width: 1920, height: 1080, fps: 30 }),
    "1920 × 1080 · MJPEG · 30 qps",
  );
});

test("without MJPEG, NV12 or YUYV up to 720p that keeps the rate; else the largest there is", () => {
  const raw = modes.filter((m) => m.pixelFormat);
  // 960×720 and 1280×720 drop to 15 and 10 qps on this camera: 800×448 keeps 30.
  assert.deepEqual(chooseCameraMode(raw, 30), {
    pixelFormat: "yuyv422",
    width: 800,
    height: 448,
    fps: 30,
  });
  const slow = [
    { pixelFormat: "yuyv422", width: 1920, height: 1080, minFps: 5, maxFps: 5 },
    { codec: "h264", width: 1280, height: 720, minFps: 5, maxFps: 15 },
  ];
  assert.deepEqual(chooseCameraMode(slow, 30), {
    pixelFormat: "yuyv422",
    width: 1920,
    height: 1080,
    fps: 5,
  });
  assert.equal(chooseCameraMode([], 30), null);
  // 29.97 counts as 30.
  assert.equal(
    chooseCameraMode([{ codec: "mjpeg", width: 1280, height: 720, minFps: 5, maxFps: 29.97 }], 30)
      ?.width,
    1280,
  );
});

test("a mode becomes dshow input options", () => {
  assert.deepEqual(cameraInputArgs({ codec: "mjpeg", width: 1920, height: 1080, fps: 30 }), [
    "-vcodec",
    "mjpeg",
    "-video_size",
    "1920x1080",
    "-framerate",
    "30",
  ]);
  assert.deepEqual(cameraInputArgs({ pixelFormat: "nv12", width: 1280, height: 720, fps: 30 }), [
    "-pixel_format",
    "nv12",
    "-video_size",
    "1280x720",
    "-framerate",
    "30",
  ]);
});

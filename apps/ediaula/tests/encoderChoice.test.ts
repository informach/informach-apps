import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTURE_CODECS,
  captureFilter,
  captureVideoArgs,
  chooseCaptureEncoder,
  colorFromLuma,
  conversionsFor,
  type EncoderProbe,
  MIN_CAPTURE_FPS,
  parseSpeed,
} from "../src/shared/encoderChoice.ts";

const probe = (
  codec: EncoderProbe["codec"],
  conversion: EncoderProbe["conversion"],
  fps: number,
  ok = true,
): EncoderProbe => ({ codec, conversion, ok, fps });

test("hardware comes first in the order NVENC, AMF, Media Foundation, then x264", () => {
  assert.deepEqual(CAPTURE_CODECS, ["h264_nvenc", "h264_amf", "h264_mf", "libx264"]);
  const all = [
    probe("libx264", "cpu", 300),
    probe("h264_mf", "encoder", 200),
    probe("h264_amf", "scale_d3d11", 150),
    probe("h264_nvenc", "cpu", 120),
  ];
  assert.equal(chooseCaptureEncoder(all).codec, "h264_nvenc");
  assert.equal(chooseCaptureEncoder(all.slice(0, 3)).codec, "h264_amf");
  assert.equal(chooseCaptureEncoder(all.slice(0, 2)).codec, "h264_mf");
  assert.equal(chooseCaptureEncoder(all.slice(0, 1)).codec, "libx264");
});

test("within one encoder, frames that stay on the GPU win over system memory", () => {
  const choice = chooseCaptureEncoder([
    probe("h264_amf", "cpu", 400),
    probe("h264_amf", "encoder", 90),
    probe("h264_amf", "scale_d3d11", 0, false),
  ]);
  assert.deepEqual(choice, {
    codec: "h264_amf",
    gpuInput: true,
    conversion: "encoder",
    fps1080: 90,
  });
  assert.deepEqual(conversionsFor("libx264"), ["cpu"]);
  assert.deepEqual(conversionsFor("h264_mf"), ["scale_d3d11", "encoder", "cpu"]);
});

test("an encoder that cannot keep up with 1080p60 is passed over, not trusted", () => {
  const slowHardware = [
    probe("h264_mf", "encoder", MIN_CAPTURE_FPS - 1),
    probe("libx264", "cpu", 95),
  ];
  assert.equal(chooseCaptureEncoder(slowHardware).codec, "libx264");
  // When nothing keeps up, the fastest one that works.
  const allSlow = [
    probe("h264_nvenc", "encoder", 0, false),
    probe("h264_mf", "cpu", 50),
    probe("libx264", "cpu", 35),
  ];
  assert.deepEqual(chooseCaptureEncoder(allSlow), {
    codec: "h264_mf",
    gpuInput: false,
    conversion: "cpu",
    fps1080: 50,
  });
  assert.throws(
    () => chooseCaptureEncoder([probe("libx264", "cpu", 0, false)]),
    /Nenhum codificador/,
  );
});

test("speed comes from FFmpeg's last progress report", () => {
  assert.equal(
    parseSpeed(
      "frame=   30 fps=0.0 q=28.0 size=N/A speed=1.02x\rframe=   60 fps=0.0 q=-1.0 Lsize=N/A speed=2.63x elapsed=0:00:00.36",
    ),
    2.63,
  );
  assert.equal(parseSpeed("frame=    0 fps=0.0 speed=N/A"), undefined);
});

test("the luma of pure red tells BT.709 from BT.601 and limited from full range", () => {
  assert.deepEqual(colorFromLuma(63), { matrix: "bt709", range: "tv" });
  assert.deepEqual(colorFromLuma(62.4), { matrix: "bt709", range: "tv" });
  assert.deepEqual(colorFromLuma(81), { matrix: "bt601", range: "tv" });
  assert.deepEqual(colorFromLuma(54), { matrix: "bt709", range: "pc" });
  assert.deepEqual(colorFromLuma(76.2), { matrix: "bt601", range: "pc" });
  assert.deepEqual(colorFromLuma(70), { matrix: "unknown", range: "unknown" });
  assert.deepEqual(colorFromLuma(Number.NaN), { matrix: "unknown", range: "unknown" });
});

test("GPU paths re-tag the frames with the measured matrix; the CPU path converts with it", () => {
  assert.deepEqual(
    captureFilter({ codec: "h264_nvenc", conversion: "encoder", matrix: "bt601", range: "tv" }),
    { filter: "setparams=colorspace=smpte170m:range=tv", output: [] },
  );
  assert.deepEqual(
    captureFilter({ codec: "h264_amf", conversion: "scale_d3d11", matrix: "bt709", range: "tv" }),
    { filter: "scale_d3d11=format=nv12,setparams=colorspace=bt709:range=tv", output: [] },
  );
  assert.deepEqual(
    captureFilter({
      codec: "h264_mf",
      conversion: "encoder",
      matrix: "unknown",
      range: "unknown",
    }),
    { filter: null, output: [] },
  );
  assert.deepEqual(
    captureFilter({ codec: "libx264", conversion: "cpu", matrix: "bt601", range: "tv" }),
    {
      filter: "hwdownload,format=bgra",
      output: ["-pix_fmt", "yuv420p", "-colorspace", "smpte170m", "-color_range", "tv"],
    },
  );
  assert.deepEqual(
    captureFilter({ codec: "h264_nvenc", conversion: "cpu", matrix: "unknown", range: "unknown" })
      .output,
    ["-pix_fmt", "nv12"],
  );
});

test("Media Foundation records with a bitrate it can honour, High profile and hardware only", () => {
  const args = captureVideoArgs("h264_mf", { fps: 30, width: 1920, height: 1080 });
  const value = (name: string) => args[args.indexOf(name) + 1];
  assert.equal(value("-c:v"), "h264_mf");
  assert.equal(value("-hw_encoding"), "1");
  assert.equal(value("-rate_control"), "pc_vbr");
  assert.equal(value("-b:v"), "12442k");
  assert.equal(value("-maxrate"), "18663k");
  assert.equal(value("-profile:v"), "100");
  assert.equal(value("-g"), "60");
  // Bitrate stays within sane limits for tiny regions and 4K at 60 fps.
  const small = captureVideoArgs("h264_mf", { fps: 30, width: 320, height: 240 });
  assert.equal(small[small.indexOf("-b:v") + 1], "4000k");
  const huge = captureVideoArgs("h264_mf", { fps: 60, width: 3840, height: 2160 });
  assert.equal(huge[huge.indexOf("-b:v") + 1], "80000k");
  for (const codec of CAPTURE_CODECS) {
    const any = captureVideoArgs(codec, { fps: 60, width: 1280, height: 720 });
    assert.equal(any[any.indexOf("-c:v") + 1], codec);
    assert.equal(any[any.indexOf("-g") + 1], "120");
  }
});

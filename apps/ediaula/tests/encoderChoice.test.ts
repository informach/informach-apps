import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTURE_CODECS,
  CPU_CONVERSION,
  captureEncoderLabel,
  captureFilter,
  captureVideoArgs,
  chooseCaptureEncoder,
  classifyProbeFailure,
  colorFromLuma,
  conversionsFor,
  type EncoderProbe,
  fallbackChain,
  measuredFps,
  profileKey,
  realtimeFps,
} from "../src/shared/encoderChoice.ts";

/** Recording at 1080p and 60 frames per second: keeping up means 57. */
const MIN = realtimeFps(60);

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
  assert.equal(chooseCaptureEncoder(all, MIN).codec, "h264_nvenc");
  assert.equal(chooseCaptureEncoder(all.slice(0, 3), MIN).codec, "h264_amf");
  assert.equal(chooseCaptureEncoder(all.slice(0, 2), MIN).codec, "h264_mf");
  assert.equal(chooseCaptureEncoder(all.slice(0, 1), MIN).codec, "libx264");
});

test("within one encoder, frames that stay on the GPU win over system memory", () => {
  const choice = chooseCaptureEncoder(
    [
      probe("h264_amf", "cpu", 400),
      probe("h264_amf", "encoder", 90),
      probe("h264_amf", "scale_d3d11", 0, false),
    ],
    MIN,
  );
  assert.deepEqual(choice, {
    codec: "h264_amf",
    gpuInput: true,
    conversion: "encoder",
    fps: 90,
  });
  assert.deepEqual(conversionsFor("libx264"), ["cpu"]);
  assert.deepEqual(conversionsFor("h264_mf"), ["scale_d3d11", "encoder", "cpu"]);
});

test("an encoder that cannot keep up with the recording is passed over, not trusted", () => {
  assert.equal(MIN, 57);
  const slowHardware = [probe("h264_mf", "encoder", 56.9), probe("libx264", "cpu", 60)];
  assert.equal(chooseCaptureEncoder(slowHardware, MIN).codec, "libx264");
  // When nothing keeps up, the fastest one that works.
  const allSlow = [
    probe("h264_nvenc", "encoder", 0, false),
    probe("h264_mf", "cpu", 50),
    probe("libx264", "cpu", 35),
  ];
  assert.deepEqual(chooseCaptureEncoder(allSlow, MIN), {
    codec: "h264_mf",
    gpuInput: false,
    conversion: "cpu",
    fps: 50,
  });
  assert.throws(
    () => chooseCaptureEncoder([probe("libx264", "cpu", 0, false)], MIN),
    /Nenhum codificador/,
  );
});

test("the pace is measured after the first second, from FFmpeg's progress", () => {
  const samples = [
    { at: 0, frame: 0 },
    { at: 300, frame: 2 },
    { at: 1300, frame: 30 },
    { at: 2300, frame: 60 },
    { at: 3300, frame: 90 },
  ];
  // Starts at the first frame (300 ms), skips one second, counts 60 frames in 2 s.
  assert.equal(measuredFps(samples), 30);
  assert.equal(measuredFps([{ at: 0, frame: 0 }]), 0);
  assert.equal(measuredFps(samples.slice(0, 3)), 0, "too little left after the first second");
});

test("FFmpeg's messages tell missing hardware from a busy one", () => {
  for (const missing of [
    "[vost#0:0] Unknown encoder 'h264_amf'",
    "[AVFilterGraph @ 0] No such filter: 'scale_d3d11'",
    "[h264_nvenc @ 0] Cannot load nvcuda.dll",
    "[h264_nvenc @ 0] No capable devices found",
    "[AVHWDeviceContext @ 0] DLL amfrt64.dll failed to open",
    "[h264_mf @ 0] could not find any MFT for the given media type",
    "[AVHWFramesContext @ 0] Could not create the texture (80070057)",
  ])
    assert.equal(classifyProbeFailure(missing), "absent", missing);
  assert.equal(classifyProbeFailure("OpenEncodeSessionEx failed: out of memory (10)"), "busy");
  assert.equal(classifyProbeFailure("Invalid data found when processing input"), "failed");
  assert.equal(classifyProbeFailure("No such filter: 'missing_capture'"), "failed");
});

test("a recording that fails to start falls back to system memory, then to x264", () => {
  assert.deepEqual(
    fallbackChain({ codec: "h264_mf", conversion: "scale_d3d11" }).map((e) => [
      e.codec,
      e.conversion,
      e.matrix,
    ]),
    [
      ["h264_mf", "encoder", "unknown"],
      ["h264_mf", "cpu", "bt709"],
      ["libx264", "cpu", "bt709"],
    ],
  );
  assert.deepEqual(
    fallbackChain({ codec: "h264_nvenc", conversion: "cpu" }).map((e) => e.codec),
    ["libx264"],
  );
  assert.deepEqual(fallbackChain({ codec: "libx264", conversion: "cpu" }), []);
  for (const step of fallbackChain({ codec: "h264_amf", conversion: "encoder" }))
    assert.equal(step.gpuInput, step.conversion !== "cpu");
});

test("profiles and labels", () => {
  assert.equal(profileKey({ output: 1, width: 2560, height: 1080, fps: 30 }), "1:2560x1080@30");
  assert.equal(captureEncoderLabel({ codec: "h264_mf" }), "GPU (Media Foundation)");
  assert.equal(captureEncoderLabel({ codec: "libx264" }), "CPU (x264)");
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

test("GPU paths re-tag the frames with the measured matrix; the CPU path converts to BT.709", () => {
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
  // Whatever was cached for it, the CPU path writes BT.709 limited range and says so.
  for (const matrix of ["bt601", "unknown"] as const)
    assert.deepEqual(captureFilter({ codec: "libx264", conversion: "cpu", matrix, range: "tv" }), {
      filter: CPU_CONVERSION,
      output: ["-colorspace", "bt709", "-color_range", "tv"],
    });
  assert.equal(
    CPU_CONVERSION,
    "hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12",
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
    // No B-frames: a part cut short keeps every frame up to its last fragment.
    assert.equal(any[any.indexOf("-bf") + 1], "0");
  }
  // "Alta" spends more: a lower quantizer, or more bits for Media Foundation.
  const high = captureVideoArgs("h264_nvenc", { fps: 30, width: 1920, height: 1080 }, "high");
  assert.equal(high[high.indexOf("-cq") + 1], "15");
  const mfHigh = captureVideoArgs("h264_mf", { fps: 30, width: 1920, height: 1080 }, "high");
  assert.equal(mfHigh[mfHigh.indexOf("-b:v") + 1], "19907k");
});

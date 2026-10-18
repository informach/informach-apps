import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cameraArgs,
  FRAGMENTED_MP4,
  microphoneArgs,
  microphoneMeterArgs,
  screenArgs,
} from "../src/shared/captureArgs.ts";
import { type CaptureEncoder, CPU_CONVERSION } from "../src/shared/encoderChoice.ts";

const gpu: CaptureEncoder = {
  codec: "h264_nvenc",
  gpuInput: true,
  conversion: "scale_d3d11",
  matrix: "bt601",
  range: "tv",
  fps: 60,
};
const cpu: CaptureEncoder = {
  codec: "libx264",
  gpuInput: false,
  conversion: "cpu",
  matrix: "bt709",
  range: "tv",
  fps: 30,
};
const after = (args: string[], name: string): string => args[args.indexOf(name) + 1];
const ends = (args: string[], tail: string[]): boolean =>
  JSON.stringify(args.slice(-tail.length)) === JSON.stringify(tail);

test("the screen is grabbed without the pointer, in the region, on the chosen GPU path", () => {
  const args = screenArgs({
    output: 1,
    fps: 30,
    size: { width: 2560, height: 1440 },
    region: { x: 100, y: 50, width: 1920, height: 1080 },
    encoder: gpu,
    file: "C:/take/tela-0.mp4",
  });
  assert.equal(
    after(args, "-i"),
    "ddagrab=output_idx=1:framerate=30:draw_mouse=0:offset_x=100:offset_y=50:video_size=1920x1080",
  );
  assert.equal(after(args, "-f"), "lavfi");
  // The measured matrix goes on the frames the GPU converted.
  assert.equal(
    after(args, "-vf"),
    "scale_d3d11=format=nv12,setparams=colorspace=smpte170m:range=tv",
  );
  assert.equal(after(args, "-g"), "60");
  assert.equal(after(args, "-bf"), "0");
  assert.equal(after(args, "-progress"), "pipe:2");
  assert.ok(ends(args, [...FRAGMENTED_MP4, "-f", "mp4", "C:/take/tela-0.mp4"]));
  assert.equal(after(args, "-frag_duration"), "2000000");
  assert.match(after(args, "-movflags"), /frag_keyframe/);
});

test("the CPU path converts to BT.709 limited range and is tagged so", () => {
  const args = screenArgs({
    output: 0,
    fps: 60,
    size: { width: 1920, height: 1080 },
    encoder: cpu,
    file: "tela-0.mp4",
  });
  assert.equal(after(args, "-i"), "ddagrab=output_idx=0:framerate=60:draw_mouse=0");
  assert.equal(after(args, "-vf"), CPU_CONVERSION);
  assert.match(
    CPU_CONVERSION,
    /^hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12$/,
  );
  assert.equal(after(args, "-colorspace"), "bt709");
  assert.equal(after(args, "-color_range"), "tv");
  assert.equal(after(args, "-g"), "120");
});

test("the microphone follows the wall clock, records to its own file and feeds the meter", () => {
  const args = microphoneArgs({ device: "Microfone (USB)", file: "microfone-0.m4a" });
  const input = args.indexOf("-i");
  assert.equal(args[input + 1], "audio=Microfone (USB)");
  const options = args.slice(0, input);
  assert.equal(after(options, "-f"), "dshow");
  assert.equal(after(options, "-use_wallclock_as_timestamps"), "1");
  assert.equal(after(options, "-audio_buffer_size"), "50");
  const graph = after(args, "-filter_complex");
  assert.match(graph, /^\[0:a\]aresample=async=1000:first_pts=0,asplit\[rec\]\[mon\];/);
  assert.match(
    graph,
    /\[mon\]aresample=8000,aformat=sample_fmts=s16:channel_layouts=mono\[meter\]$/,
  );
  const rec = args.indexOf("[rec]");
  const meter = args.indexOf("[meter]");
  assert.ok(rec > 0 && meter > rec);
  const recording = args.slice(rec, meter);
  assert.equal(after(recording, "-c:a"), "aac");
  assert.equal(after(recording, "-b:a"), "256k");
  assert.ok(recording.includes("microfone-0.m4a"));
  assert.ok(ends(args, ["-f", "s16le", "pipe:1"]));
  // The meter alone, while setting up, without stdin.
  const meterOnly = microphoneMeterArgs("Microfone (USB)");
  assert.ok(meterOnly.includes("-nostdin"));
  assert.ok(ends(meterOnly, ["-f", "s16le", "pipe:1"]));
});

test("the camera opens in its chosen mode at a constant rate, with the screen's encoder", () => {
  const mjpeg = cameraArgs({
    device: "HD Pro Webcam C920",
    mode: { codec: "mjpeg", width: 1920, height: 1080, fps: 30 },
    fps: 30,
    encoder: gpu,
    file: "camera-0.mp4",
  });
  const input = mjpeg.indexOf("-i");
  assert.equal(mjpeg[input + 1], "video=HD Pro Webcam C920");
  const options = mjpeg.slice(0, input);
  assert.equal(after(options, "-vcodec"), "mjpeg");
  assert.equal(after(options, "-video_size"), "1920x1080");
  assert.equal(after(options, "-framerate"), "30");
  assert.equal(after(mjpeg, "-fps_mode"), "cfr");
  assert.equal(after(mjpeg, "-r"), "30");
  assert.equal(after(mjpeg, "-c:v"), "h264_nvenc");
  assert.equal(after(mjpeg, "-pix_fmt"), "nv12");
  assert.ok(ends(mjpeg, [...FRAGMENTED_MP4, "-f", "mp4", "camera-0.mp4"]));
  // A raw mode slower than asked for records at the rate it has.
  const raw = cameraArgs({
    device: "Cam",
    mode: { pixelFormat: "yuyv422", width: 1280, height: 720, fps: 10 },
    fps: 30,
    encoder: cpu,
    file: "camera-1.mp4",
  });
  assert.equal(after(raw.slice(0, raw.indexOf("-i")), "-pixel_format"), "yuyv422");
  assert.equal(after(raw, "-r"), "10");
  assert.equal(after(raw, "-pix_fmt"), "yuv420p");
});

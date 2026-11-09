import assert from "node:assert/strict";
import { test } from "node:test";
import {
  audioCopyExtension,
  bitrateForTarget,
  canCopy,
  copyExtension,
  editedName,
  editJobSchema,
  exportExtension,
  NO_TRANSFORM,
  outputSize,
} from "../src/shared/edit.ts";
import {
  atempoChain,
  audioCutGraph,
  concatList,
  displayRotation,
  exportGraph,
  filterPath,
  loudnormFilter,
  parseLoudness,
  pointsList,
} from "../src/shared/media/args.ts";
import { concatCompatible, joinBlocker, playbackPlan } from "../src/shared/media/compat.ts";
import { factsFromProbe, keyframesFromPackets, peaks } from "../src/shared/media/probe-parse.ts";
import { parseSubtitles, shiftCues, toSrt, toWebVtt } from "../src/shared/subtitles.ts";
import type { MediaFacts } from "../src/shared/types.ts";

const facts = (over: Partial<MediaFacts> = {}): MediaFacts => ({
  path: "C:\\v\\a.mp4",
  name: "a.mp4",
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  duration: 60,
  startTime: 0,
  size: 60_000_000,
  bitRate: 8_000_000,
  hasVideo: true,
  videoCodec: "h264",
  width: 1920,
  height: 1080,
  fps: 30,
  pixFmt: "yuv420p",
  rotation: 0,
  audio: [{ index: 0, codec: "aac", channels: 2, sampleRate: 48000 }],
  subtitles: [],
  ...over,
});
const caps = { hevc: false, av1: true, mkvH264: false };

test("playback: MP4 plays as is; HEVC without support, WMV and AVI need work", () => {
  assert.equal(playbackPlan(facts(), caps, 0), "native");
  assert.equal(playbackPlan(facts({ videoCodec: "hevc" }), caps, 0), "preview");
  assert.equal(playbackPlan(facts({ videoCodec: "hevc" }), { ...caps, hevc: true }, 0), "native");
  assert.equal(playbackPlan(facts({ container: "avi", videoCodec: "h264" }), caps, 0), "remux");
  assert.equal(playbackPlan(facts({ container: "asf", videoCodec: "wmv3" }), caps, 0), "preview");
  assert.equal(
    playbackPlan(
      facts({ audio: [{ index: 0, codec: "ac3", channels: 6, sampleRate: 48000 }] }),
      caps,
      0,
    ),
    "remux",
  );
  assert.equal(playbackPlan(facts({ container: "matroska,webm" }), caps, 0), "remux");
  assert.equal(
    playbackPlan(facts({ container: "matroska,webm", videoCodec: "vp9" }), caps, 0),
    "native",
  );
  const twoTracks = facts({
    audio: [
      { index: 0, codec: "aac", channels: 2, sampleRate: 48000 },
      { index: 1, codec: "aac", channels: 2, sampleRate: 48000 },
    ],
  });
  assert.equal(playbackPlan(twoTracks, caps, 1), "remux");
});

test("joining by copy needs the same picture and sound formats", () => {
  assert.equal(concatCompatible(facts(), facts({ name: "b.mp4" })), null);
  assert.match(concatCompatible(facts(), facts({ width: 1280 })) ?? "", /tamanhos/);
  assert.match(concatCompatible(facts(), facts({ fps: 25 })) ?? "", /quadros/);
  assert.match(concatCompatible(facts(), facts({ audio: [] })) ?? "", /som/);
  assert.match(
    joinBlocker([facts(), facts({ name: "b.mp4", videoCodec: "hevc" })]) ?? "",
    /^b\.mp4:/,
  );
});

test("probe facts: portrait phone videos swap sides; tracks are listed", () => {
  const json = {
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "48.2", bit_rate: "9000000" },
    streams: [
      {
        codec_type: "video",
        codec_name: "hevc",
        width: 1920,
        height: 1080,
        avg_frame_rate: "30000/1001",
        pix_fmt: "yuv420p10le",
        side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        channels: 2,
        sample_rate: "44100",
        tags: { language: "por" },
      },
      { codec_type: "subtitle", codec_name: "mov_text" },
      { codec_type: "subtitle", codec_name: "hdmv_pgs_subtitle" },
    ],
  };
  const f = factsFromProbe(json, "C:\\a.mov", "a.mov", 10);
  assert.equal(f.rotation, 90);
  assert.equal(f.width, 1080);
  assert.equal(f.height, 1920);
  assert.equal(f.fps, 29.97);
  assert.equal(f.audio.at(0)?.language, "por");
  assert.deepEqual(
    f.subtitles.map((s) => s.text),
    [true, false],
  );
  assert.throws(() => factsFromProbe({ format: { duration: "1" }, streams: [] }, "x", "x", 1));
});

test("keyframes come from packet flags, sorted and unique", () => {
  assert.deepEqual(
    keyframesFromPackets(["2.000000,K__", "0.000000,K_", "1.000000,__", "2.000000,K__", "bad"]),
    [0, 2],
  );
  const p = peaks(Int16Array.from([0, 16384, -32768, 100]), 2);
  assert.deepEqual(p, [0.5, 1]);
});

test("subtitles: SRT and VTT parse, tags are cleaned, shifting clips at zero", () => {
  const srt =
    "\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\nOlá <font color=red>mundo</font>\r\n\r\n2\r\n00:00:03,000 --> 00:00:02,000\r\nquebrada\r\n\r\n3\r\n00:00:04,000 --> 00:00:05,000\r\n<i>fim</i>\r\n";
  const cues = parseSubtitles(srt);
  assert.deepEqual(cues, [
    { start: 1, end: 2.5, text: "Olá mundo" },
    { start: 4, end: 5, text: "<i>fim</i>" },
  ]);
  const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nlinha\n\nNOTE comentário\n";
  assert.deepEqual(parseSubtitles(vtt), [{ start: 1, end: 2, text: "linha" }]);
  assert.deepEqual(shiftCues(cues, -2), [
    { start: 0, end: 0.5, text: "Olá mundo" },
    { start: 2, end: 3, text: "<i>fim</i>" },
  ]);
  assert.match(toWebVtt(cues), /^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.500\nOlá mundo/);
  assert.match(toSrt(cues), /^1\n00:00:01,000 --> 00:00:02,500\n/);
});

test("export choices: copy only without picture or sound changes", () => {
  assert.equal(canCopy(NO_TRANSFORM, "original", false), true);
  assert.equal(
    canCopy({ ...NO_TRANSFORM, rotate: 90, removeAudio: true }, "original", false),
    true,
  );
  assert.equal(
    canCopy({ ...NO_TRANSFORM, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, "original", false),
    false,
  );
  assert.equal(canCopy(NO_TRANSFORM, "original", true), false);
  assert.equal(canCopy(NO_TRANSFORM, "whatsapp", false), false);
  assert.equal(copyExtension("C:\\a\\b.MOV"), "mov");
  assert.equal(copyExtension("C:\\a\\b.avi"), "mkv");
  // WebM takes no AAC (the cut's matching sound): Matroska instead.
  assert.equal(copyExtension("x.webm"), "mkv");
  assert.equal(copyExtension("x.mp3"), "mp3");
  // A sound-only file trimmed as "Original" keeps its own format, or becomes MP3.
  assert.equal(exportExtension("x.mp3", "original", true, false, "mp3"), "mp3");
  assert.equal(exportExtension("x.flac", "original", false, false, "flac"), "mp3");
  assert.equal(
    canCopy(NO_TRANSFORM, "original", false, {
      hasVideo: false,
      audio: [{ index: 0, codec: "flac", channels: 2, sampleRate: 48000 }],
    }),
    false,
  );
  assert.equal(exportExtension("x.mkv", "original", true), "mkv");
  assert.equal(exportExtension("x.mkv", "whatsapp", false), "mp4");
  assert.equal(exportExtension("x.mkv", "gif", false), "gif");
  assert.equal(exportExtension("x.wav", "youtube", false, false), "mp3");
  assert.equal(audioCopyExtension("aac"), "m4a");
  assert.equal(audioCopyExtension("ac3"), null);
  assert.equal(editedName('aula: "1".mp4', "editado", "mp4"), "aula 1 (editado).mp4");
});

test("size targets and output sizes stay in bounds", () => {
  assert.equal(bitrateForTarget(60, 15, 96), Math.round(((15 * 8 * 1024) / 60) * 0.96 - 96));
  assert.equal(bitrateForTarget(36000, 15, 96), 250);
  assert.deepEqual(outputSize(1920, 1080, 720), [1280, 720]);
  assert.deepEqual(outputSize(1080, 1920, 720), [720, 1280]);
  assert.deepEqual(outputSize(640, 360, 720), [640, 360]);
  assert.deepEqual(outputSize(1281, 721, undefined), [1282, 722]);
});

test("job schema refuses extra fields and impossible values", () => {
  const ok = {
    kind: "export",
    source: "C:\\a.mp4",
    ranges: [{ start: 0, end: 5 }],
    precise: false,
    transform: NO_TRANSFORM,
    preset: "original",
    output: "C:\\b.mp4",
  };
  assert.equal(editJobSchema.parse(ok).kind, "export");
  assert.throws(() => editJobSchema.parse({ ...ok, extra: 1 }));
  assert.throws(() => editJobSchema.parse({ ...ok, transform: { ...NO_TRANSFORM, speed: 9 } }));
  assert.throws(() =>
    editJobSchema.parse({ kind: "join", sources: ["a"], preset: "original", output: "b" }),
  );
});

test("FFmpeg argument builders", () => {
  // Option level escapes \ ' :, the graph level escapes those backslashes and ' [ ] , ; again.
  assert.equal(filterPath("C:\\Users\\it's\\a.srt"), "C\\\\:/Users/it\\\\\\'s/a.srt");
  assert.equal(filterPath("C:\\x',[a];b\\l.srt"), "C\\\\:/x\\\\\\'\\,\\[a\\]\\;b/l.srt");
  assert.equal(concatList(["C:\\a'b.mp4"]), "ffconcat version 1.0\nfile 'C:\\a'\\''b.mp4'\n");
  assert.deepEqual(atempoChain(4), ["atempo=2", "atempo=2"]);
  assert.deepEqual(atempoChain(0.5), ["atempo=0.5"]);
  assert.deepEqual(atempoChain(3), ["atempo=2", "atempo=1.5"]);
  assert.deepEqual(atempoChain(1), []);
  assert.equal(displayRotation(90), 270);
  assert.equal(displayRotation(0), 0);
  assert.equal(
    pointsList("C:\\v\\a'b.mkv", [{ inpoint: 1.445, outpoint: 4.5 }]),
    "ffconcat version 1.0\nfile 'C:\\v\\a'\\''b.mkv'\ninpoint 1.445000\noutpoint 4.500000\n",
  );
  const sound = audioCutGraph(
    1,
    [0, 2],
    [
      { start: 1, end: 2 },
      { start: 5, end: 7 },
    ],
  );
  assert.match(sound, /\[1:a:0\]asplit=2\[s0_0\]\[s0_1\]/);
  assert.match(sound, /\[s1_1\]atrim=start=5\.000000:end=7\.000000,asetpts=PTS-STARTPTS\[c1_1\]/);
  assert.match(sound, /\[c1_0\]\[c1_1\]concat=n=2:v=0:a=1\[a1\]/);
  assert.equal(
    audioCutGraph(1, [0], [{ start: 0, end: 3 }]),
    "[1:a:0]atrim=start=0.000000:end=3.000000,asetpts=PTS-STARTPTS[a0]",
  );
  const measured = parseLoudness(
    'junk\n{\n "input_i" : "-27.1", "input_tp" : "-9.0", "input_lra" : "5.2", "input_thresh" : "-37.5", "target_offset" : "0.3"\n}\n',
  );
  assert.match(loudnormFilter(measured), /measured_I=-27\.1:.*linear=true/);
  assert.throws(() => parseLoudness("{}"));
});

test("export graph cuts, joins and transforms in order", () => {
  const g = exportGraph({
    ranges: [
      { start: 1, end: 2 },
      { start: 5, end: 7 },
    ],
    seeked: false,
    video: true,
    audio: "0:a:0",
    audioUncut: false,
    burn: "C:\\s.srt",
    crop: { x: 10, y: 0, w: 100, h: 200 },
    rotate: 90,
    flipH: true,
    flipV: false,
    speed: 2,
    gain: 1.5,
    loudnorm: "loudnorm=I=-16",
    size: [720, 1280],
    gif: null,
  });
  assert.match(g.graph, /subtitles=filename=C\\\\:\/s\.srt,split=2\[vs0\]\[vs1\]/);
  assert.match(g.graph, /\[vt0\]\[at0\]\[vt1\]\[at1\]concat=n=2:v=1:a=1\[vc\]\[ac\]/);
  assert.match(
    g.graph,
    /\[vc\]crop=100:200:10:0,transpose=1,hflip,setpts=PTS\/2,scale=720:1280:flags=lanczos,format=yuv420p\[v\]/,
  );
  assert.match(g.graph, /\[ac\]atempo=2,volume=1\.5,loudnorm=I=-16,aresample=48000\[a\]/);
  const single = exportGraph({
    ranges: [{ start: 3, end: 9 }],
    seeked: true,
    video: true,
    audio: null,
    audioUncut: false,
    burn: null,
    crop: null,
    rotate: 0,
    flipH: false,
    flipV: false,
    speed: 1,
    gain: 1,
    loudnorm: null,
    size: [480, 270],
    gif: { fps: 15 },
  });
  assert.match(single.graph, /palettegen=stats_mode=diff/);
  assert.equal(single.audio, false);
  const replaced = exportGraph({
    ranges: [{ start: 0, end: 9 }],
    seeked: false,
    video: true,
    audio: "1:a:0",
    audioUncut: true,
    burn: null,
    crop: null,
    rotate: 0,
    flipH: false,
    flipV: false,
    speed: 2,
    gain: 1,
    loudnorm: null,
    size: null,
    gif: null,
  });
  assert.match(replaced.graph, /\[1:a:0\]aresample=48000\[a\]/);
});

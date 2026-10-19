import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { MediaProcessError, NativeMedia, resolveNativeMedia } from "./native-media.ts";

it("a standalone packaged Captura resolves only its own resources and never a development/app fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "edi-standalone-media-"));
  try {
    const resources = join(root, "Captura", "resources"),
      bin = join(resources, "native-media", "bin");
    await mkdir(bin, { recursive: true });
    for (const name of ["ffmpeg", "ffprobe"])
      await writeFile(join(bin, `${name}.exe`), "path fixture only");
    const options = {
      packaged: true,
      resourcesPath: resources,
      developmentRoot: join(root, "no-workspace"),
      developmentBinary() {
        throw new Error("Must never use another app");
      },
    };
    expect(resolveNativeMedia(options)).toEqual({
      ffmpeg: join(bin, "ffmpeg.exe"),
      ffprobe: join(bin, "ffprobe.exe"),
    });
    await rm(join(bin, "ffprobe.exe"));
    expect(() => resolveNativeMedia(options)).toThrow();
  } finally {
    expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});

it("development finds the suite bundle independently of EdiAula and fails when no binary exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "edi-development-media-"));
  try {
    const bin = join(root, ".cache/edi-native-media/windows-x64/bin");
    await mkdir(bin, { recursive: true });
    for (const name of ["ffmpeg", "ffprobe"])
      await writeFile(join(bin, `${name}.exe`), "path fixture only");
    const options = {
      packaged: false,
      resourcesPath: "",
      developmentRoot: join(root, "apps", "edicaptura"),
    };
    expect(resolveNativeMedia(options).ffmpeg).toBe(join(bin, "ffmpeg.exe"));
    await rm(join(bin, "ffmpeg.exe"));
    expect(() => resolveNativeMedia(options)).toThrow(/indisponível/);
  } finally {
    expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});

// The executor is exercised with Node standing in for FFmpeg: the contract is about processes.
const node = { ffmpeg: process.execPath, ffprobe: process.execPath };
const script = (code: string) => ["-e", code];

it("refuses a second run under a running ID by default and shares it when the consumer schedules", async () => {
  const exclusive = new NativeMedia(node);
  const first = exclusive.run(node.ffmpeg, script("setTimeout(()=>{},300)"), { jobId: "a" });
  await expect(exclusive.run(node.ffmpeg, script(""), { jobId: "a" })).rejects.toThrow(/andamento/);
  await first;
  const shared = new NativeMedia(node, { exclusiveJobIds: false, maxRunning: 8 });
  await expect(
    Promise.all([
      shared.run(node.ffmpeg, script("process.stdout.write('1')"), { jobId: "a" }),
      shared.run(node.ffmpeg, script("process.stdout.write('2')"), { jobId: "a" }),
    ]),
  ).resolves.toEqual(["1", "2"]);
});

it("cancels a job together with its parts and reports the consumer's cancel message", async () => {
  const media = new NativeMedia(node, { exclusiveJobIds: false, cancelledMessage: "Cancelado" });
  const spawned: string[] = [];
  const tracked = new NativeMedia(node, {
    onSpawn: (_child, id) => spawned.push(id),
  });
  const long = script("setInterval(()=>{},1000)");
  const runs = [
    media.run(node.ffmpeg, long, { jobId: "export" }),
    media.run(node.ffmpeg, long, { jobId: "export:segment-1" }),
    media.run(node.ffmpeg, long, { jobId: "other" }),
  ];
  await new Promise((done) => setTimeout(done, 200));
  const settled = Promise.allSettled(runs);
  let otherEnded = false;
  void runs[2]?.catch(() => {
    otherEnded = true;
  });
  media.cancel("export");
  await new Promise((done) => setTimeout(done, 200));
  expect(otherEnded).toBe(false);
  media.cancel("other");
  const outcomes = await settled;
  expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected", "rejected"]);
  for (const outcome of outcomes)
    if (outcome.status === "rejected")
      expect(outcome.reason).toMatchObject({ message: "Cancelado" });
  await tracked.run(node.ffmpeg, script(""), { jobId: "proxy" });
  await tracked.run(node.ffmpeg, script(""));
  expect(spawned).toEqual(["proxy"]);
});

it("streams stderr, can resolve with it, and keeps the failure detail", async () => {
  const media = new NativeMedia(node);
  const seen: string[] = [];
  await expect(
    media.run(node.ffmpeg, script("process.stderr.write('loudnorm 42')"), {
      capture: "stderr",
      onStderr: (text) => seen.push(text),
    }),
  ).resolves.toBe("loudnorm 42");
  expect(seen.join("")).toBe("loudnorm 42");
  const failure = await media
    .run(
      node.ffmpeg,
      script("console.error(['a','b','c'].join(String.fromCharCode(10)));process.exit(3)"),
    )
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(MediaProcessError);
  expect(failure).toMatchObject({ code: 3, detail: expect.stringContaining("a\nb\nc") });
});

it("keeps the stdout and time limits unless the consumer lifts them", async () => {
  const small = new NativeMedia(node, { maxStdoutBytes: 1024 ** 2 });
  await expect(
    small.run(node.ffmpeg, script("process.stdout.write('x'.repeat(2 * 1024 ** 2))")),
  ).rejects.toThrow("Resposta de mídia excede 1 MiB.");
  const media = new NativeMedia(node);
  await expect(
    media.run(node.ffmpeg, script("setInterval(()=>{},1000)"), { timeoutMs: 150 }),
  ).rejects.toThrow(/Tempo limite/);
  const unbounded = new NativeMedia(node, { maxTimeoutMs: null });
  await expect(unbounded.run(node.ffmpeg, script("setTimeout(()=>{},200)"))).resolves.toBe("");
});

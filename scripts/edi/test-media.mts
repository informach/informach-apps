import { execFile, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { nativeMediaDirectory, verifyNativeMediaBundle } from "./media-bundle.mts";

if (process.platform !== "win32")
  throw new Error("Native Windows media verification requires Windows");
const bundle = await verifyNativeMediaBundle();
const execute = promisify(execFile);
const ffmpeg = join(nativeMediaDirectory, "bin/ffmpeg.exe");
const ffprobe = join(nativeMediaDirectory, "bin/ffprobe.exe");
for (const binary of [ffmpeg, ffprobe]) {
  const result = await execute(binary, ["-version"], { windowsHide: true, timeout: 30000 });
  if (!result.stdout.split("\n")[0]?.includes(`version ${bundle.version}`))
    throw new Error("Native media version does not match its source inventory");
  const license = await execute(binary, ["-L"], { windowsHide: true, timeout: 30000 });
  if (!license.stdout.includes("version 3") || license.stderr.includes("--enable-nonfree"))
    throw new Error("Native media license differs from the redistributable GPLv3 recipe");
}
for (const [option, capabilities] of [
  [
    "-encoders",
    ["libx264", "libvpx-vp9", "libmp3lame", "h264_nvenc", "h264_amf", "h264_mf", "aac", "png"],
  ],
  ["-decoders", ["libdav1d", "h264", "hevc", "vp9"]],
  [
    "-filters",
    [
      "subtitles",
      "ddagrab",
      "scale_d3d11",
      "hwupload",
      "overlay",
      "chromakey",
      "geq",
      "amix",
      "afftdn",
    ],
  ],
  ["-demuxers", ["dshow", "mov", "matroska", "image2"]],
] as const) {
  const result = await execute(ffmpeg, ["-hide_banner", option], {
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 ** 2,
  });
  for (const capability of capabilities)
    if (!result.stdout.includes(capability))
      throw new Error(`Native media capability missing: ${capability}`);
}
const packageManager = process.env.npm_execpath;
if (!packageManager) throw new Error("Run media verification through pnpm");
const child = spawn(process.execPath, [packageManager, "--filter", "@informach/ediaula", "test"], {
  windowsHide: true,
  stdio: "inherit",
  env: { ...process.env, FFMPEG_BIN: ffmpeg, FFPROBE_BIN: ffprobe },
});
await new Promise<void>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`EdiAula media regression failed (${code})`)),
  );
});
await writeFile(
  resolve(".cache/edi-media-verification.json"),
  JSON.stringify({ version: bundle.version, recipeDigest: bundle.recipeDigest, passed: true }),
);
console.log(
  `Verified native Windows media ${bundle.version}: required capabilities and the complete EdiAula test suite`,
);

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { resolveNativeMedia } from "./native-media.ts";

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

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  LaunchError,
  nativeCodexFor,
  parseBunx,
  parseCmdShim,
  personalLogin,
  resolveLaunch,
  trustedWhich,
} from "./ai-launch.ts";

const shims = join(import.meta.dirname, "..", "fixtures", "ai", "npm-shims");
const root = await mkdtemp(join(tmpdir(), "edi-ai-shims-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const runtime = async () => ({ command: "C:\\runtime\\node.exe", env: { RUNTIME: "1" } });
const windowsOnly = process.platform !== "win32";

/** A copy of a fixture shim next to the file it points at, as npm installs them. */
async function installed(name: string, target?: string): Promise<string> {
  const dir = await mkdtemp(join(root, "npm-"));
  const shim = join(dir, name);
  await copyFile(join(shims, name), shim);
  if (target) {
    await mkdir(dirname(join(dir, target)), { recursive: true });
    await writeFile(join(dir, target), "");
  }
  return shim;
}

describe("starting the official clients", () => {
  it("reads npm shims to find what they run", async () => {
    const dir = "C:\\Users\\ana\\AppData\\Roaming\\npm";
    expect(parseCmdShim(await readFile(join(shims, "codex.cmd"), "utf8"), dir)).toEqual({
      target: join(dir, "node_modules\\@openai\\codex\\bin\\codex.js"),
      kind: "script",
      flags: [],
    });
    const claude = parseCmdShim(await readFile(join(shims, "claude.cmd"), "utf8"), dir);
    expect(claude?.kind).toBe("exe");
    expect(claude?.target).toBe(
      join(dir, "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"),
    );
    expect(parseCmdShim(await readFile(join(shims, "gemini.cmd"), "utf8"), dir)?.flags).toEqual([]);
    const flagged = parseCmdShim(
      '"%_prog%" --no-warnings --require=C:\\x.js --inspect=0 --no-deprecation "%dp0%\\node_modules\\a\\b.js" %*',
      dir,
    );
    expect(flagged?.flags, "only flags that silence warnings").toEqual([
      "--no-warnings",
      "--no-deprecation",
    ]);
    expect(parseCmdShim(await readFile(join(shims, "unknown.cmd"), "utf8"), dir)).toBeNull();
    // A shim pointing outside its own folder is not followed, not even into a folder next to it.
    expect(parseCmdShim('"%dp0%\\..\\..\\evil.js" %*', dir)).toBeNull();
    expect(parseCmdShim('"%dp0%\\..\\npm-evil\\evil.js" %*', dir)).toBeNull();
    expect(parseCmdShim(await readFile(join(shims, "neighbour.cmd"), "utf8"), dir)).toBeNull();
  });

  it.skipIf(windowsOnly)(
    "follows bun launchers and Codex's npm script to the native program",
    async () => {
      const bun = await mkdtemp(join(root, "bun-"));
      const bin = join(bun, "bin");
      const pkg = join(bun, "install", "global", "node_modules", "@openai");
      const exe = join(
        pkg,
        "codex-win32-x64",
        "vendor",
        "x86_64-pc-windows-msvc",
        "bin",
        "codex.exe",
      );
      await mkdir(dirname(exe), { recursive: true });
      await mkdir(join(pkg, "codex", "bin"), { recursive: true });
      await mkdir(bin, { recursive: true });
      await writeFile(exe, "");
      await writeFile(join(pkg, "codex", "bin", "codex.js"), "");
      await writeFile(join(bin, "codex.exe"), "");
      const shim = Buffer.from(
        'install\\global\\node_modules\\@openai\\codex\\bin\\codex.js"\u0000node l',
        "utf16le",
      );
      await writeFile(join(bin, "codex.bunx"), shim);
      expect(parseBunx(shim, bin)).toBe(join(pkg, "codex", "bin", "codex.js"));
      expect(nativeCodexFor(join(pkg, "codex", "bin", "codex.js"), "x64")).toBe(exe);
      expect(await resolveLaunch(join(bin, "codex.exe"), runtime)).toEqual({
        command: exe,
        args: [],
        env: {},
      });
      expect(parseBunx(Buffer.from('..\\..\\evil.js"', "utf16le"), bin)).toBeNull();
    },
  );

  it("runs executables directly and npm scripts on a runtime, never a shell", async () => {
    expect(await resolveLaunch("C:\\Tools\\codex.exe", runtime)).toEqual({
      command: "C:\\Tools\\codex.exe",
      args: [],
      env: {},
    });
    const codex = await installed("codex.cmd", "node_modules\\@openai\\codex\\bin\\codex.js");
    const js = await resolveLaunch(codex, runtime);
    expect(js.command).toBe("C:\\runtime\\node.exe");
    expect(js.args).toEqual([join(dirname(codex), "node_modules\\@openai\\codex\\bin\\codex.js")]);
    expect(js.env).toEqual({ RUNTIME: "1" });
    const claude = await installed(
      "claude.cmd",
      "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
    );
    const exe = await resolveLaunch(claude, runtime);
    expect(exe.command).toBe(
      join(dirname(claude), "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"),
    );
    expect(exe.args).toEqual([]);
  });

  it("refuses an unknown .cmd, a missing target and other kinds of file", async () => {
    await expect(resolveLaunch(await installed("unknown.cmd"), runtime)).rejects.toBeInstanceOf(
      LaunchError,
    );
    await expect(resolveLaunch(await installed("codex.cmd"), runtime)).rejects.toBeInstanceOf(
      LaunchError,
    );
    await expect(resolveLaunch("C:\\Tools\\codex.ps1", runtime)).rejects.toBeInstanceOf(
      LaunchError,
    );
    await expect(resolveLaunch("C:\\Tools\\codex", runtime)).rejects.toBeInstanceOf(LaunchError);
  });
});

describe("finding the clients", () => {
  it("does not use where.exe hits in the current folder, temp, Downloads or a share", () => {
    const out = [
      "C:\\Users\\ana\\Downloads\\claude.exe",
      "C:\\Projetos\\aula\\claude.cmd",
      "C:\\Users\\ana\\AppData\\Local\\Temp\\x\\claude.exe",
      "\\\\servidor\\share\\claude.exe",
      "C:\\Users\\ana\\..\\ana\\Downloads\\claude.exe",
      "C:\\Users\\ana\\.local\\bin\\claude.exe",
    ].join("\r\n");
    const untrusted = [
      "C:\\Projetos\\aula",
      "C:\\Users\\ana\\AppData\\Local\\Temp",
      "c:/users/ana/downloads/",
    ];
    expect(trustedWhich(out, untrusted)).toBe("C:\\Users\\ana\\.local\\bin\\claude.exe");
    expect(trustedWhich("C:\\Projetos\\aula\\claude.exe", untrusted)).toBeNull();
    expect(trustedWhich("C:\\Program Files\\nodejs\\node.exe\r\n", untrusted)).toBe(
      "C:\\Program Files\\nodejs\\node.exe",
    );
    expect(trustedWhich("C:\\Tools\\claude.ps1", untrusted)).toBeNull();
  });

  it("accepts only a login with the person's own subscription", () => {
    expect(personalLogin("claude-code", { code: 0, out: '{"authMethod":"claude.ai"}' })).toBe(true);
    expect(personalLogin("claude-code", { code: 0, out: '{"authMethod":"api_key"}' })).toBe(false);
    expect(personalLogin("claude-code", { code: 1, out: '{"authMethod":"claude.ai"}' })).toBe(
      false,
    );
    expect(personalLogin("claude-code", { code: 0, out: "not json" })).toBe(false);
    expect(personalLogin("codex", { code: 0, out: "Logged in using ChatGPT" })).toBe(true);
    expect(personalLogin("codex", { code: 0, out: "Logged in using an API key" })).toBe(false);
  });
});

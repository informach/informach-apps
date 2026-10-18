import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type FilterScriptOption = "-filter_complex_script" | "-/filter_complex";
const versions = new Map<string, Promise<{ line: string; major: number }>>();

/** The first line of `ffmpeg -version` and its major version, asked once per binary. */
function version(binary: string): Promise<{ line: string; major: number }> {
  const cached = versions.get(binary);
  if (cached) return cached;
  const detected = execute(binary, ["-version"], { windowsHide: true, timeout: 30000 })
    .then(({ stdout }) => {
      const line = stdout.split(/\r?\n/)[0] ?? "";
      return { line, major: Number(/^ffmpeg version (\d+)\./.exec(line)?.[1]) };
    })
    .catch((error: unknown) => {
      versions.delete(binary);
      throw error;
    });
  versions.set(binary, detected);
  return detected;
}

/** FFmpeg 7 introduced file-backed options; 9 removed the legacy script flag. */
export async function filterScriptOption(binary: string): Promise<FilterScriptOption> {
  const { major } = await version(binary);
  if (!Number.isInteger(major) || major < 6)
    throw new Error("Versão do FFmpeg não suportada para exportação.");
  return major >= 7 ? "-/filter_complex" : "-filter_complex_script";
}

/** The build that renders, part of every cached segment's key: another FFmpeg renders anew. */
export async function ffmpegVersion(binary: string): Promise<string> {
  return (await version(binary)).line;
}

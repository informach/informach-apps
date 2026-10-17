import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type FilterScriptOption = "-filter_complex_script" | "-/filter_complex";
const options = new Map<string, Promise<FilterScriptOption>>();

/** FFmpeg 7 introduced file-backed options; 9 removed the legacy script flag. */
export function filterScriptOption(binary: string): Promise<FilterScriptOption> {
  const cached = options.get(binary);
  if (cached) return cached;
  const detected = execute(binary, ["-version"], { windowsHide: true, timeout: 30000 })
    .then(({ stdout }): FilterScriptOption => {
      const major = Number(/^ffmpeg version (\d+)\./.exec(stdout)?.[1]);
      if (!Number.isInteger(major) || major < 6)
        throw new Error("Versão do FFmpeg não suportada para exportação.");
      return major >= 7 ? "-/filter_complex" : "-filter_complex_script";
    })
    .catch((error: unknown) => {
      options.delete(binary);
      throw error;
    });
  options.set(binary, detected);
  return detected;
}

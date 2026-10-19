import { readBoundedBytes } from "./boundedBytes";

export { PROJECT_BYTES } from "../shared/projectPolicy";
export const SVG_BYTES = 1_500_000;

/** Read the selected file through one descriptor, including a sentinel byte.
 * The bound holds even if the file grows after stat; invalid UTF-8 is rejected. */
export async function readBoundedText(path: string, maxBytes: number): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    await readBoundedBytes(path, maxBytes),
  );
}

/** Preserve original UTF-8 text for byte-faithful backups, stripping BOM only
 * at the JSON parser boundary. */
export function parseJsonText(text: string): unknown {
  return JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);
}

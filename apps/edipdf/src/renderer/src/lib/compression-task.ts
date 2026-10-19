import type { CompressLevel } from "@shared/compress";
import {
  type CompressionInput,
  type CompressionSource,
  compressionInputSchema,
} from "@shared/compression-task-format";
import type { LocalTaskRequest, TaskResult } from "@shared/task-format";
import { type CompressionOptions, runCompression } from "./compression";
import { loadSource, releaseSource, renderToDataUrl } from "./pdf";
import { beginLocalTask, type LocalTask } from "./tasks";

export interface CompressionPreview {
  original: string;
  compressed: string;
  page: number;
}
export interface DurableCompressionOptions extends CompressionOptions {
  acceptLarger?: boolean;
  previewPage?: number;
  review?: (
    name: string,
    original: Uint8Array,
    result: Uint8Array,
    warnings: string[],
    preview?: CompressionPreview,
    signal?: AbortSignal,
  ) => Promise<boolean>;
}

async function preview(bytes: Uint8Array, name: string, page: number): Promise<string> {
  const source = await loadSource(bytes, name, () => Promise.resolve(null), { output: true });
  try {
    if (!source.info[page]) throw new Error("Página de prévia ausente no resultado.");
    return await renderToDataUrl(
      { id: "compression-review", src: source.id, index: page, rotation: 0 },
      800,
      "image/png",
    );
  } finally {
    releaseSource(source.id);
  }
}
export async function compressionIdentity(
  bytes: Uint8Array,
  path?: string,
): Promise<CompressionSource> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const sha256 = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return path
    ? { kind: "file", path, sha256, length: bytes.length }
    : { kind: "snapshot", sha256, length: bytes.length };
}
export async function prepareCompression(
  task: LocalTask,
  bytes: Uint8Array,
  input: CompressionInput,
  name: string,
  progress?: CompressionOptions["progress"],
): Promise<{ result: TaskResult; preview?: CompressionPreview }> {
  await task.input(input);
  const outcome = await runCompression(bytes, input.settings.level, {
    target: input.settings.target,
    signal: task.signal,
    progress: (value) => {
      task.describe(
        `Tentativa ${value.attempt}/${value.total} · ${value.done}/${value.images} imagens`,
      );
      progress?.(value);
    },
  });
  task.signal.throwIfAborted();
  const page = Math.min(input.settings.previewPage, outcome.pages - 1);
  let images: CompressionPreview | undefined;
  if (input.settings.review) {
    const original = await preview(bytes, name, page);
    task.signal.throwIfAborted();
    images = { original, compressed: await preview(outcome.bytes, name, page), page };
  }
  const result: TaskResult = {
    bytes: outcome.bytes,
    pdf: outcome.bytes,
    pages: outcome.pages,
    extension: "pdf",
    warnings: outcome.warnings,
    detail: {
      kind: "compression",
      before: bytes.length,
      target: input.settings.target,
      targetMet: outcome.targetMet,
      page,
      originalPreview: images?.original,
    },
  };
  await task.ready(result);
  return { result, preview: images };
}
export async function compressionResultPreview(
  result: TaskResult,
  name: string,
): Promise<CompressionPreview | undefined> {
  if (result.detail?.kind !== "compression") throw new Error("Resultado de compactação inválido.");
  if (!result.detail.originalPreview) return undefined;
  return {
    original: result.detail.originalPreview,
    compressed: await preview(result.bytes, name, result.detail.page),
    page: result.detail.page,
  };
}
export async function compressDurably(
  bytes: Uint8Array,
  name: string,
  source: CompressionSource,
  level: CompressLevel,
  destination: NonNullable<LocalTaskRequest["destination"]>,
  originPaths: string[],
  options: DurableCompressionOptions,
): Promise<{ path?: string; result: TaskResult; warning?: string; rejected?: boolean }> {
  const signal = options.signal ?? new AbortController().signal;
  const task = await beginLocalTask(
    {
      id: crypto.randomUUID(),
      kind: "compression",
      label: `Compactar ${name}`,
      defaultName: `${name.replace(/\.pdf$/i, "")} (compactado).pdf`,
      extension: "pdf",
      inputBytes: bytes.length,
      inputIdentity: source,
      destination,
      originPaths,
    },
    signal,
    () => undefined,
  );
  try {
    const input = compressionInputSchema.parse({
      kind: "compression",
      source,
      bytes: source.kind === "snapshot" ? bytes : undefined,
      settings: {
        level,
        target: options.target,
        acceptLarger: !!options.acceptLarger,
        previewPage: options.previewPage ?? 0,
        review: !!options.review,
      },
    });
    const prepared = await prepareCompression(task, bytes, input, name, options.progress);
    if (prepared.result.detail?.kind !== "compression")
      throw new Error("Resultado de compactação inconsistente.");
    if (!prepared.result.detail.targetMet && !options.acceptLarger) {
      task.disconnect();
      return { result: prepared.result, rejected: true };
    }
    if (
      options.review &&
      !(await options.review(
        name,
        bytes,
        prepared.result.bytes,
        prepared.result.warnings,
        prepared.preview,
        task.signal,
      ))
    ) {
      signal.throwIfAborted();
      await task.discard();
      return { result: prepared.result, rejected: true };
    }
    signal.throwIfAborted();
    const path = await task.save();
    if (!path) throw new Error("O destino não confirmou a gravação da cópia.");
    const outcome = await task.outcome;
    return {
      path,
      result: prepared.result,
      warning: outcome.status === "saved" ? outcome.warning : undefined,
    };
  } finally {
    task.disconnect();
  }
}

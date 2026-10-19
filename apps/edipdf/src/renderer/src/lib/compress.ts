import { ProtectedPdfError } from "@shared/build";
import { type CompressLevel, formatSize } from "@shared/compress";
import type { OpenedFile } from "@shared/types";
import { toast, useApp } from "../state/store";
import { buildDoc } from "./actions";
import {
  compressDurably,
  compressionIdentity,
  type DurableCompressionOptions,
} from "./compression-task";
import { finishDraft } from "./editing";
import { documentOriginPaths } from "./recovery";

const api = window.api;
const busy = (msg: string | null): void => {
  useApp.setState({ busy: msg });
};

export { canvasReencode } from "./image-reencode";

export interface Outcome {
  name: string;
  path?: string;
  before: number;
  after: number;
  error?: string;
  target?: number;
  targetMet?: boolean;
  warnings?: string[];
}
export type CompressionJobOptions = DurableCompressionOptions;

const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const reason = (err: unknown): string =>
  err instanceof ProtectedPdfError
    ? "PDF protegido por senha"
    : err instanceof Error
      ? err.message
      : "Não foi possível processar o arquivo";

/** Compresses each file and saves "<nome> (compactado).pdf" in the native-selected output folder. */
export async function compressFiles(
  files: OpenedFile[],
  level: CompressLevel,
  onEach?: (o: Outcome) => void,
  options: CompressionJobOptions = {},
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  if (!files.length) return out;
  const folder = await api.pickFolder("Pasta para as cópias compactadas");
  if (!folder) return out;
  options.signal?.throwIfAborted();
  try {
    for (const f of files) {
      if (options.signal?.aborted) break;
      let o: Outcome;
      try {
        const output = await compressDurably(
          f.bytes,
          f.name,
          await compressionIdentity(f.bytes, f.path),
          level,
          { path: `${folder}/${f.name.replace(/\.pdf$/i, "")} (compactado).pdf`, unique: true },
          [f.path],
          {
            ...options,
            progress: (value) => {
              options.progress?.(value);
              busy(`${f.name}: ${value.attempt}/${value.total} (${value.done}/${value.images})`);
            },
          },
        );
        const { bytes, warnings } = output.result;
        const targetMet =
          output.result.detail?.kind === "compression" && output.result.detail.targetMet;
        options.signal?.throwIfAborted();
        if (!targetMet && !options.acceptLarger)
          throw new Error(
            `Meta de ${formatSize(options.target ?? 0)} não atingida. Melhor resultado: ${formatSize(bytes.length)}. Nenhuma cópia salva; ajuste a meta ou permita salvar o melhor resultado.`,
          );
        const path = output.path;
        if (output.rejected) throw new Error("Cópia descartada na revisão de qualidade.");
        if (output.warning) warnings.push(output.warning);
        if (!path) throw new Error("O destino não confirmou a gravação da cópia.");
        o = {
          name: f.name,
          path,
          before: f.bytes.length,
          after: bytes.length,
          target: options.target,
          targetMet,
          warnings,
        };
      } catch (err) {
        if (options.signal?.aborted) break;
        console.error(err);
        o = { name: f.name, before: f.bytes.length, after: f.bytes.length, error: reason(err) };
      }
      out.push(o);
      onEach?.(o);
    }
  } finally {
    busy(null);
  }
  return out;
}

/** Saves a compressed copy of an open document (with its edits); the document itself is untouched. */
export async function compressDoc(
  docId: string,
  level: CompressLevel,
  options: CompressionJobOptions = {},
): Promise<Outcome | null> {
  if (!finishDraft(docId)) return null;
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return null;
  const base = doc.name.replace(/\.pdf$/i, "");
  const path = await api.saveDialog(`${base} (compactado).pdf`);
  if (!path) return null;
  try {
    busy("Preparando…");
    const built = await buildDoc(doc, doc.content, options.signal);
    if (!built) return null;
    const output = await compressDurably(
      built,
      doc.name,
      await compressionIdentity(built),
      level,
      { path, unique: false },
      documentOriginPaths(doc),
      {
        ...options,
        progress: (value) => {
          options.progress?.(value);
          busy(`${doc.name}: ${value.attempt}/${value.total} (${value.done}/${value.images})`);
        },
      },
    );
    const { bytes, warnings } = output.result;
    const targetMet =
      output.result.detail?.kind === "compression" && output.result.detail.targetMet;
    options.signal?.throwIfAborted();
    if (!targetMet && !options.acceptLarger)
      return {
        name: doc.name,
        before: built.length,
        after: bytes.length,
        target: options.target,
        targetMet,
        warnings,
        error: `Meta de ${formatSize(options.target ?? 0)} não atingida. Melhor resultado: ${formatSize(bytes.length)}. Nenhuma cópia salva; ajuste a meta ou permita salvar o melhor resultado.`,
      };
    if (output.rejected) return null;
    if (output.warning) warnings.push(output.warning);
    if (!output.path) throw new Error("A cópia não foi salva.");
    return {
      name: fileName(path),
      path: output.path,
      before: built.length,
      after: bytes.length,
      target: options.target,
      targetMet,
      warnings,
    };
  } catch (err) {
    if (options.signal?.aborted) return null;
    console.error(err);
    toast(`Não foi possível compactar: ${reason(err)}`, { tone: "error" });
    return null;
  } finally {
    busy(null);
  }
}

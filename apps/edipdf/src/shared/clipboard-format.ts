import { z } from "zod";
import { annotationSchema } from "./document-format.ts";
import type { Annot } from "./model.ts";

export const ANNOTATION_CLIPBOARD_MIME = "web application/x.edipdf.annotations+json";
export const CLIPBOARD_LIMIT = 16 * 1024 * 1024;
export const CLIPBOARD_TEXT_LIMIT = 100000;
export const clipboardAnnotationsSchema = z
  .strictObject({
    version: z.literal(1),
    annotations: z.array(annotationSchema).min(1).max(1000),
  })
  .superRefine(({ annotations }, context) => {
    if (new Set(annotations.map((annotation) => annotation.id)).size !== annotations.length)
      context.addIssue({
        code: "custom",
        message: "Anotações repetidas na área de transferência.",
      });
  });

export type ClipboardPaste =
  | { kind: "annotations"; annotations: Annot[] }
  | { kind: "text"; text: string }
  | { kind: "image"; bytes: Uint8Array }
  | { kind: "empty" };

/** Bound work and serialization before Zod or JSON can clone a huge graph. */
function assertClipboardBudget(value: unknown): void {
  let bytes = 0,
    nodes = 0;
  const pending: unknown[] = [value];
  const stringSize = (text: string): number => {
    if (text.length > CLIPBOARD_LIMIT) return text.length;
    let size = 2;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code < 32) size += [8, 9, 10, 12, 13].includes(code) ? 2 : 6;
      else if (code === 34 || code === 92) size += 2;
      else if (code < 128) size++;
      else if (code < 2048) size += 2;
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        text.charCodeAt(index + 1) >= 0xdc00 &&
        text.charCodeAt(index + 1) <= 0xdfff
      ) {
        size += 4;
        index++;
      } else size += code >= 0xd800 && code <= 0xdfff ? 6 : 3;
      if (size > CLIPBOARD_LIMIT) break;
    }
    return size;
  };
  while (pending.length) {
    if (++nodes > 100000)
      throw new Error("A seleção contém pontos ou elementos demais para copiar.");
    const item = pending.pop();
    if (typeof item === "string") bytes += stringSize(item);
    else if (typeof item === "number") bytes += String(item).length;
    else if (typeof item === "boolean") bytes += item ? 4 : 5;
    else if (item === null) bytes += 4;
    else if (item && typeof item === "object") {
      if (Array.isArray(item)) {
        if (nodes + pending.length + item.length > 100000)
          throw new Error("A seleção contém elementos demais para copiar.");
        bytes += 2 + item.length;
        for (const child of item) pending.push(child);
      } else {
        const entries = Object.entries(item);
        if (entries.length > 1000) throw new Error("Conteúdo inválido na área de transferência.");
        bytes += 2;
        for (const [key, child] of entries) {
          bytes += stringSize(key) + 2;
          if (child !== undefined) pending.push(child);
        }
        if (nodes + pending.length > 100000)
          throw new Error("A seleção contém elementos demais para copiar.");
      }
    } else if (item !== undefined) throw new Error("Conteúdo inválido na área de transferência.");
    if (bytes > CLIPBOARD_LIMIT)
      throw new Error("A seleção excede 16 MB. Copie menos anotações por vez.");
  }
}

export function encodeClipboardAnnotations(value: unknown): {
  json: string;
  text: string;
  annotations: Annot[];
} {
  assertClipboardBudget(value);
  const envelope = clipboardAnnotationsSchema.parse(value),
    json = JSON.stringify(envelope);
  if (new TextEncoder().encode(json).length > CLIPBOARD_LIMIT)
    throw new Error("A seleção excede 16 MB. Copie menos anotações por vez.");
  const text = envelope.annotations
    .flatMap((annotation) =>
      annotation.kind === "text" || annotation.kind === "paragraph" || annotation.kind === "note"
        ? [annotation.text]
        : [],
    )
    .join("\n");
  return { json, text, annotations: envelope.annotations };
}

export function decodeClipboardAnnotations(bytes: Uint8Array): Annot[] {
  if (!bytes.length || bytes.length > CLIPBOARD_LIMIT)
    throw new Error("Conteúdo EdiPDF vazio ou acima de 16 MB na área de transferência.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  assertClipboardBudget(value);
  return clipboardAnnotationsSchema.parse(value).annotations;
}

export function clipboardText(text: string): string {
  if (text.length > CLIPBOARD_TEXT_LIMIT || text.includes("\0"))
    throw new Error("Cole texto sem caracteres nulos, com até 100 mil caracteres.");
  return text.replace(/\r\n?/g, "\n");
}

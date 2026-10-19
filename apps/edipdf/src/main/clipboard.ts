import { ClipboardItem, clipboard, nativeImage } from "electron";
import {
  ANNOTATION_CLIPBOARD_MIME,
  CLIPBOARD_LIMIT,
  CLIPBOARD_TEXT_LIMIT,
  type ClipboardPaste,
  clipboardText,
  decodeClipboardAnnotations,
  encodeClipboardAnnotations,
} from "../shared/clipboard-format.ts";
import { validateRasterImage } from "../shared/raster-image.ts";

/** One OS transaction publishes the editable selection and its interoperable plain text. */
export async function writeAnnotationClipboard(value: unknown): Promise<void> {
  const { json, text, annotations } = encodeClipboardAnnotations(value);
  const representations: Record<string, string | Blob> = {
    [ANNOTATION_CLIPBOARD_MIME]: json,
    "text/plain": text,
  };
  const selected = annotations[0];
  if (annotations.length === 1 && selected?.kind === "image") {
    const bytes = Buffer.from(selected.src.slice(selected.src.indexOf(",") + 1), "base64");
    validateRasterImage(bytes, selected.src.startsWith("data:image/png;") ? "png" : "jpg");
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new Error("A imagem selecionada não pôde ser copiada.");
    const png = image.toPNG();
    if (png.length > CLIPBOARD_LIMIT) throw new Error("A imagem copiada em PNG excede 16 MB.");
    representations["image/png"] = new Blob([new Uint8Array(png)], { type: "image/png" });
  }
  await clipboard.write([new ClipboardItem(representations)]);
}

/** Read only on Paste; never execute HTML, links, filenames or clipboard commands. */
export async function readEditorClipboard(): Promise<ClipboardPaste> {
  const items = await clipboard.read();
  if (items.length > 100) throw new Error("A área de transferência contém itens demais.");
  const annotations = items.find((item) => item.types.includes(ANNOTATION_CLIPBOARD_MIME));
  if (annotations) {
    const blob = await annotations.getType(ANNOTATION_CLIPBOARD_MIME);
    if (blob.size > CLIPBOARD_LIMIT) throw new Error("A seleção copiada excede 16 MB.");
    return {
      kind: "annotations",
      annotations: decodeClipboardAnnotations(new Uint8Array(await blob.arrayBuffer())),
    };
  }
  const image = items.find((item) => item.types.includes("image/png"));
  if (image) {
    const blob = await image.getType("image/png");
    if (!blob.size || blob.size > CLIPBOARD_LIMIT)
      throw new Error("A imagem copiada deve ter até 16 MB.");
    return { kind: "image", bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  const plain = items.find((item) => item.types.includes("text/plain"));
  if (!plain) return { kind: "empty" };
  const blob = await plain.getType("text/plain");
  if (blob.size > CLIPBOARD_TEXT_LIMIT * 4)
    throw new Error("O texto copiado excede o limite local.");
  const text = clipboardText(
    new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer()),
  );
  return text.trim() ? { kind: "text", text } : { kind: "empty" };
}
